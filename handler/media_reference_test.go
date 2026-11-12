package handler

import (
	"bytes"
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/service"
)

func TestNormalizeReferenceMediaTypeSupportsAudio(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		ext         string
		wantMime    string
		wantExt     string
	}{
		{name: "mp3 mime", contentType: "audio/mpeg", ext: ".bin", wantMime: "audio/mpeg", wantExt: ".mp3"},
		{name: "wav ext fallback", contentType: "application/octet-stream", ext: ".wav", wantMime: "audio/wav", wantExt: ".wav"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mimeType, ext, ok := normalizeReferenceMediaType(tt.contentType, tt.ext)
			if !ok {
				t.Fatal("expected media type to be accepted")
			}
			if mimeType != tt.wantMime || ext != tt.wantExt {
				t.Fatalf("got (%q, %q), want (%q, %q)", mimeType, ext, tt.wantMime, tt.wantExt)
			}
		})
	}
}

func TestDetectReferenceMediaTypeRejectsMismatches(t *testing.T) {
	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
	mimeType, ext, ok := detectReferenceMediaType(png, "image/png", ".png")
	if !ok || mimeType != "image/png" || ext != ".png" {
		t.Fatalf("valid PNG rejected: mime=%q ext=%q ok=%v", mimeType, ext, ok)
	}
	if _, _, ok := detectReferenceMediaType(png, "image/jpeg", ".jpg"); ok {
		t.Fatal("mismatched PNG payload should be rejected")
	}
	mp4 := []byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}
	if mimeType, ext, ok := detectReferenceMediaType(mp4, "video/mp4", ".mp4"); !ok || mimeType != "video/mp4" || ext != ".mp4" {
		t.Fatalf("valid MP4 rejected: mime=%q ext=%q ok=%v", mimeType, ext, ok)
	}
}

func TestReferenceMediaTypeMaxBytes(t *testing.T) {
	if got := referenceMediaTypeMaxBytes("audio/mpeg"); got != referenceAudioMaxBytes {
		t.Fatalf("audio max bytes = %d, want %d", got, referenceAudioMaxBytes)
	}
	if got := referenceMediaTypeMaxBytes("video/mp4"); got != referenceVideoMaxBytes {
		t.Fatalf("video max bytes = %d, want %d", got, referenceVideoMaxBytes)
	}
	if got := referenceMediaTypeMaxBytes("image/png"); got != referenceImageMaxBytes {
		t.Fatalf("image max bytes = %d, want %d", got, referenceImageMaxBytes)
	}
}

func TestReferenceMediaDirUsesAbsoluteSQLiteDataDir(t *testing.T) {
	previous := config.Cfg
	t.Cleanup(func() { config.Cfg = previous })
	root := t.TempDir()
	config.Cfg = config.Config{StorageDriver: "sqlite", DatabaseDSN: filepath.Join(root, "infinite-canvas.db")}

	if got := service.ReferenceMediaDir(); got != filepath.Join(root, "reference-media") {
		t.Fatalf("referenceMediaDir = %q", got)
	}
}
