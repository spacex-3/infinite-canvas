package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type geminiImageInput struct {
	Model      string
	Prompt     string
	Quality    string
	Size       string
	References []geminiImageReference
}

type geminiImageReference struct {
	MimeType string
	Data     string
}

func newGeminiImageRequest(ctx context.Context, channel model.ModelChannel, body []byte, contentType string) (*http.Request, error) {
	input, err := readGeminiImageInput(body, contentType)
	if err != nil {
		return nil, err
	}
	parts := []any{map[string]any{"text": input.Prompt}}
	for _, reference := range input.References {
		parts = append(parts, map[string]any{"inlineData": map[string]string{"mimeType": reference.MimeType, "data": reference.Data}})
	}
	imageConfig := map[string]string{"imageSize": geminiImageSize(input.Quality, input.Size)}
	if ratio := geminiAspectRatio(input.Size); ratio != "" {
		imageConfig["aspectRatio"] = ratio
	}
	payload, err := json.Marshal(map[string]any{
		"contents": []any{map[string]any{"role": "user", "parts": parts}},
		"generationConfig": map[string]any{"imageConfig": imageConfig},
	})
	if err != nil {
		return nil, err
	}
	path := "/models/" + url.PathEscape(input.Model) + ":generateContent"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, service.BuildGeminiChannelURL(channel, path), bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("x-goog-api-key", channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	return request, nil
}

func executeGeminiImageRequests(ctx context.Context, channel model.ModelChannel, path string, body []byte, contentType string, count int) ([]byte, error) {
	if count < 1 {
		count = 1
	}
	responses := make([][]byte, 0, count)
	for range count {
		request, err := newGeminiImageRequest(ctx, channel, body, contentType)
		if err != nil {
			return nil, err
		}
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			return nil, geminiImageExecutionError{aiProxyRequestErrorMessage(err)}
		}
		responseBody, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil {
			return nil, geminiImageExecutionError{"AI 接口响应读取失败"}
		}
		if response.StatusCode >= http.StatusBadRequest {
			return nil, geminiImageExecutionError{aiUpstreamStatusMessage(response.StatusCode, responseBody)}
		}
		if !json.Valid(responseBody) {
			return nil, geminiImageExecutionError{"AI 接口返回格式不正确"}
		}
		responses = append(responses, responseBody)
	}
	return mergeGeminiImageResponses(responses)
}

func mergeGeminiImageResponses(responses [][]byte) ([]byte, error) {
	merged := map[string]json.RawMessage{}
	candidates := make([]json.RawMessage, 0, len(responses))
	for index, response := range responses {
		if !geminiImageResponseHasImage(response) {
			return nil, geminiImageExecutionError{"Gemini 接口没有返回图片，可能未通过内容审查"}
		}
		var payload map[string]json.RawMessage
		if err := json.Unmarshal(response, &payload); err != nil {
			return nil, geminiImageExecutionError{"AI 接口返回格式不正确"}
		}
		if index == 0 {
			merged = payload
		}
		var batch []json.RawMessage
		if raw := payload["candidates"]; len(raw) > 0 {
			if err := json.Unmarshal(raw, &batch); err != nil {
				return nil, geminiImageExecutionError{"AI 接口返回格式不正确"}
			}
		}
		candidates = append(candidates, batch...)
	}
	encodedCandidates, err := json.Marshal(candidates)
	if err != nil {
		return nil, err
	}
	merged["candidates"] = encodedCandidates
	return json.Marshal(merged)
}

func geminiImageResponseHasImage(response []byte) bool {
	var payload struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					InlineData struct {
						Data string `json:"data"`
					} `json:"inlineData"`
					FileData struct {
						FileURI string `json:"fileUri"`
					} `json:"fileData"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if json.Unmarshal(response, &payload) != nil {
		return false
	}
	for _, candidate := range payload.Candidates {
		for _, part := range candidate.Content.Parts {
			if strings.TrimSpace(part.InlineData.Data) != "" || strings.TrimSpace(part.FileData.FileURI) != "" {
				return true
			}
		}
	}
	return false
}

func isGeminiImageRequest(channel model.ModelChannel, path string) bool {
	return strings.EqualFold(strings.TrimSpace(channel.Protocol), "gemini") && (path == "/images/generations" || path == "/images/edits")
}

func readGeminiImageInput(body []byte, contentType string) (geminiImageInput, error) {
	if !strings.HasPrefix(contentType, "multipart/form-data") {
		var input struct {
			Model   string `json:"model"`
			Prompt  string `json:"prompt"`
			Quality string `json:"quality"`
			Size    string `json:"size"`
		}
		if err := json.Unmarshal(body, &input); err != nil {
			return geminiImageInput{}, err
		}
		return validateGeminiImageInput(geminiImageInput{Model: input.Model, Prompt: input.Prompt, Quality: input.Quality, Size: input.Size})
	}

	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return geminiImageInput{}, err
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(64 << 20)
	if err != nil {
		return geminiImageInput{}, err
	}
	defer form.RemoveAll()
	if len(form.File["mask"]) > 0 {
		return geminiImageInput{}, geminiImageRequestError{"Gemini 原生图片协议暂不支持蒙版编辑"}
	}
	input := geminiImageInput{Model: firstFormValue(form.Value, "model"), Prompt: firstFormValue(form.Value, "prompt"), Quality: firstFormValue(form.Value, "quality"), Size: firstFormValue(form.Value, "size")}
	for _, header := range form.File["image"] {
		file, err := header.Open()
		if err != nil {
			return geminiImageInput{}, err
		}
		data, readErr := io.ReadAll(io.LimitReader(file, 32<<20))
		_ = file.Close()
		if readErr != nil {
			return geminiImageInput{}, readErr
		}
		mimeType := header.Header.Get("Content-Type")
		if mimeType == "" || mimeType == "application/octet-stream" {
			mimeType = http.DetectContentType(data)
		}
		input.References = append(input.References, geminiImageReference{MimeType: mimeType, Data: base64.StdEncoding.EncodeToString(data)})
	}
	return validateGeminiImageInput(input)
}

func validateGeminiImageInput(input geminiImageInput) (geminiImageInput, error) {
	input.Model = strings.TrimSpace(input.Model)
	input.Prompt = strings.TrimSpace(input.Prompt)
	if input.Model == "" {
		return geminiImageInput{}, geminiImageRequestError{"缺少 Gemini 图片模型"}
	}
	if input.Prompt == "" {
		return geminiImageInput{}, geminiImageRequestError{"缺少图片提示词"}
	}
	return input, nil
}

func firstFormValue(values map[string][]string, key string) string {
	if len(values[key]) == 0 {
		return ""
	}
	return values[key][0]
}

func geminiImageSize(quality string, size string) string {
	switch strings.ToLower(strings.TrimSpace(quality)) {
	case "high", "4k":
		return "4K"
	case "medium", "hd", "2k":
		return "2K"
	}
	var width, height int
	value := strings.NewReplacer("*", "x", "×", "x", "X", "x").Replace(size)
	if _, err := fmt.Sscanf(value, "%dx%d", &width, &height); err == nil {
		if width >= 3000 || height >= 3000 {
			return "4K"
		}
		if width >= 1800 || height >= 1800 {
			return "2K"
		}
	}
	return "1K"
}

func geminiAspectRatio(size string) string {
	value := strings.TrimSpace(size)
	if value == "" || strings.EqualFold(value, "auto") {
		return ""
	}
	if strings.Contains(value, ":") {
		return value
	}
	value = strings.NewReplacer("*", "x", "×", "x", "X", "x").Replace(value)
	var width, height int
	if _, err := fmt.Sscanf(value, "%dx%d", &width, &height); err != nil || width <= 0 || height <= 0 {
		return ""
	}
	divisor := gcdInt(width, height)
	return fmt.Sprintf("%d:%d", width/divisor, height/divisor)
}

func gcdInt(a int, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a < 0 {
		return -a
	}
	if a == 0 {
		return 1
	}
	return a
}

type geminiImageRequestError struct {
	message string
}

func (err geminiImageRequestError) Error() string {
	return err.message
}

func (err geminiImageRequestError) SafeMessage() string {
	return err.message
}

type geminiImageExecutionError struct {
	message string
}

func (err geminiImageExecutionError) Error() string {
	return err.message
}

func (err geminiImageExecutionError) SafeMessage() string {
	return err.message
}
