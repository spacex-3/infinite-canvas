package service

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestFetchAdminChannelModelsParsesOpenAIModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"z-model"},{"id":"a-model"},{"id":""}]}`))
	}))
	defer server.Close()

	models, err := fetchAdminChannelModels(model.ModelChannel{
		BaseURL: server.URL,
		APIKey:  "test-key",
	})
	if err != nil {
		t.Fatalf("fetchAdminChannelModels returned error: %v", err)
	}
	if want := []string{"a-model", "z-model"}; !reflect.DeepEqual(models, want) {
		t.Fatalf("models = %#v, want %#v", models, want)
	}
}

func TestFetchAdminChannelModelsReportsArkPlanModelsUnsupported(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/plan/v3/models" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	_, err := fetchAdminChannelModels(model.ModelChannel{
		BaseURL: server.URL + "/api/plan/v3/contents/generations/tasks",
		APIKey:  "test-key",
	})
	if err == nil {
		t.Fatal("expected unsupported /models error")
	}
	if !strings.Contains(err.Error(), "Agent Plan 未提供 OpenAI /models") {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestBuildModelChannelURLNormalizesArkPlanTaskPath(t *testing.T) {
	got := BuildModelChannelURL(model.ModelChannel{BaseURL: "https://ark.cn-beijing.volces.com/api/plan/v3/contents/generations/tasks?debug=1"}, "/models")
	want := "https://ark.cn-beijing.volces.com/api/plan/v3/models"
	if got != want {
		t.Fatalf("BuildModelChannelURL = %q, want %q", got, want)
	}
}

func TestNormalizeSettingsPublishesEnabledChannelModelsAndRepairsDefaults(t *testing.T) {
	settings := normalizeSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				AvailableModels:   []string{"grok-imagine-video", "disabled-model"},
				DefaultModel:      "grok-imagine-video",
				DefaultTextModel:  "missing-text",
				DefaultImageModel: "missing-image",
				DefaultVideoModel: "missing-video",
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{Enabled: true, Models: []string{"gpt-5.5", "doubao-seedream-5.0-lite", "doubao-seedance-2.0-fast", "gpt-5.5"}},
				{Enabled: false, Models: []string{"disabled-model"}},
			},
		},
	})

	channel := settings.Public.ModelChannel
	wantModels := []string{"gpt-5.5", "doubao-seedream-5.0-lite", "doubao-seedance-2.0-fast"}
	if !reflect.DeepEqual(channel.AvailableModels, wantModels) {
		t.Fatalf("available models = %#v, want %#v", channel.AvailableModels, wantModels)
	}
	if channel.DefaultModel != "gpt-5.5" {
		t.Fatalf("default model = %q, want text model", channel.DefaultModel)
	}
	if channel.DefaultTextModel != "gpt-5.5" {
		t.Fatalf("default text model = %q, want text model", channel.DefaultTextModel)
	}
	if channel.DefaultImageModel != "doubao-seedream-5.0-lite" {
		t.Fatalf("default image model = %q, want seedream", channel.DefaultImageModel)
	}
	if channel.DefaultVideoModel != "doubao-seedance-2.0-fast" {
		t.Fatalf("default video model = %q, want seedance", channel.DefaultVideoModel)
	}
}

func TestNormalizeSettingsRepairsImageDefaultAwayFromVideoModel(t *testing.T) {
	settings := normalizeSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{
				DefaultImageModel: "veo-omni-flash",
			},
		},
		Private: model.PrivateSetting{
			Channels: []model.ModelChannel{
				{Enabled: true, Models: []string{"veo-omni-flash", "nana-banana-2", "nana-banana-pro"}},
			},
		},
	})

	if settings.Public.ModelChannel.DefaultImageModel != "nana-banana-2" {
		t.Fatalf("default image model = %q, want nana-banana-2", settings.Public.ModelChannel.DefaultImageModel)
	}
}

func TestNormalizeSettingsForcesEmailVerificationAndDisablesCustomChannel(t *testing.T) {
	allowCustomChannel := true
	settings := normalizeSettings(model.Settings{
		Public: model.PublicSetting{
			ModelChannel: model.PublicModelChannelSetting{AllowCustomChannel: &allowCustomChannel},
			Auth: model.PublicAuthSetting{
				EmailVerification: model.PublicEmailVerificationSetting{Enabled: false},
			},
		},
	})

	if settings.Public.ModelChannel.AllowCustomChannel == nil || *settings.Public.ModelChannel.AllowCustomChannel {
		t.Fatalf("allowCustomChannel = %#v, want false", settings.Public.ModelChannel.AllowCustomChannel)
	}
	if !settings.Public.Auth.EmailVerification.Enabled {
		t.Fatal("email verification should be forced on")
	}
}

func TestImageQualityChannelsPreferMatchingResolutionRules(t *testing.T) {
	channels := []model.ModelChannel{
		{Name: "free", ImageQualities: []string{"low", "medium"}},
		{Name: "paid", ImageQualities: []string{"high"}},
		{Name: "generic"},
	}

	got := imageQualityChannels(channels, "high")
	if len(got) != 1 || got[0].Name != "paid" {
		t.Fatalf("high channels = %#v, want paid only", got)
	}

	got = imageQualityChannels(channels, "medium")
	if len(got) != 1 || got[0].Name != "free" {
		t.Fatalf("medium channels = %#v, want free only", got)
	}
}

func TestReadImageRequestQualityFromExplicitSize(t *testing.T) {
	got := readImageRequestQuality([]byte(`{"model":"gpt-image-2","size":"2160x3840"}`), "application/json")
	if got != "high" {
		t.Fatalf("quality = %q, want high", got)
	}

	got = readImageRequestQuality([]byte(`{"model":"gpt-image-2","size":"2048x2048"}`), "application/json")
	if got != "medium" {
		t.Fatalf("quality = %q, want medium", got)
	}
}
