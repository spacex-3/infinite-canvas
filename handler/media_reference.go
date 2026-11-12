package handler

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
	"github.com/google/uuid"
)

const (
	referenceMediaMaxBytes    = 80 << 20
	referenceImageMaxBytes    = 30 << 20
	referenceVideoMaxBytes    = 50 << 20
	referenceAudioMaxBytes    = 15 << 20
	referenceImageAllowedText = "jpeg/png/webp/bmp/gif/heic/heif 图片"
	referenceVideoAllowedText = "mp4/mov 视频"
	referenceAudioAllowedText = "mp3/wav 音频"
	referenceMediaAllowedText = referenceImageAllowedText + "、" + referenceVideoAllowedText + "或" + referenceAudioAllowedText
)

type referenceMediaUploadResult struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
	Bytes    int64  `json:"bytes"`
}

func UploadReferenceMedia(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, referenceMediaMaxBytes+1)
	reader, err := r.MultipartReader()
	if err != nil {
		Fail(w, "参考素材过大或上传格式不正确")
		return
	}
	var file io.ReadCloser
	var filename, submittedType string
	for {
		part, nextErr := reader.NextPart()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			Fail(w, "参考素材过大或上传格式不正确")
			return
		}
		if part.FormName() == "file" && part.FileName() != "" {
			file, filename, submittedType = part, part.FileName(), part.Header.Get("Content-Type")
			break
		}
		_ = part.Close()
	}
	if file == nil {
		Fail(w, "请上传参考图片或视频")
		return
	}
	defer file.Close()
	prefix := make([]byte, 512)
	count, readErr := io.ReadFull(file, prefix)
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		Fail(w, "参考素材读取失败")
		return
	}
	prefix = prefix[:count]
	if len(prefix) == 0 {
		Fail(w, "参考素材为空")
		return
	}
	mimeType, ext, ok := detectReferenceMediaType(prefix, submittedType, filepath.Ext(filename))
	if !ok {
		Fail(w, "参考素材格式不支持，请使用 "+referenceMediaAllowedText)
		return
	}
	result, err := service.StoreReferenceMedia(r.Context(), service.ReferenceMediaInput{
		ID: uuid.NewString(), Extension: ext, MimeType: mimeType, Class: strings.SplitN(mimeType, "/", 2)[0],
		Reader: io.MultiReader(bytes.NewReader(prefix), file), MaxBytes: referenceMediaTypeMaxBytes(mimeType),
	})
	if errors.Is(err, service.ErrMediaTooLarge) {
		Fail(w, referenceMediaSizeMessage(mimeType))
		return
	}
	if err != nil {
		Fail(w, "参考素材保存失败")
		return
	}
	OK(w, referenceMediaUploadResult{
		ID: result.ID, URL: result.URL, MimeType: result.MimeType, Bytes: result.Bytes,
	})
}

func ReferenceMedia(w http.ResponseWriter, r *http.Request, id string) {
	if id == "" || id != filepath.Base(id) || strings.Contains(id, "..") {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(referenceMediaDir(), id)
	file, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	if mimeType := mimeTypeByReferenceMediaExt(filepath.Ext(id)); mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, id, info.ModTime(), file)
}

func referenceMediaDir() string {
	return service.ReferenceMediaDir()
}

func normalizeReferenceMediaType(contentType string, ext string) (string, string, bool) {
	contentType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	ext = strings.ToLower(strings.TrimSpace(ext))
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = mimeTypeByReferenceMediaExt(ext)
	}
	if fixedExt := referenceMediaExtByMimeType(contentType); fixedExt != "" {
		return contentType, fixedExt, true
	}
	if mimeType := mimeTypeByReferenceMediaExt(ext); mimeType != "" {
		return mimeType, ext, true
	}
	return "", "", false
}

func detectReferenceMediaType(prefix []byte, contentType string, ext string) (string, string, bool) {
	contentType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	ext = strings.ToLower(strings.TrimSpace(ext))
	detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(prefix), ";")[0]))
	if len(prefix) >= 12 && string(prefix[4:8]) == "ftyp" {
		brand := string(prefix[8:12])
		switch brand {
		case "heic", "heix", "hevc", "hevx":
			detected = "image/heic"
		case "heif", "heim", "heis", "hevm", "mif1", "msf1":
			detected = "image/heif"
		default:
			if ext == ".mov" || contentType == "video/quicktime" || brand == "qt  " {
				detected = "video/quicktime"
			} else {
				detected = "video/mp4"
			}
		}
	}
	if (len(prefix) >= 3 && string(prefix[:3]) == "ID3") || (len(prefix) >= 2 && prefix[0] == 0xff && prefix[1]&0xe0 == 0xe0) {
		detected = "audio/mpeg"
	}
	if len(prefix) >= 12 && string(prefix[:4]) == "RIFF" && string(prefix[8:12]) == "WAVE" {
		detected = "audio/wav"
	}
	detectedExt := referenceMediaExtByMimeType(detected)
	if detectedExt == "" {
		return "", "", false
	}
	if contentType != "" && contentType != "application/octet-stream" {
		submittedExt := referenceMediaExtByMimeType(contentType)
		if submittedExt == "" || !sameReferenceMediaType(contentType, detected) {
			return "", "", false
		}
	}
	if extType := mimeTypeByReferenceMediaExt(ext); extType == "" || !sameReferenceMediaType(extType, detected) {
		return "", "", false
	}
	return detected, detectedExt, true
}

func sameReferenceMediaType(left, right string) bool {
	left = strings.ToLower(left)
	right = strings.ToLower(right)
	if left == right || left == "image/jpg" && right == "image/jpeg" || left == "audio/mp3" && right == "audio/mpeg" ||
		(left == "audio/x-wav" || left == "audio/wave") && right == "audio/wav" {
		return true
	}
	return strings.HasPrefix(left, "video/") && strings.HasPrefix(right, "video/")
}

func referenceMediaExtByMimeType(mimeType string) string {
	switch strings.ToLower(mimeType) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/bmp":
		return ".bmp"
	case "image/gif":
		return ".gif"
	case "image/heic":
		return ".heic"
	case "image/heif":
		return ".heif"
	case "video/mp4":
		return ".mp4"
	case "video/quicktime", "video/mov":
		return ".mov"
	case "audio/mpeg", "audio/mp3":
		return ".mp3"
	case "audio/wav", "audio/x-wav", "audio/wave":
		return ".wav"
	default:
		return ""
	}
}

func mimeTypeByReferenceMediaExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	case ".gif":
		return "image/gif"
	case ".heic":
		return "image/heic"
	case ".heif":
		return "image/heif"
	case ".mp4":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	default:
		return ""
	}
}

func referenceMediaTypeMaxBytes(mimeType string) int64 {
	if strings.HasPrefix(mimeType, "image/") {
		return referenceImageMaxBytes
	}
	if strings.HasPrefix(mimeType, "video/") {
		return referenceVideoMaxBytes
	}
	if strings.HasPrefix(mimeType, "audio/") {
		return referenceAudioMaxBytes
	}
	return referenceMediaMaxBytes
}

func referenceMediaSizeMessage(mimeType string) string {
	if strings.HasPrefix(mimeType, "image/") {
		return "参考图片超过大小限制，请使用 30MB 以内的图片"
	}
	if strings.HasPrefix(mimeType, "video/") {
		return "参考视频超过大小限制，请使用 50MB 以内的 mp4/mov 视频"
	}
	if strings.HasPrefix(mimeType, "audio/") {
		return "参考音频超过大小限制，请使用 15MB 以内的 mp3/wav 音频"
	}
	return "参考素材超过大小限制"
}
