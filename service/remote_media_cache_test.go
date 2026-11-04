package service

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestValidateRemoteMediaURLRejectsPrivateTargets(t *testing.T) {
	for _, value := range []string{"http://127.0.0.1/video.mp4", "http://[::1]/video.mp4", "http://localhost/video.mp4", "file:///tmp/video.mp4"} {
		if _, err := validateRemoteMediaURL(value); err == nil {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
	if _, err := validateRemoteMediaURL("https://cdn.example.com/video.mp4"); err != nil {
		t.Fatalf("expected public HTTPS URL to be accepted: %v", err)
	}
	if isPublicMediaIP(net.ParseIP("192.168.1.1")) || !isPublicMediaIP(net.ParseIP("1.1.1.1")) {
		t.Fatal("public IP classification is incorrect")
	}
}

func TestIsMP4File(t *testing.T) {
	dir := t.TempDir()
	video := filepath.Join(dir, "video.mp4")
	if err := os.WriteFile(video, []byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, 0o600); err != nil {
		t.Fatal(err)
	}
	if !isMP4File(video) {
		t.Fatal("expected MP4 ftyp header to be accepted")
	}
}
