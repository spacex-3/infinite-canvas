package handler

import (
	"encoding/json"
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
