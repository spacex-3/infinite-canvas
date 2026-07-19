package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime"
	"mime/multipart"
	"net/url"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

const (
	officialOpenAIImageMaxEdge   = 3840
	officialOpenAIImageMaxPixels = 8294400
	imageDimensionStep           = 16
)

func normalizeOfficialOpenAIImageRequest(channel model.ModelChannel, path string, body []byte, contentType string) ([]byte, error) {
	if !isOfficialOpenAIImageEndpoint(channel.BaseURL) || (path != "/images/generations" && path != "/images/edits") {
		return body, nil
	}
	if strings.HasPrefix(strings.ToLower(contentType), "multipart/form-data") {
		return normalizeOfficialOpenAIMultipartImageRequest(body, contentType)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	var size string
	if json.Unmarshal(payload["size"], &size) != nil || size == "" {
		return body, nil
	}
	normalized := normalizeOfficialOpenAIImageSize(size)
	if normalized == size {
		return body, nil
	}
	payload["size"], _ = json.Marshal(normalized)
	return json.Marshal(payload)
}

func normalizeOfficialOpenAIMultipartImageRequest(body []byte, contentType string) ([]byte, error) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return nil, err
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	var output bytes.Buffer
	writer := multipart.NewWriter(&output)
	if err := writer.SetBoundary(params["boundary"]); err != nil {
		return nil, err
	}
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		data, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return nil, err
		}
		if part.FormName() == "size" {
			data = []byte(normalizeOfficialOpenAIImageSize(string(data)))
		}
		target, err := writer.CreatePart(part.Header)
		if err != nil {
			return nil, err
		}
		if _, err := target.Write(data); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func normalizeOfficialOpenAIImageSize(value string) string {
	var width, height int
	normalized := strings.NewReplacer("*", "x", "×", "x", "X", "x").Replace(strings.TrimSpace(value))
	if _, err := fmt.Sscanf(normalized, "%dx%d", &width, &height); err != nil || width <= 0 || height <= 0 {
		return value
	}
	if width <= officialOpenAIImageMaxEdge && height <= officialOpenAIImageMaxEdge && width*height <= officialOpenAIImageMaxPixels {
		return fmt.Sprintf("%dx%d", width, height)
	}
	scale := math.Min(
		float64(officialOpenAIImageMaxEdge)/float64(max(width, height)),
		math.Sqrt(float64(officialOpenAIImageMaxPixels)/float64(width*height)),
	)
	width = int(math.Floor(float64(width)*scale/float64(imageDimensionStep))) * imageDimensionStep
	height = int(math.Floor(float64(height)*scale/float64(imageDimensionStep))) * imageDimensionStep
	return fmt.Sprintf("%dx%d", width, height)
}

func isOfficialOpenAIImageEndpoint(baseURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	return err == nil && strings.EqualFold(parsed.Hostname(), "api.openai.com")
}
