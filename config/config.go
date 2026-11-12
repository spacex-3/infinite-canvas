package config

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	Port           string `env:"PORT" envDefault:"8080"`
	AdminUsername  string `env:"ADMIN_USERNAME" envDefault:"admin"`
	AdminPassword  string `env:"ADMIN_PASSWORD" envDefault:"infinite-canvas"`
	JWTSecret      string `env:"JWT_SECRET" envDefault:"infinite-canvas"`
	JWTExpireHours int    `env:"JWT_EXPIRE_HOURS" envDefault:"168"`
	StorageDriver  string `env:"STORAGE_DRIVER" envDefault:"sqlite"`
	DatabaseDSN    string `env:"DATABASE_DSN" envDefault:"data/infinite-canvas.db"`
	PublicBaseURL  string `env:"PUBLIC_BASE_URL"`

	MediaStorageDriver     string `env:"MEDIA_STORAGE_DRIVER" envDefault:"local"`
	MediaR2Endpoint        string `env:"MEDIA_R2_ENDPOINT"`
	MediaR2Region          string `env:"MEDIA_R2_REGION" envDefault:"auto"`
	MediaR2Bucket          string `env:"MEDIA_R2_BUCKET" envDefault:"zpika-canvas"`
	MediaR2AccessKey       string `env:"MEDIA_R2_ACCESS_KEY"`
	MediaR2SecretKey       string `env:"MEDIA_R2_SECRET_KEY"`
	MediaR2ReferencePrefix string `env:"MEDIA_R2_REFERENCE_PREFIX" envDefault:"canvas-references/v1"`
	MediaR2CachePrefix     string `env:"MEDIA_R2_CACHE_PREFIX" envDefault:"canvas-cache/v1"`
	MediaPublicBaseURL     string `env:"MEDIA_PUBLIC_BASE_URL"`
	MediaHMACSecret        string `env:"MEDIA_HMAC_SECRET"`
	MediaRetentionSeconds  int    `env:"MEDIA_RETENTION_SECONDS" envDefault:"86400"`
	MediaWorkerURL         string `env:"MEDIA_WORKER_URL"`
	MediaWorkerHMACKeyID   string `env:"MEDIA_WORKER_HMAC_KEY_ID" envDefault:"v1"`
	MediaWorkerHMACSecret  string `env:"MEDIA_WORKER_HMAC_SECRET"`
	MediaWorkerTimeoutSecs int    `env:"MEDIA_WORKER_TIMEOUT_SECONDS" envDefault:"1800"`
}

var Cfg Config

func Load() error {
	_ = godotenv.Load()
	if err := env.Parse(&Cfg); err != nil {
		return err
	}
	normalizeDockerSQLiteDSN("/app/data")
	if strings.TrimSpace(Cfg.JWTSecret) == "" || Cfg.JWTSecret == "infinite-canvas" {
		secret, err := randomSecret()
		if err != nil {
			return err
		}
		Cfg.JWTSecret = secret
	}
	return Cfg.ValidateMedia()
}

func (c Config) ValidateMedia() error {
	driver := strings.ToLower(strings.TrimSpace(c.MediaStorageDriver))
	if driver == "" || driver == "local" {
		if strings.TrimSpace(c.PublicBaseURL) == "" {
			return fmt.Errorf("PUBLIC_BASE_URL is required when MEDIA_STORAGE_DRIVER=local")
		}
		return nil
	}
	if driver != "r2" {
		return fmt.Errorf("unsupported MEDIA_STORAGE_DRIVER %q", driver)
	}
	required := map[string]string{
		"MEDIA_R2_ENDPOINT": c.MediaR2Endpoint, "MEDIA_R2_BUCKET": c.MediaR2Bucket,
		"MEDIA_R2_ACCESS_KEY": c.MediaR2AccessKey, "MEDIA_R2_SECRET_KEY": c.MediaR2SecretKey,
		"MEDIA_PUBLIC_BASE_URL": c.MediaPublicBaseURL, "MEDIA_HMAC_SECRET": c.MediaHMACSecret,
		"MEDIA_WORKER_URL": c.MediaWorkerURL, "MEDIA_WORKER_HMAC_KEY_ID": c.MediaWorkerHMACKeyID,
		"MEDIA_WORKER_HMAC_SECRET": c.MediaWorkerHMACSecret,
	}
	for name, value := range required {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s is required when MEDIA_STORAGE_DRIVER=r2", name)
		}
	}
	if c.MediaRetentionSeconds != 86400 {
		return fmt.Errorf("MEDIA_RETENTION_SECONDS must be 86400 in R2 mode, got %s", strconv.Itoa(c.MediaRetentionSeconds))
	}
	if c.MediaWorkerTimeoutSecs <= 0 || c.MediaWorkerTimeoutSecs > 1800 {
		return fmt.Errorf("MEDIA_WORKER_TIMEOUT_SECONDS must be between 1 and 1800")
	}
	for name, value := range map[string]string{"MEDIA_R2_REFERENCE_PREFIX": c.MediaR2ReferencePrefix, "MEDIA_R2_CACHE_PREFIX": c.MediaR2CachePrefix} {
		value = strings.Trim(strings.TrimSpace(value), "/")
		if value == "" || strings.Contains(value, "..") {
			return fmt.Errorf("%s is invalid", name)
		}
	}
	return nil
}

func normalizeDockerSQLiteDSN(appDataDir string) {
	driver := strings.ToLower(strings.TrimSpace(Cfg.StorageDriver))
	if driver != "" && driver != "sqlite" {
		return
	}
	dsn := strings.TrimSpace(Cfg.DatabaseDSN)
	if dsn == "" || dsn == ":memory:" || strings.HasPrefix(dsn, "file:") {
		return
	}
	pathPart, suffix := dsn, ""
	if index := strings.Index(dsn, "?"); index >= 0 {
		pathPart = dsn[:index]
		suffix = dsn[index:]
	}
	if filepath.IsAbs(pathPart) {
		return
	}
	slashPath := filepath.ToSlash(pathPart)
	if slashPath != "data" && !strings.HasPrefix(slashPath, "data/") {
		return
	}
	if _, err := os.Stat(appDataDir); err != nil {
		return
	}
	Cfg.DatabaseDSN = filepath.Join(filepath.Dir(appDataDir), filepath.FromSlash(slashPath)) + suffix
}

func randomSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
