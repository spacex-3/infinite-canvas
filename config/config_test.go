package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeDockerSQLiteDSNUsesMountedDataDir(t *testing.T) {
	root := t.TempDir()
	appDataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(appDataDir, 0755); err != nil {
		t.Fatal(err)
	}
	Cfg = Config{StorageDriver: "sqlite", DatabaseDSN: "data/infinite-canvas.db?_pragma=busy_timeout(5000)"}

	normalizeDockerSQLiteDSN(appDataDir)

	want := filepath.Join(root, "data", "infinite-canvas.db") + "?_pragma=busy_timeout(5000)"
	if Cfg.DatabaseDSN != want {
		t.Fatalf("DatabaseDSN = %q, want %q", Cfg.DatabaseDSN, want)
	}
}

func TestNormalizeDockerSQLiteDSNLeavesLocalPathWithoutMountedDataDir(t *testing.T) {
	Cfg = Config{StorageDriver: "sqlite", DatabaseDSN: "data/infinite-canvas.db"}

	normalizeDockerSQLiteDSN(filepath.Join(t.TempDir(), "missing-data"))

	if Cfg.DatabaseDSN != "data/infinite-canvas.db" {
		t.Fatalf("DatabaseDSN = %q, want relative local path", Cfg.DatabaseDSN)
	}
}

func TestValidateMediaRequiresCompleteR2Configuration(t *testing.T) {
	config := Config{MediaStorageDriver: "r2", MediaRetentionSeconds: 86400, MediaWorkerTimeoutSecs: 1800}
	if err := config.ValidateMedia(); err == nil {
		t.Fatal("expected incomplete R2 configuration to fail")
	}
	config.MediaR2Endpoint = "https://example.r2.cloudflarestorage.com"
	config.MediaR2Bucket = "zpika-canvas"
	config.MediaR2AccessKey = "access"
	config.MediaR2SecretKey = "secret"
	config.MediaR2ReferencePrefix = "canvas-references/v1"
	config.MediaR2CachePrefix = "canvas-cache/v1"
	config.MediaPublicBaseURL = "https://canvas-media.example.com"
	config.MediaHMACSecret = "media-secret"
	config.MediaWorkerURL = "https://canvas-media.example.com"
	config.MediaWorkerHMACKeyID = "v1"
	config.MediaWorkerHMACSecret = "worker-secret"
	if err := config.ValidateMedia(); err != nil {
		t.Fatalf("complete R2 configuration rejected: %v", err)
	}
}

func TestValidateMediaRequiresPublicURLInLocalMode(t *testing.T) {
	if err := (Config{MediaStorageDriver: "local"}).ValidateMedia(); err == nil {
		t.Fatal("expected local mode without PUBLIC_BASE_URL to fail")
	}
	if err := (Config{MediaStorageDriver: "local", PublicBaseURL: "https://canvas.example.com"}).ValidateMedia(); err != nil {
		t.Fatalf("valid local media configuration rejected: %v", err)
	}
}
