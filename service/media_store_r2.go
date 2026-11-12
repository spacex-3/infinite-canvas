package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	appconfig "github.com/basketikun/infinite-canvas/config"
)

type r2MediaStore struct {
	bucket          string
	referencePrefix string
	cachePrefix     string
	publicBaseURL   string
	mediaSecret     string
	retention       time.Duration
	workerURL       string
	workerKeyID     string
	workerSecret    string
	workerClient    *http.Client
	s3              *s3.Client
	uploader        *manager.Uploader
}

func newR2MediaStore(cfg appconfig.Config) (mediaStore, error) {
	awsConfig, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(strings.TrimSpace(cfg.MediaR2Region)),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			strings.TrimSpace(cfg.MediaR2AccessKey), strings.TrimSpace(cfg.MediaR2SecretKey), "",
		)),
	)
	if err != nil {
		return nil, err
	}
	endpoint := strings.TrimRight(strings.TrimSpace(cfg.MediaR2Endpoint), "/")
	client := s3.NewFromConfig(awsConfig, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(endpoint)
		options.UsePathStyle = true
	})
	uploader := manager.NewUploader(client, func(options *manager.Uploader) {
		options.PartSize = 8 << 20
		options.Concurrency = 2
		options.LeavePartsOnError = false
	})
	return &r2MediaStore{
		bucket: strings.TrimSpace(cfg.MediaR2Bucket), referencePrefix: strings.Trim(cfg.MediaR2ReferencePrefix, "/"),
		cachePrefix: strings.Trim(cfg.MediaR2CachePrefix, "/"), publicBaseURL: strings.TrimRight(strings.TrimSpace(cfg.MediaPublicBaseURL), "/"),
		mediaSecret: cfg.MediaHMACSecret, retention: time.Duration(cfg.MediaRetentionSeconds) * time.Second,
		workerURL: strings.TrimRight(strings.TrimSpace(cfg.MediaWorkerURL), "/"), workerKeyID: cfg.MediaWorkerHMACKeyID,
		workerSecret: cfg.MediaWorkerHMACSecret, workerClient: &http.Client{Timeout: time.Duration(cfg.MediaWorkerTimeoutSecs) * time.Second},
		s3: client, uploader: uploader,
	}, nil
}

func (s *r2MediaStore) StoreReference(ctx context.Context, input ReferenceMediaInput) (StoredMedia, error) {
	now := time.Now().UTC()
	key, err := mediaObjectKey(s.referencePrefix, now)
	if err != nil {
		return StoredMedia{}, err
	}
	expiresAt := now.Add(s.retention)
	reader := &countingBoundedReader{reader: input.Reader, remaining: input.MaxBytes}
	_, err = s.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(key), Body: reader, ContentType: aws.String(input.MimeType),
		Metadata: map[string]string{"expires_at": fmt.Sprintf("%d", expiresAt.Unix()), "media_class": input.Class, "download_type": input.MimeType},
	})
	if err != nil {
		_, _ = s.s3.DeleteObject(context.Background(), &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
		if reader.exceeded {
			return StoredMedia{}, ErrMediaTooLarge
		}
		return StoredMedia{}, err
	}
	if reader.count <= 0 {
		_, _ = s.s3.DeleteObject(context.Background(), &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
		return StoredMedia{}, errors.New("media is empty")
	}
	mediaURL, err := signedMediaURL(s.publicBaseURL, s.mediaSecret, key, expiresAt)
	if err != nil {
		return StoredMedia{}, err
	}
	return StoredMedia{ID: input.ID + input.Extension, URL: mediaURL, MimeType: input.MimeType, Bytes: reader.count}, nil
}

func (s *r2MediaStore) CheckCacheCapacity() error { return nil }

func (s *r2MediaStore) CacheRemoteVideo(ctx context.Context, rawURL string, _ func(int)) (string, error) {
	now := time.Now().UTC()
	key, err := mediaObjectKey(s.cachePrefix, now)
	if err != nil {
		return "", err
	}
	expiresAt := now.Add(s.retention)
	job := mediaWorkerJob{
		Version: "v1", ObjectKey: key, ExpiresAt: expiresAt.Unix(), MediaClass: "video", MimeType: "video/mp4", MaxBytes: remoteVideoMaxBytes,
		Source: mediaWorkerSource{URL: rawURL, Method: http.MethodGet, Credentialless: true},
	}
	var response struct {
		Ready bool `json:"ready"`
	}
	if err := s.callWorker(ctx, "/v1/ingest", job, &response); err != nil || !response.Ready {
		if err != nil {
			return "", err
		}
		return "", errors.New("media worker did not persist the video")
	}
	return signedMediaURL(s.publicBaseURL, s.mediaSecret, key, expiresAt)
}

type mediaWorkerSource struct {
	URL            string `json:"url"`
	Method         string `json:"method"`
	Credentialless bool   `json:"credentialless"`
}

type mediaWorkerJob struct {
	Version    string            `json:"version"`
	ObjectKey  string            `json:"object_key"`
	ExpiresAt  int64             `json:"expires_at"`
	MediaClass string            `json:"media_class"`
	MimeType   string            `json:"mime_type"`
	MaxBytes   int64             `json:"max_bytes"`
	Source     mediaWorkerSource `json:"source"`
}

func (s *r2MediaStore) callWorker(ctx context.Context, path string, payload any, destination any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	target, err := url.Parse(s.workerURL + path)
	if err != nil {
		return err
	}
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	nonce, err := randomOpaqueID()
	if err != nil {
		return err
	}
	digest := sha256.Sum256(body)
	message := strings.Join([]string{"v1", http.MethodPost, target.Path, timestamp, nonce, hex.EncodeToString(digest[:])}, "\n")
	mac := hmac.New(sha256.New, []byte(s.workerSecret))
	_, _ = mac.Write([]byte(message))
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Canvas-Media-Key-Id", s.workerKeyID)
	request.Header.Set("X-Canvas-Media-Timestamp", timestamp)
	request.Header.Set("X-Canvas-Media-Nonce", nonce)
	request.Header.Set("X-Canvas-Media-Signature", base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))
	response, err := s.workerClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return fmt.Errorf("media worker request failed with status %d", response.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(destination)
}

type countingBoundedReader struct {
	reader    io.Reader
	remaining int64
	count     int64
	exceeded  bool
}

func (r *countingBoundedReader) Read(buffer []byte) (int, error) {
	if r.remaining <= 0 {
		var extra [1]byte
		if count, err := r.reader.Read(extra[:]); count > 0 || err == nil {
			r.exceeded = true
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
	r.count += int64(count)
	return count, err
}
