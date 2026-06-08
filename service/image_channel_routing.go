package service

import (
	"bytes"
	"encoding/json"
	"mime"
	"mime/multipart"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

func isImageRequestPath(path string) bool {
	return path == "/images/generations" || path == "/images/edits"
}

func imageQualityChannels(channels []model.ModelChannel, quality string) []model.ModelChannel {
	quality = normalizeImageQuality(quality)
	if quality == "" {
		return channels
	}
	matching := []model.ModelChannel{}
	unrestricted := []model.ModelChannel{}
	hasRules := false
	for _, channel := range channels {
		qualities := normalizeImageQualities(channel.ImageQualities)
		if len(qualities) == 0 {
			unrestricted = append(unrestricted, channel)
			continue
		}
		hasRules = true
		if containsImageQuality(qualities, quality) {
			matching = append(matching, channel)
		}
	}
	if !hasRules {
		return channels
	}
	if len(matching) > 0 {
		return matching
	}
	if len(unrestricted) > 0 {
		return unrestricted
	}
	return channels
}

func readImageRequestQuality(body []byte, contentType string) string {
	contentType = strings.ToLower(contentType)
	if strings.HasPrefix(contentType, "multipart/form-data") {
		quality, size := readMultipartImageQualityAndSize(body, contentType)
		return resolveImageRequestQuality(quality, size)
	}
	var payload struct {
		Quality string `json:"quality"`
		Size    string `json:"size"`
	}
	_ = json.Unmarshal(body, &payload)
	return resolveImageRequestQuality(payload.Quality, payload.Size)
}

func readMultipartImageQualityAndSize(body []byte, contentType string) (string, string) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return "", ""
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
	if err != nil {
		return "", ""
	}
	defer form.RemoveAll()
	return firstFormValue(form.Value["quality"]), firstFormValue(form.Value["size"])
}

func resolveImageRequestQuality(quality string, size string) string {
	if normalized := normalizeImageQuality(quality); normalized != "" {
		return normalized
	}
	return imageQualityFromSize(size)
}

func normalizeImageQualities(values []string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		quality := normalizeImageQuality(value)
		if quality == "" || seen[quality] {
			continue
		}
		seen[quality] = true
		result = append(result, quality)
	}
	return result
}

func normalizeImageQuality(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "standard", "1k":
		return "low"
	case "medium", "hd", "2k":
		return "medium"
	case "high", "4k":
		return "high"
	default:
		return ""
	}
}

func imageQualityFromSize(size string) string {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(size)), "x")
	if len(parts) != 2 {
		return ""
	}
	width := parsePositiveInt(parts[0])
	height := parsePositiveInt(parts[1])
	if width <= 0 || height <= 0 {
		return ""
	}
	longEdge := width
	if height > longEdge {
		longEdge = height
	}
	if longEdge > 2048 {
		return "high"
	}
	if longEdge > 1024 {
		return "medium"
	}
	return "low"
}

func parsePositiveInt(value string) int {
	result, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || result <= 0 {
		return 0
	}
	return result
}

func containsImageQuality(values []string, quality string) bool {
	for _, value := range values {
		if value == quality {
			return true
		}
	}
	return false
}

func firstFormValue(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}
