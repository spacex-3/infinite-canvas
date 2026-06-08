package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/google/uuid"
)

const (
	aiImageTaskPending = "pending"
	aiImageTaskSuccess = "success"
	aiImageTaskFailed  = "failed"
	aiImageTaskTTL     = 30 * time.Minute
	aiImageTaskTimeout = 15 * time.Minute
)

var aiImageTaskSlots = make(chan struct{}, 2)

type aiImageTask struct {
	ID        string          `json:"id"`
	Status    string          `json:"status"`
	Msg       string          `json:"msg,omitempty"`
	Response  json.RawMessage `json:"response,omitempty"`
	CreatedAt time.Time       `json:"-"`
	UpdatedAt time.Time       `json:"-"`
}

var aiImageTasks = struct {
	sync.Mutex
	items map[string]aiImageTask
}{items: map[string]aiImageTask{}}

func AIImagesGenerationsTask(w http.ResponseWriter, r *http.Request) {
	startAIImageTask(w, r, "/images/generations")
}

func AIImagesEditsTask(w http.ResponseWriter, r *http.Request) {
	startAIImageTask(w, r, "/images/edits")
}

func AIImageTask(w http.ResponseWriter, r *http.Request, id string) {
	task, ok := getAIImageTask(id)
	if !ok {
		Fail(w, "生成任务不存在或已过期")
		return
	}
	OK(w, task)
}

func startAIImageTask(w http.ResponseWriter, r *http.Request, path string) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		log.Printf("AI image task request read failed: %v", err)
		Fail(w, "AI 接口请求失败")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	credits, err := service.ModelCost(modelName)
	if err != nil {
		log.Printf("AI image task read model cost failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	credits *= readAIRequestCount(body, contentType)
	channel, err := service.SelectModelChannelForAIRequest(modelName, path, body, contentType)
	if err != nil {
		log.Printf("AI image task select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	path = resolveAIProxyPath(channel.BaseURL, modelName, path)
	task := newAIImageTask()
	go runAIImageTask(task.ID, channel, modelName, path, body, contentType, user.ID, credits)
	OK(w, task)
}

func runAIImageTask(id string, channel model.ModelChannel, modelName string, path string, body []byte, contentType string, userID string, credits int) {
	aiImageTaskSlots <- struct{}{}
	defer func() { <-aiImageTaskSlots }()

	if err := service.ConsumeUserCredits(userID, modelName, credits, path); err != nil {
		finishAIImageTaskFailed(id, safeAIErrorMessage(err, "AI 接口请求失败"))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), aiImageTaskTimeout)
	defer cancel()
	request, err := newAIProxyPostRequest(ctx, channel, path, body, contentType)
	if err != nil {
		refundAIImageTaskCredits(userID, modelName, credits, path)
		finishAIImageTaskFailed(id, "AI 接口请求失败")
		return
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI image task request failed: url=%s err=%v", request.URL.String(), err)
		refundAIImageTaskCredits(userID, modelName, credits, path)
		finishAIImageTaskFailed(id, aiProxyRequestErrorMessage(err))
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		log.Printf("AI image task upstream error: url=%s status=%d body=%s", request.URL.String(), response.StatusCode, safeUpstreamText(string(body)))
		refundAIImageTaskCredits(userID, modelName, credits, path)
		finishAIImageTaskFailed(id, aiUpstreamStatusMessage(response.StatusCode, body))
		return
	}

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		log.Printf("AI image task response read failed: url=%s err=%v", request.URL.String(), err)
		refundAIImageTaskCredits(userID, modelName, credits, path)
		finishAIImageTaskFailed(id, "AI 接口响应读取失败")
		return
	}
	if !json.Valid(responseBody) {
		log.Printf("AI image task response invalid json: url=%s body=%s", request.URL.String(), safeUpstreamText(string(responseBody)))
		refundAIImageTaskCredits(userID, modelName, credits, path)
		finishAIImageTaskFailed(id, "AI 接口返回格式不正确")
		return
	}
	finishAIImageTaskSuccess(id, json.RawMessage(responseBody))
}

func refundAIImageTaskCredits(userID string, modelName string, credits int, path string) {
	if err := service.RefundUserCredits(userID, modelName, credits, path); err != nil {
		log.Printf("AI image task refund credits failed: user=%s model=%s credits=%d err=%v", userID, modelName, credits, err)
	}
}

func newAIProxyPostRequest(ctx context.Context, channel model.ModelChannel, path string, body []byte, contentType string) (*http.Request, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, service.BuildModelChannelURL(channel, path), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	return request, nil
}

func aiProxyRequestErrorMessage(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "AI 接口请求超时，上游生成耗时过长，请稍后重试"
	}
	if errors.Is(err, context.Canceled) {
		return "AI 接口请求已中断"
	}
	if strings.Contains(strings.ToLower(err.Error()), "unexpected eof") {
		return "AI 接口连接被上游或反代提前断开，请稍后重试"
	}
	return "AI 接口请求失败"
}

func safeAIErrorMessage(err error, fallback string) string {
	if safe, ok := err.(interface{ SafeMessage() string }); ok {
		return safe.SafeMessage()
	}
	return fallback
}

func newAIImageTask() aiImageTask {
	cleanupAIImageTasks()
	now := time.Now()
	task := aiImageTask{ID: "img-task-" + uuid.NewString(), Status: aiImageTaskPending, CreatedAt: now, UpdatedAt: now}
	aiImageTasks.Lock()
	if aiImageTasks.items == nil {
		aiImageTasks.items = map[string]aiImageTask{}
	}
	aiImageTasks.items[task.ID] = task
	aiImageTasks.Unlock()
	return task
}

func getAIImageTask(id string) (aiImageTask, bool) {
	aiImageTasks.Lock()
	defer aiImageTasks.Unlock()
	task, ok := aiImageTasks.items[id]
	return task, ok
}

func finishAIImageTaskSuccess(id string, response json.RawMessage) {
	updateAIImageTask(id, func(task aiImageTask) aiImageTask {
		task.Status = aiImageTaskSuccess
		task.Response = response
		task.Msg = ""
		return task
	})
}

func finishAIImageTaskFailed(id string, msg string) {
	updateAIImageTask(id, func(task aiImageTask) aiImageTask {
		task.Status = aiImageTaskFailed
		task.Msg = msg
		task.Response = nil
		return task
	})
}

func updateAIImageTask(id string, update func(aiImageTask) aiImageTask) {
	aiImageTasks.Lock()
	defer aiImageTasks.Unlock()
	task, ok := aiImageTasks.items[id]
	if !ok {
		return
	}
	task = update(task)
	task.UpdatedAt = time.Now()
	aiImageTasks.items[id] = task
}

func deleteAIImageTask(id string) {
	aiImageTasks.Lock()
	delete(aiImageTasks.items, id)
	aiImageTasks.Unlock()
}

func cleanupAIImageTasks() {
	expiresAt := time.Now().Add(-aiImageTaskTTL)
	aiImageTasks.Lock()
	for id, task := range aiImageTasks.items {
		if task.UpdatedAt.Before(expiresAt) {
			delete(aiImageTasks.items, id)
		}
	}
	aiImageTasks.Unlock()
}
