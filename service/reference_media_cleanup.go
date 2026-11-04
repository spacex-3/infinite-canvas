package service

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/repository"
)

var mediaCleanupOnce sync.Once

func ReferenceMediaDir() string {
	return filepath.Join(referenceDataDir(), "reference-media")
}

func StartMediaCleanupScheduler() {
	mediaCleanupOnce.Do(func() {
		go func() {
			cleanupExpiredMedia(time.Now())
			ticker := time.NewTicker(24 * time.Hour)
			defer ticker.Stop()
			for now := range ticker.C {
				cleanupExpiredMedia(now)
			}
		}()
	})
}

func cleanupExpiredMedia(now time.Time) {
	settings, err := repository.GetSettings()
	if err != nil {
		log.Printf("load reference media retention setting failed err=%v", err)
		return
	}
	retentionDays := normalizePrivateSetting(settings.Private).Storage.MediaRetentionDays
	cutoff := now.Add(-time.Duration(retentionDays) * 24 * time.Hour)
	removed := 0
	for _, dir := range []string{ReferenceMediaDir(), MediaCacheDir()} {
		count, err := removeExpiredMedia(dir, cutoff)
		if err != nil {
			log.Printf("cleanup server media failed dir=%s err=%v", dir, err)
			continue
		}
		removed += count
	}
	if removed > 0 {
		log.Printf("expired server media cleanup done removed=%d retention_days=%d", removed, retentionDays)
	}
}

func removeExpiredMedia(dir string, cutoff time.Time) (int, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.ModTime().Before(cutoff) {
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
			log.Printf("remove expired server media failed file=%s err=%v", entry.Name(), err)
			continue
		}
		removed++
	}
	return removed, nil
}

func referenceDataDir() string {
	driver := strings.ToLower(strings.TrimSpace(config.Cfg.StorageDriver))
	dsn := strings.TrimSpace(config.Cfg.DatabaseDSN)
	if (driver == "" || driver == "sqlite") && dsn != "" && dsn != ":memory:" && !strings.HasPrefix(dsn, "file:") {
		pathPart := dsn
		if index := strings.Index(dsn, "?"); index >= 0 {
			pathPart = dsn[:index]
		}
		if filepath.IsAbs(pathPart) {
			return filepath.Dir(pathPart)
		}
	}
	if _, err := os.Stat("/app/data"); err == nil {
		return "/app/data"
	}
	return "data"
}
