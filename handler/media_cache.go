package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/basketikun/infinite-canvas/service"
)

func CreateRemoteVideoCache(w http.ResponseWriter, r *http.Request) {
	var request struct {
		URL string `json:"url"`
	}
	if json.NewDecoder(r.Body).Decode(&request) != nil {
		Fail(w, "视频缓存地址无效")
		return
	}
	task, err := service.CreateRemoteVideoCache(request.URL)
	if err != nil {
		Fail(w, err.Error())
		return
	}
	OK(w, task)
}

func RemoteVideoCache(w http.ResponseWriter, r *http.Request, id string) {
	task, ok := service.GetRemoteVideoCache(id)
	if !ok {
		Fail(w, "视频缓存任务不存在或已过期")
		return
	}
	OK(w, task)
}

func CachedMedia(w http.ResponseWriter, r *http.Request, id string) {
	path, ok := service.CachedMediaPath(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
}
