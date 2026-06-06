package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

func CreateEpayOrder(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "请先登录")
		return
	}
	var request service.EpayOrderRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.CreateEpayOrder(r, user, request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func PaymentOrders(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "请先登录")
		return
	}
	orders, err := service.ListPaymentOrders(user, parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, orders)
}

func PaymentOrder(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "请先登录")
		return
	}
	order, err := service.GetPaymentOrder(user, id)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, order)
}

func EpayNotify(w http.ResponseWriter, r *http.Request) {
	params := map[string]string{}
	if r.Method == http.MethodPost {
		_ = r.ParseForm()
		for key := range r.PostForm {
			params[key] = r.PostForm.Get(key)
		}
	} else {
		for key := range r.URL.Query() {
			params[key] = r.URL.Query().Get(key)
		}
	}
	ok, err := service.HandleEpayNotify(params)
	if err != nil || !ok {
		_, _ = w.Write([]byte("fail"))
		return
	}
	_, _ = w.Write([]byte("success"))
}
