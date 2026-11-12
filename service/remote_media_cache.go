package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	remoteVideoMaxBytes   = 200 << 20
	mediaCacheMaxBytes    = 5 << 30
	remoteVideoTaskLimit  = 16
	remoteVideoTaskMaxAge = 24 * time.Hour
)

type RemoteVideoCacheTask struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
	URL      string `json:"url,omitempty"`
	Error    string `json:"error,omitempty"`
	updated  time.Time
}

var (
	remoteVideoTasks = map[string]RemoteVideoCacheTask{}
	remoteVideoMu    sync.Mutex
	remoteVideoSlots = make(chan struct{}, 2)
)

func MediaCacheDir() string {
	return filepath.Join(referenceDataDir(), "media-cache")
}

func CreateRemoteVideoCache(rawURL string) (RemoteVideoCacheTask, error) {
	if _, err := validateRemoteMediaURL(rawURL); err != nil {
		return RemoteVideoCacheTask{}, err
	}
	store, err := currentMediaStore()
	if err != nil {
		return RemoteVideoCacheTask{}, err
	}
	if err := store.CheckCacheCapacity(); err != nil {
		return RemoteVideoCacheTask{}, err
	}
	remoteVideoMu.Lock()
	pruneRemoteVideoTasksLocked(time.Now())
	pending := 0
	for _, task := range remoteVideoTasks {
		if task.Status == "queued" || task.Status == "downloading" {
			pending++
		}
	}
	if pending >= remoteVideoTaskLimit {
		remoteVideoMu.Unlock()
		return RemoteVideoCacheTask{}, errors.New("视频缓存队列已满")
	}
	taskID, err := randomOpaqueID()
	if err != nil {
		remoteVideoMu.Unlock()
		return RemoteVideoCacheTask{}, err
	}
	task := RemoteVideoCacheTask{ID: taskID, Status: "queued", updated: time.Now()}
	remoteVideoTasks[task.ID] = task
	remoteVideoMu.Unlock()
	go runRemoteVideoCache(task.ID, rawURL)
	return task, nil
}

func mediaCacheUsage() (int64, error) {
	entries, err := os.ReadDir(MediaCacheDir())
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	var total int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return 0, err
		}
		total += info.Size()
	}
	return total, nil
}

func GetRemoteVideoCache(id string) (RemoteVideoCacheTask, bool) {
	remoteVideoMu.Lock()
	defer remoteVideoMu.Unlock()
	pruneRemoteVideoTasksLocked(time.Now())
	task, ok := remoteVideoTasks[id]
	return task, ok
}

func CachedMediaPath(id string) (string, bool) {
	if id == "" || id != filepath.Base(id) || strings.Contains(id, "..") || strings.ToLower(filepath.Ext(id)) != ".mp4" {
		return "", false
	}
	return filepath.Join(MediaCacheDir(), id), true
}

func runRemoteVideoCache(id string, rawURL string) {
	remoteVideoSlots <- struct{}{}
	defer func() { <-remoteVideoSlots }()
	updateRemoteVideoTask(id, func(task *RemoteVideoCacheTask) {
		task.Status = "downloading"
	})
	store, err := currentMediaStore()
	if err != nil {
		updateRemoteVideoTask(id, func(task *RemoteVideoCacheTask) {
			task.Status = "failed"
			task.Error = "视频缓存服务不可用"
		})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	mediaURL, err := store.CacheRemoteVideo(ctx, rawURL, func(progress int) {
		updateRemoteVideoTask(id, func(task *RemoteVideoCacheTask) { task.Progress = min(99, max(0, progress)) })
	})
	if err != nil {
		log.Printf("remote video cache failed task=%s err=%v", id, err)
		updateRemoteVideoTask(id, func(task *RemoteVideoCacheTask) {
			task.Status = "failed"
			task.Error = "服务器下载视频失败"
		})
		return
	}
	updateRemoteVideoTask(id, func(task *RemoteVideoCacheTask) {
		task.Status = "completed"
		task.Progress = 100
		task.URL = mediaURL
	})
}

func downloadRemoteVideo(ctx context.Context, id string, rawURL string, progress func(int)) error {
	parsed, err := validateRemoteMediaURL(rawURL)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(MediaCacheDir(), 0o755); err != nil {
		return err
	}
	targetPath := filepath.Join(MediaCacheDir(), id+".mp4")
	tempPath := targetPath + ".part"
	defer os.Remove(tempPath)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "infinite-canvas-media-cache/1.0")
	response, err := remoteMediaHTTPClient().Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("remote media status %d", response.StatusCode)
	}
	if response.ContentLength > remoteVideoMaxBytes {
		return errors.New("remote video exceeds size limit")
	}
	target, err := os.OpenFile(tempPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	limited := io.LimitReader(response.Body, remoteVideoMaxBytes+1)
	buffer := make([]byte, 256<<10)
	var written int64
	for {
		count, readErr := limited.Read(buffer)
		if count > 0 {
			writeCount, writeErr := target.Write(buffer[:count])
			written += int64(writeCount)
			if writeErr != nil || writeCount != count {
				target.Close()
				return errors.New("write cached video failed")
			}
			if response.ContentLength > 0 {
				progress(min(99, int(written*100/response.ContentLength)))
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			target.Close()
			return readErr
		}
	}
	if err := target.Close(); err != nil {
		return err
	}
	if written <= 0 || written > remoteVideoMaxBytes {
		return errors.New("invalid remote video size")
	}
	if !isMP4File(tempPath) {
		return errors.New("remote media is not an MP4 video")
	}
	return os.Rename(tempPath, targetPath)
}

func isMP4File(path string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()
	header := make([]byte, 12)
	if _, err := io.ReadFull(file, header); err != nil {
		return false
	}
	return string(header[4:8]) == "ftyp"
}

func remoteMediaHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network string, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			for _, address := range addresses {
				if isPublicMediaIP(address.IP) {
					return dialer.DialContext(ctx, network, net.JoinHostPort(address.IP.String(), port))
				}
			}
			return nil, errors.New("remote media host resolves to a private address")
		},
		ForceAttemptHTTP2:     true,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       30 * time.Second,
	}
	return &http.Client{
		Transport: transport,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many remote media redirects")
			}
			if len(via) > 0 && strings.EqualFold(via[len(via)-1].URL.Scheme, "https") && !strings.EqualFold(request.URL.Scheme, "https") {
				return errors.New("remote media redirect downgraded HTTPS")
			}
			_, err := validateRemoteMediaURL(request.URL.String())
			return err
		},
	}
}

func validateRemoteMediaURL(rawURL string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Hostname() == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("invalid remote media URL")
	}
	if strings.EqualFold(parsed.Hostname(), "localhost") {
		return nil, errors.New("private remote media host")
	}
	if ip := net.ParseIP(parsed.Hostname()); ip != nil && !isPublicMediaIP(ip) {
		return nil, errors.New("private remote media address")
	}
	return parsed, nil
}

func isPublicMediaIP(ip net.IP) bool {
	return ip != nil && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsUnspecified() && !ip.IsMulticast() && !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast()
}

func updateRemoteVideoTask(id string, update func(*RemoteVideoCacheTask)) {
	remoteVideoMu.Lock()
	defer remoteVideoMu.Unlock()
	task, ok := remoteVideoTasks[id]
	if !ok {
		return
	}
	update(&task)
	task.updated = time.Now()
	remoteVideoTasks[id] = task
}

func pruneRemoteVideoTasksLocked(now time.Time) {
	for id, task := range remoteVideoTasks {
		if (task.Status == "completed" || task.Status == "failed") && now.Sub(task.updated) > remoteVideoTaskMaxAge {
			delete(remoteVideoTasks, id)
		}
	}
}
