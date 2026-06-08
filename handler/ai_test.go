package handler

import (
	"encoding/json"
	"strings"
	"testing"
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
