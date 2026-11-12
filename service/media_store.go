package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/config"
)

var ErrMediaTooLarge = errors.New("media exceeds size limit")

type ReferenceMediaInput struct {
	ID        string
	Extension string
	MimeType  string
	Class     string
	Reader    io.Reader
	MaxBytes  int64
}

type StoredMedia struct {
	ID       string
	URL      string
	MimeType string
	Bytes    int64
}

type mediaStore interface {
	StoreReference(context.Context, ReferenceMediaInput) (StoredMedia, error)
	CheckCacheCapacity() error
	CacheRemoteVideo(context.Context, string, func(int)) (string, error)
}

var (
	activeMediaStore mediaStore
	mediaStoreMu     sync.RWMutex
)

func InitMediaStore() error {
	store, err := newMediaStore(config.Cfg)
	if err != nil {
		return err
	}
	mediaStoreMu.Lock()
	activeMediaStore = store
	mediaStoreMu.Unlock()
	return nil
}

func newMediaStore(cfg config.Config) (mediaStore, error) {
	if err := cfg.ValidateMedia(); err != nil {
		return nil, err
	}
	if strings.EqualFold(strings.TrimSpace(cfg.MediaStorageDriver), "r2") {
		return newR2MediaStore(cfg)
	}
	return &localMediaStore{publicBaseURL: strings.TrimRight(strings.TrimSpace(cfg.PublicBaseURL), "/")}, nil
}

func currentMediaStore() (mediaStore, error) {
	mediaStoreMu.RLock()
	store := activeMediaStore
	mediaStoreMu.RUnlock()
	if store == nil {
		return nil, errors.New("media store is not initialized")
	}
	return store, nil
}

func StoreReferenceMedia(ctx context.Context, input ReferenceMediaInput) (StoredMedia, error) {
	store, err := currentMediaStore()
	if err != nil {
		return StoredMedia{}, err
	}
	return store.StoreReference(ctx, input)
}

type localMediaStore struct {
	publicBaseURL string
}

func (s *localMediaStore) StoreReference(_ context.Context, input ReferenceMediaInput) (StoredMedia, error) {
	if err := os.MkdirAll(ReferenceMediaDir(), 0o755); err != nil {
		return StoredMedia{}, err
	}
	filename := input.ID + input.Extension
	targetPath := filepath.Join(ReferenceMediaDir(), filename)
	target, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return StoredMedia{}, err
	}
	written, copyErr := io.Copy(target, &boundedMediaReader{reader: input.Reader, remaining: input.MaxBytes})
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil || written <= 0 {
		_ = os.Remove(targetPath)
		if copyErr != nil {
			return StoredMedia{}, copyErr
		}
		if closeErr != nil {
			return StoredMedia{}, closeErr
		}
		return StoredMedia{}, errors.New("media is empty")
	}
	return StoredMedia{ID: filename, URL: fmt.Sprintf("%s/api/media/references/%s", s.publicBaseURL, filename), MimeType: input.MimeType, Bytes: written}, nil
}

func (s *localMediaStore) CheckCacheCapacity() error {
	usage, err := mediaCacheUsage()
	if err != nil {
		return err
	}
	if usage >= mediaCacheMaxBytes {
		return errors.New("视频缓存空间不足")
	}
	return nil
}

func (s *localMediaStore) CacheRemoteVideo(ctx context.Context, rawURL string, progress func(int)) (string, error) {
	id, err := randomOpaqueID()
	if err != nil {
		return "", err
	}
	if err := downloadRemoteVideo(ctx, id, rawURL, progress); err != nil {
		return "", err
	}
	return "/api/media/cache/" + id + ".mp4", nil
}

type boundedMediaReader struct {
	reader    io.Reader
	remaining int64
}

func (r *boundedMediaReader) Read(buffer []byte) (int, error) {
	if r.remaining <= 0 {
		var extra [1]byte
		if count, err := r.reader.Read(extra[:]); count > 0 || err == nil {
			return 0, ErrMediaTooLarge
		} else {
			return 0, err
		}
	}
	if int64(len(buffer)) > r.remaining {
		buffer = buffer[:r.remaining]
	}
	count, err := r.reader.Read(buffer)
	r.remaining -= int64(count)
	return count, err
}

func randomOpaqueID() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func mediaObjectKey(prefix string, now time.Time) (string, error) {
	id, err := randomOpaqueID()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s/%s/%s", strings.Trim(prefix, "/"), now.UTC().Format("2006-01-02"), id), nil
}

func signedMediaURL(baseURL, secret, key string, expiresAt time.Time) (string, error) {
	base, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/") + "/v1/media")
	if err != nil {
		return "", err
	}
	expires := expiresAt.Unix()
	message := fmt.Sprintf("v1\n%s\n%d", key, expires)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(message))
	query := base.Query()
	query.Set("key", base64.RawURLEncoding.EncodeToString([]byte(key)))
	query.Set("expires", fmt.Sprintf("%d", expires))
	query.Set("sig", base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))
	base.RawQuery = query.Encode()
	return base.String(), nil
}
