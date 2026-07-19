package handler

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/model"
)

const aiAsyncTaskChannelTTL = 24 * time.Hour

type aiAsyncTaskChannelBinding struct {
	Channel   model.ModelChannel
	ExpiresAt time.Time
}

var aiAsyncTaskChannels = struct {
	sync.Mutex
	items map[string]aiAsyncTaskChannelBinding
}{items: map[string]aiAsyncTaskChannelBinding{}}

func bindAIAsyncTaskChannel(path string, channel model.ModelChannel, body []byte) {
	if !isAIAsyncCreatePath(path) {
		return
	}
	taskID := readAIAsyncTaskID(body)
	if taskID == "" {
		return
	}
	now := time.Now()
	aiAsyncTaskChannels.Lock()
	cleanupAIAsyncTaskChannelsLocked(now)
	aiAsyncTaskChannels.items[taskID] = aiAsyncTaskChannelBinding{Channel: channel, ExpiresAt: now.Add(aiAsyncTaskChannelTTL)}
	aiAsyncTaskChannels.Unlock()
}

func boundAIAsyncTaskChannel(path string) (model.ModelChannel, bool) {
	taskID := aiAsyncTaskIDFromPath(path)
	if taskID == "" {
		return model.ModelChannel{}, false
	}
	now := time.Now()
	aiAsyncTaskChannels.Lock()
	defer aiAsyncTaskChannels.Unlock()
	cleanupAIAsyncTaskChannelsLocked(now)
	binding, ok := aiAsyncTaskChannels.items[taskID]
	return binding.Channel, ok
}

func deleteAIAsyncTaskChannel(taskID string) {
	aiAsyncTaskChannels.Lock()
	delete(aiAsyncTaskChannels.items, taskID)
	aiAsyncTaskChannels.Unlock()
}

func cleanupAIAsyncTaskChannelsLocked(now time.Time) {
	for taskID, binding := range aiAsyncTaskChannels.items {
		if !binding.ExpiresAt.After(now) {
			delete(aiAsyncTaskChannels.items, taskID)
		}
	}
}

func isAIAsyncCreatePath(path string) bool {
	switch strings.TrimRight(path, "/") {
	case "/videos", "/video/generations", "/contents/generations/tasks":
		return true
	default:
		return false
	}
}

func readAIAsyncTaskID(body []byte) string {
	var payload struct {
		ID     string          `json:"id"`
		TaskID string          `json:"task_id"`
		Data   json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return ""
	}
	if taskID := strings.TrimSpace(payload.ID); taskID != "" {
		return taskID
	}
	if taskID := strings.TrimSpace(payload.TaskID); taskID != "" {
		return taskID
	}
	if len(payload.Data) > 0 && string(payload.Data) != "null" {
		return readAIAsyncTaskID(payload.Data)
	}
	return ""
}

func aiAsyncTaskIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 {
		return ""
	}
	if parts[len(parts)-1] == "content" {
		parts = parts[:len(parts)-1]
	}
	if len(parts) == 0 {
		return ""
	}
	taskID := strings.TrimSpace(parts[len(parts)-1])
	switch taskID {
	case "videos", "generations", "tasks":
		return ""
	default:
		return taskID
	}
}
