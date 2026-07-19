package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestAIUpstreamErrorDetail(t *testing.T) {
	got := aiUpstreamErrorDetail([]byte(`{"error":{"code":"InvalidParameter","message":"reference video fps is invalid"}}`))
	if got != "InvalidParameter reference video fps is invalid" {
		t.Fatalf("detail = %q", got)
	}
}

func TestAIUpstreamErrorDetailExplainsSensitiveVideo(t *testing.T) {
	got := aiUpstreamErrorDetail([]byte(`{"error":{"code":"InputVideoSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input video may contain real person."}}`))
	if !strings.Contains(got, "参考视频疑似包含真人") || !strings.Contains(got, "asset://") {
		t.Fatalf("detail = %q", got)
	}
}

func TestSafeUpstreamTextTruncates(t *testing.T) {
	got := safeUpstreamText(strings.Repeat("错", 320))
	if len([]rune(got)) != 303 {
		t.Fatalf("truncated rune length = %d", len([]rune(got)))
	}
}

func TestAIImageTaskLifecycle(t *testing.T) {
	task := newAIImageTask()
	defer deleteAIImageTask(task.ID)

	if task.ID == "" || task.Status != aiImageTaskPending {
		t.Fatalf("newAIImageTask = %#v", task)
	}

	got, ok := getAIImageTask(task.ID)
	if !ok || got.Status != aiImageTaskPending {
		t.Fatalf("getAIImageTask pending = %#v ok=%v", got, ok)
	}

	finishAIImageTaskSuccess(task.ID, json.RawMessage(`{"data":[{"b64_json":"abc"}]}`))
	got, ok = getAIImageTask(task.ID)
	if !ok || got.Status != aiImageTaskSuccess || string(got.Response) == "" {
		t.Fatalf("getAIImageTask success = %#v ok=%v", got, ok)
	}

	deleteAIImageTask(task.ID)
	if _, ok := getAIImageTask(task.ID); ok {
		t.Fatalf("deleted task still exists")
	}
}

func TestAIUpstreamStatusMessageExplainsGatewayTimeout(t *testing.T) {
	got := aiUpstreamStatusMessage(504, nil)
	if !strings.Contains(got, "耗时过长") {
		t.Fatalf("gateway timeout message = %q", got)
	}
}

func TestResolveAIProxyPathOmniFlash(t *testing.T) {
	zero := model.ModelChannel{BaseURL: "https://llm.zerofall.top", Protocol: "zerofall"}
	if got := resolveAIProxyPath(zero, "omni-flash", "/videos"); got != "/video/generations" {
		t.Fatalf("create path = %q", got)
	}
	if got := resolveAIProxyPath(zero, "omni-flash-vref", "/videos/task-1"); got != "/video/generations/task-1" {
		t.Fatalf("poll path = %q", got)
	}
	// Protocol alone is enough even if model name is not omni-flash*
	if got := resolveAIProxyPath(zero, "custom-video", "/videos"); got != "/video/generations" {
		t.Fatalf("protocol-based rewrite = %q", got)
	}
	// fpbrowser2api veo models stay on OpenAI-style /videos
	fp := model.ModelChannel{BaseURL: "https://fp.example.com", Protocol: "fpbrowser2api"}
	if got := resolveAIProxyPath(fp, "veo-omni-flash", "/videos"); got != "/videos" {
		t.Fatalf("veo path rewritten unexpectedly: %q", got)
	}
}

func TestIsOmniFlashVideo(t *testing.T) {
	if !isOmniFlashVideo("omni-flash") || !isOmniFlashVideo("omni-flash-vref") {
		t.Fatalf("expected omni-flash models to match")
	}
	if isOmniFlashVideo("veo-omni-flash") {
		t.Fatalf("veo-omni-flash should not be treated as ZeroFall omni-flash")
	}
}

func TestNewAIProxyPostRequestConvertsGeminiImageGeneration(t *testing.T) {
	channel := model.ModelChannel{Protocol: "gemini", BaseURL: "https://vip.zpika.com/v1", APIKey: "gemini-key"}
	body := []byte(`{"model":"gemini-3.1-flash-image-preview","prompt":"竖屏海报","quality":"high","size":"9:16"}`)
	request, err := newAIProxyPostRequest(context.Background(), channel, "/images/generations", body, "application/json")
	if err != nil {
		t.Fatalf("newAIProxyPostRequest returned error: %v", err)
	}
	if got := request.URL.String(); got != "https://vip.zpika.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent" {
		t.Fatalf("url = %q", got)
	}
	if got := request.Header.Get("x-goog-api-key"); got != "gemini-key" {
		t.Fatalf("x-goog-api-key = %q", got)
	}
	payload, _ := io.ReadAll(request.Body)
	var value map[string]any
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatalf("payload is invalid JSON: %v", err)
	}
	config := value["generationConfig"].(map[string]any)["imageConfig"].(map[string]any)
	if config["imageSize"] != "4K" || config["aspectRatio"] != "9:16" {
		t.Fatalf("imageConfig = %#v", config)
	}
}

func TestNewAIProxyPostRequestRejectsGeminiNonImageCapability(t *testing.T) {
	channel := model.ModelChannel{Protocol: "gemini", BaseURL: "https://vip.zpika.com", APIKey: "gemini-key"}
	_, err := newAIProxyPostRequest(context.Background(), channel, "/videos", []byte(`{"model":"gemini-video"}`), "application/json")
	if err == nil || !strings.Contains(err.Error(), "仅支持图片生成") {
		t.Fatalf("error = %v", err)
	}
}

func TestNewAIProxyPostRequestFitsOfficialOpenAI4KSquare(t *testing.T) {
	channel := model.ModelChannel{Protocol: "openai", BaseURL: "https://api.openai.com/v1", APIKey: "openai-key"}
	request, err := newAIProxyPostRequest(context.Background(), channel, "/images/generations", []byte(`{"model":"gpt-image-2","quality":"high","size":"4096x4096"}`), "application/json")
	if err != nil {
		t.Fatalf("newAIProxyPostRequest returned error: %v", err)
	}
	body, _ := io.ReadAll(request.Body)
	var payload struct {
		Size string `json:"size"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("payload is invalid JSON: %v", err)
	}
	if payload.Size != "2880x2880" {
		t.Fatalf("size = %q, want 2880x2880", payload.Size)
	}
}

func TestNewAIProxyPostRequestFitsOfficialOpenAI4KSquareEdit(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("model", "gpt-image-2")
	_ = writer.WriteField("quality", "high")
	_ = writer.WriteField("size", "4096x4096")
	file, _ := writer.CreateFormFile("image", "reference.png")
	_, _ = file.Write([]byte("png-data"))
	_ = writer.Close()

	channel := model.ModelChannel{Protocol: "openai", BaseURL: "https://api.openai.com", APIKey: "openai-key"}
	request, err := newAIProxyPostRequest(context.Background(), channel, "/images/edits", body.Bytes(), writer.FormDataContentType())
	if err != nil {
		t.Fatalf("newAIProxyPostRequest returned error: %v", err)
	}
	form, err := request.MultipartReader()
	if err != nil {
		t.Fatalf("MultipartReader returned error: %v", err)
	}
	parsed, err := form.ReadForm(32 << 20)
	if err != nil {
		t.Fatalf("ReadForm returned error: %v", err)
	}
	defer parsed.RemoveAll()
	if got := firstFormValue(parsed.Value, "size"); got != "2880x2880" {
		t.Fatalf("size = %q, want 2880x2880", got)
	}
}

func TestNewAIProxyPostRequestKeepsZpika4KSquare(t *testing.T) {
	channel := model.ModelChannel{Protocol: "openai", BaseURL: "https://vip.zpika.com/v1", APIKey: "zpika-key"}
	request, err := newAIProxyPostRequest(context.Background(), channel, "/images/generations", []byte(`{"model":"gpt-image-2","quality":"high","size":"4096x4096"}`), "application/json")
	if err != nil {
		t.Fatalf("newAIProxyPostRequest returned error: %v", err)
	}
	body, _ := io.ReadAll(request.Body)
	if !bytes.Contains(body, []byte(`"size":"4096x4096"`)) {
		t.Fatalf("payload = %s", body)
	}
}

func TestNewAIProxyPostRequestConvertsGeminiImageEdit(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("model", "gemini-3-pro-image-preview")
	_ = writer.WriteField("prompt", "融合参考图")
	_ = writer.WriteField("quality", "medium")
	_ = writer.WriteField("size", "2048x2048")
	file, _ := writer.CreateFormFile("image", "reference.png")
	_, _ = file.Write([]byte("png-data"))
	_ = writer.Close()

	channel := model.ModelChannel{Protocol: "gemini", BaseURL: "https://vip.zpika.com", APIKey: "gemini-key"}
	request, err := newAIProxyPostRequest(context.Background(), channel, "/images/edits", body.Bytes(), writer.FormDataContentType())
	if err != nil {
		t.Fatalf("newAIProxyPostRequest returned error: %v", err)
	}
	payload, _ := io.ReadAll(request.Body)
	if !bytes.Contains(payload, []byte(`"inlineData"`)) || !bytes.Contains(payload, []byte(`"data":"cG5nLWRhdGE="`)) {
		t.Fatalf("payload = %s", payload)
	}
}

func TestExecuteGeminiImageRequestsRepeatsCountAndMergesCandidates(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"IMAGE_%d"}}]}}]}`, requestCount)
	}))
	defer server.Close()

	channel := model.ModelChannel{Protocol: "gemini", BaseURL: server.URL, APIKey: "gemini-key"}
	body := []byte(`{"model":"gemini-3.1-flash-image-preview","prompt":"生成两张图","n":2}`)
	response, err := executeGeminiImageRequests(context.Background(), channel, "/images/generations", body, "application/json", 2)
	if err != nil {
		t.Fatalf("executeGeminiImageRequests returned error: %v", err)
	}
	if requestCount != 2 {
		t.Fatalf("request count = %d", requestCount)
	}
	var payload struct {
		Candidates []json.RawMessage `json:"candidates"`
	}
	if err := json.Unmarshal(response, &payload); err != nil {
		t.Fatalf("response is invalid JSON: %v", err)
	}
	if len(payload.Candidates) != 2 {
		t.Fatalf("candidate count = %d, response = %s", len(payload.Candidates), response)
	}
}

func TestExecuteGeminiImageRequestsRejectsSuccessfulResponseWithoutImage(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.Header().Set("Content-Type", "application/json")
		if requestCount == 1 {
			_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"IMAGE_1"}}]}}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"promptFeedback":{"blockReason":"SAFETY"}}`))
	}))
	defer server.Close()

	channel := model.ModelChannel{Protocol: "gemini", BaseURL: server.URL, APIKey: "gemini-key"}
	body := []byte(`{"model":"gemini-3.1-flash-image-preview","prompt":"生成两张图","n":2}`)
	_, err := executeGeminiImageRequests(context.Background(), channel, "/images/generations", body, "application/json", 2)
	if err == nil || !strings.Contains(err.Error(), "没有返回图片") {
		t.Fatalf("error = %v", err)
	}
}

func TestAIAsyncTaskChannelBindingKeepsCreateChannelForPolling(t *testing.T) {
	channel := model.ModelChannel{Name: "channel-a", BaseURL: "https://channel-a.example.com", APIKey: "channel-a-key"}
	bindAIAsyncTaskChannel("/videos", channel, []byte(`{"data":{"task_id":"task-sticky-1"}}`))
	defer deleteAIAsyncTaskChannel("task-sticky-1")

	for _, path := range []string{"/videos/task-sticky-1", "/videos/task-sticky-1/content", "/video/generations/task-sticky-1"} {
		got, ok := boundAIAsyncTaskChannel(path)
		if !ok {
			t.Fatalf("channel binding missing for %s", path)
		}
		if got.Name != channel.Name || got.BaseURL != channel.BaseURL || got.APIKey != channel.APIKey {
			t.Fatalf("bound channel for %s = %#v", path, got)
		}
	}
}
