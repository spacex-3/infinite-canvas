package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
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
	Progress  int             `json:"progress,omitempty"`
	Msg       string          `json:"msg,omitempty"`
	Response  json.RawMessage `json:"response,omitempty"`
	OwnerID   string          `json:"-"`
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
	if !ok || !ownsAIImageTask(r, task) {
		Fail(w, "生成任务不存在或已过期")
		return
	}
	OK(w, task)
}

func AIImageTaskContent(w http.ResponseWriter, r *http.Request, id string, index int) {
	task, ok := getAIImageTask(id)
	if !ok || !ownsAIImageTask(r, task) || task.Status != aiImageTaskSuccess {
		Fail(w, "生成任务不存在、未完成或已过期")
		return
	}
	var payload struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if json.Unmarshal(task.Response, &payload) != nil || index < 0 || index >= len(payload.Data) {
		Fail(w, "图片制品不存在")
		return
	}
	target, err := url.Parse(strings.TrimSpace(payload.Data[index].URL))
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" {
		Fail(w, "图片制品地址无效")
		return
	}
	response, err := service.OpenRemoteMedia(r.Context(), target.String())
	if err != nil {
		Fail(w, "图片制品读取失败，请重新下载")
		return
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		Fail(w, "图片制品读取失败，请重新下载")
		return
	}
	if response.ContentLength > 64<<20 {
		Fail(w, "图片制品超过 64MiB，无法保存")
		return
	}
	contentType := strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0])
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, io.LimitReader(response.Body, (64<<20)+1))
}

func ownsAIImageTask(r *http.Request, task aiImageTask) bool {
	user, ok := service.UserFromContext(r.Context())
	return ok && task.OwnerID == user.ID
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
	path = resolveAIProxyPath(channel, modelName, path)
	task := newAIImageTask(user.ID)
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
	if isGeminiImageRequest(channel, path) {
		responseBody, err := executeGeminiImageRequests(ctx, channel, path, body, contentType, readAIRequestCount(body, contentType))
		if err != nil {
			refundAIImageTaskCredits(userID, modelName, credits, path)
			finishAIImageTaskFailed(id, safeAIErrorMessage(err, "AI 接口请求失败"))
			return
		}
		finishAIImageTaskSuccess(id, json.RawMessage(responseBody))
		return
	}
	request, err := newAIProxyPostRequest(ctx, channel, path, body, contentType)
	if err != nil {
		refundAIImageTaskCredits(userID, modelName, credits, path)
		finishAIImageTaskFailed(id, safeAIErrorMessage(err, "AI 接口请求失败"))
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
	responseBody, err = waitForUpstreamImageTask(ctx, channel, path, responseBody, id)
	if err != nil {
		refundAIImageTaskCredits(userID, modelName, credits, path)
		finishAIImageTaskFailed(id, safeAIErrorMessage(err, "图片任务查询失败"))
		return
	}
	finishAIImageTaskSuccess(id, json.RawMessage(responseBody))
}

type upstreamImageTask struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	Progress any    `json:"progress"`
	Error    struct {
		Message string `json:"message"`
	} `json:"error"`
	Msg string `json:"msg"`
}

type upstreamImageTaskError string

func (err upstreamImageTaskError) Error() string       { return string(err) }
func (err upstreamImageTaskError) SafeMessage() string { return string(err) }

func waitForUpstreamImageTask(ctx context.Context, channel model.ModelChannel, path string, responseBody []byte, localTaskID string) ([]byte, error) {
	var task upstreamImageTask
	if json.Unmarshal(responseBody, &task) != nil || task.ID == "" || task.Status == "" {
		return responseBody, nil
	}
	for {
		status := strings.ToLower(strings.TrimSpace(task.Status))
		updateAIImageTaskProgress(localTaskID, normalizeUpstreamImageProgress(task.Progress))
		if status == "completed" || status == "success" || status == "succeeded" {
			return responseBody, nil
		}
		if status == "failed" || status == "failure" || status == "error" || status == "cancelled" || status == "canceled" {
			message := strings.TrimSpace(task.Error.Message)
			if message == "" {
				message = strings.TrimSpace(task.Msg)
			}
			if message == "" {
				message = "图片生成失败"
			}
			return nil, upstreamImageTaskError(message)
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(5 * time.Second):
		}

		request, err := http.NewRequestWithContext(ctx, http.MethodGet, service.BuildModelChannelURL(channel, path+"/"+url.PathEscape(task.ID)), nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("Authorization", "Bearer "+channel.APIKey)
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			return nil, err
		}
		body, readErr := io.ReadAll(response.Body)
		response.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if response.StatusCode >= http.StatusBadRequest {
			return nil, upstreamImageTaskError(aiUpstreamStatusMessage(response.StatusCode, body))
		}
		if !json.Valid(body) || json.Unmarshal(body, &task) != nil {
			return nil, upstreamImageTaskError("图片任务返回格式不正确")
		}
		responseBody = body
	}
}

func normalizeUpstreamImageProgress(value any) int {
	var progress float64
	switch typed := value.(type) {
	case float64:
		progress = typed
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(typed, "%")), 64)
		if err != nil {
			return 0
		}
		progress = parsed
	default:
		return 0
	}
	if progress > 0 && progress <= 1 {
		progress *= 100
	}
	if progress < 0 {
		return 0
	}
	if progress > 100 {
		return 100
	}
	return int(progress + 0.5)
}

func refundAIImageTaskCredits(userID string, modelName string, credits int, path string) {
	if err := service.RefundUserCredits(userID, modelName, credits, path); err != nil {
		log.Printf("AI image task refund credits failed: user=%s model=%s credits=%d err=%v", userID, modelName, credits, err)
	}
}

func newAIProxyPostRequest(ctx context.Context, channel model.ModelChannel, path string, body []byte, contentType string) (*http.Request, error) {
	if strings.EqualFold(strings.TrimSpace(channel.Protocol), "gemini") {
		if isGeminiImageRequest(channel, path) {
			return newGeminiImageRequest(ctx, channel, body, contentType)
		}
		return nil, geminiImageRequestError{"Gemini 原生图片协议仅支持图片生成和参考图编辑"}
	}
	body = normalizeArkSeedanceRequest(channel, path, body, contentType)
	body, err := normalizeOfficialOpenAIImageRequest(channel, path, body, contentType)
	if err != nil {
		return nil, err
	}
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

func normalizeArkSeedanceRequest(channel model.ModelChannel, path string, body []byte, contentType string) []byte {
	if path != "/contents/generations/tasks" || !strings.Contains(strings.ToLower(contentType), "application/json") || !strings.Contains(strings.ToLower(channel.BaseURL), "/api/plan/v3") {
		return body
	}
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		return body
	}
	delete(payload, "prompt")
	delete(payload, "seconds")
	delete(payload, "metadata")
	normalized, err := json.Marshal(payload)
	if err != nil {
		return body
	}
	return normalized
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

func newAIImageTask(ownerID string) aiImageTask {
	cleanupAIImageTasks()
	now := time.Now()
	task := aiImageTask{ID: "img-task-" + uuid.NewString(), Status: aiImageTaskPending, OwnerID: ownerID, CreatedAt: now, UpdatedAt: now}
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

func updateAIImageTaskProgress(id string, progress int) {
	updateAIImageTask(id, func(task aiImageTask) aiImageTask {
		task.Progress = progress
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
