package service

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRemoveExpiredMedia(t *testing.T) {
	dir := t.TempDir()
	oldFile := filepath.Join(dir, "expired.png")
	newFile := filepath.Join(dir, "recent.mp4")
	if err := os.WriteFile(oldFile, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(newFile, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	if err := os.Chtimes(oldFile, cutoff.Add(-time.Minute), cutoff.Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}

	removed, err := removeExpiredMedia(dir, cutoff)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed = %d, want 1", removed)
	}
	if _, err := os.Stat(oldFile); !os.IsNotExist(err) {
		t.Fatalf("expired file still exists or stat failed: %v", err)
	}
	if _, err := os.Stat(newFile); err != nil {
		t.Fatalf("recent file should remain: %v", err)
	}
}
