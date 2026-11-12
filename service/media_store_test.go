package service

import (
	"bytes"
	"errors"
	"io"
	"net/url"
	"testing"
	"time"
)

func TestSignedMediaURLBindsKeyAndExpiry(t *testing.T) {
	expires := time.Unix(2000000000, 0)
	mediaURL, err := signedMediaURL("https://canvas-media.example.com", "secret", "canvas-references/v1/2026-11-12/key", expires)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(mediaURL)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Path != "/v1/media" || parsed.Query().Get("expires") != "2000000000" || parsed.Query().Get("key") == "" || parsed.Query().Get("sig") == "" {
		t.Fatalf("unexpected signed media URL: %s", mediaURL)
	}
}

func TestBoundedMediaReaderRejectsExtraByte(t *testing.T) {
	reader := &boundedMediaReader{reader: bytes.NewReader([]byte("1234")), remaining: 3}
	_, err := io.ReadAll(reader)
	if !errors.Is(err, ErrMediaTooLarge) {
		t.Fatalf("error = %v, want ErrMediaTooLarge", err)
	}
}

func TestCountingBoundedReaderRecordsOverflow(t *testing.T) {
	reader := &countingBoundedReader{reader: bytes.NewReader([]byte("1234")), remaining: 3}
	_, err := io.ReadAll(reader)
	if !errors.Is(err, ErrMediaTooLarge) || !reader.exceeded || reader.count != 3 {
		t.Fatalf("error=%v exceeded=%t count=%d", err, reader.exceeded, reader.count)
	}
}
