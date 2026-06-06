package service

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const paymentProviderEpay = "epay"

type EpayOrderRequest struct {
	Credits int    `json:"credits"`
	Method  string `json:"method"`
}

type EpayOrderResult struct {
	Order      model.PaymentOrder `json:"order"`
	PaymentURL string             `json:"paymentUrl"`
}

func CreateEpayOrder(r *http.Request, user model.AuthUser, request EpayOrderRequest) (EpayOrderResult, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return EpayOrderResult{}, err
	}
	settings = normalizeSettings(settings)
	epay := settings.Private.Payment.Epay
	if !settings.Public.Payment.Epay.Enabled {
		return EpayOrderResult{}, safeMessageError{message: "易支付未配置"}
	}
	if request.Credits < epay.MinCredits {
		return EpayOrderResult{}, safeMessageError{message: fmt.Sprintf("充值算力点不能小于 %d", epay.MinCredits)}
	}
	method := strings.TrimSpace(request.Method)
	if !paymentMethodEnabled(epay.Methods, method) {
		return EpayOrderResult{}, safeMessageError{message: "支付方式不存在"}
	}
	amountCents := int(math.Round(float64(request.Credits) * epay.PricePerCredit * 100))
	if amountCents < 1 {
		return EpayOrderResult{}, safeMessageError{message: "充值金额过低"}
	}
	nowText := now()
	order := model.PaymentOrder{
		ID:              newID("pay"),
		UserID:          user.ID,
		Credits:         request.Credits,
		AmountCents:     amountCents,
		PaymentProvider: paymentProviderEpay,
		PaymentMethod:   method,
		Status:          model.PaymentOrderStatusPending,
		CreatedAt:       nowText,
		UpdatedAt:       nowText,
	}
	origin := epay.CallbackOrigin
	if origin == "" {
		origin = RequestOrigin(r)
	}
	params := map[string]string{
		"pid":          epay.PartnerID,
		"type":         method,
		"out_trade_no": order.ID,
		"notify_url":   origin + "/api/payment/epay/notify",
		"return_url":   origin + "/billing?order=" + url.QueryEscape(order.ID),
		"name":         fmt.Sprintf("朋克算力点 %d 点", request.Credits),
		"money":        centsText(amountCents),
	}
	paymentURL := buildEpayPaymentURL(epay.PayURL, params, epay.Key)
	order, err = repository.SavePaymentOrder(order)
	if err != nil {
		return EpayOrderResult{}, err
	}
	return EpayOrderResult{Order: order, PaymentURL: paymentURL}, nil
}

func ListPaymentOrders(user model.AuthUser, q model.Query) (model.PaymentOrderList, error) {
	orders, total, err := repository.ListPaymentOrders(user.ID, q)
	if err != nil {
		return model.PaymentOrderList{}, err
	}
	for i := range orders {
		orders[i].NotifyPayload = ""
	}
	return model.PaymentOrderList{Items: orders, Total: int(total)}, nil
}

func GetPaymentOrder(user model.AuthUser, id string) (model.PaymentOrder, error) {
	order, ok, err := repository.GetPaymentOrderByID(strings.TrimSpace(id))
	if err != nil {
		return order, err
	}
	if !ok || order.UserID != user.ID {
		return order, safeMessageError{message: "订单不存在"}
	}
	order.NotifyPayload = ""
	return order, nil
}

func HandleEpayNotify(params map[string]string) (bool, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return false, err
	}
	settings = normalizeSettings(settings)
	epay := settings.Private.Payment.Epay
	if !settings.Public.Payment.Epay.Enabled {
		return false, safeMessageError{message: "易支付未配置"}
	}
	if !verifyEpaySign(params, epay.Key) {
		return false, safeMessageError{message: "易支付验签失败"}
	}
	tradeStatus := strings.TrimSpace(params["trade_status"])
	orderID := strings.TrimSpace(params["out_trade_no"])
	if orderID == "" {
		return false, safeMessageError{message: "易支付订单号为空"}
	}
	if tradeStatus != "TRADE_SUCCESS" {
		return true, nil
	}
	order, ok, err := repository.GetPaymentOrderByID(orderID)
	if err != nil {
		return false, err
	}
	if !ok {
		return false, safeMessageError{message: "充值订单不存在"}
	}
	if order.PaymentProvider != paymentProviderEpay {
		return false, safeMessageError{message: "支付网关不匹配"}
	}
	if got := epayMoneyCents(params["money"]); got > 0 && got != order.AmountCents {
		return false, safeMessageError{message: "支付金额不匹配"}
	}
	payload, _ := json.Marshal(params)
	actualMethod := strings.TrimSpace(params["type"])
	if actualMethod == "" {
		actualMethod = order.PaymentMethod
	}
	paidOrder, user, completed, err := repository.CompletePaymentOrder(order.ID, strings.TrimSpace(params["trade_no"]), actualMethod, string(payload), now())
	if err != nil {
		return false, err
	}
	if completed {
		_, err = repository.SaveCreditLog(model.CreditLog{
			ID:        newID("credit"),
			UserID:    paidOrder.UserID,
			Type:      model.CreditLogTypePayment,
			Amount:    paidOrder.Credits,
			Balance:   user.Credits,
			RelatedID: paidOrder.ID,
			Remark:    "在线充值",
			Extra:     string(payload),
			CreatedAt: now(),
		})
		if err != nil {
			return false, err
		}
	}
	return true, nil
}

func buildEpayPaymentURL(payURL string, params map[string]string, key string) string {
	values := url.Values{}
	for name, value := range params {
		values.Set(name, value)
	}
	values.Set("sign", epaySign(params, key))
	values.Set("sign_type", "MD5")
	return normalizeEpaySubmitURL(payURL) + "?" + values.Encode()
}

func verifyEpaySign(params map[string]string, key string) bool {
	sign := strings.ToLower(strings.TrimSpace(params["sign"]))
	return sign != "" && sign == epaySign(params, key)
}

func epaySign(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for name, value := range params {
		if name == "sign" || name == "sign_type" || strings.TrimSpace(value) == "" {
			continue
		}
		keys = append(keys, name)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, name := range keys {
		parts = append(parts, name+"="+params[name])
	}
	sum := md5.Sum([]byte(strings.Join(parts, "&") + key))
	return hex.EncodeToString(sum[:])
}

func normalizeEpaySubmitURL(payURL string) string {
	payURL = strings.TrimRight(strings.TrimSpace(payURL), "/")
	parsed, err := url.Parse(payURL)
	if err != nil || parsed.Path == "" || parsed.Path == "/" {
		return payURL + "/submit.php"
	}
	return payURL
}

func paymentMethodEnabled(methods []model.PaymentMethod, method string) bool {
	for _, item := range enabledPaymentMethods(methods) {
		if item.Type == method {
			return true
		}
	}
	return false
}

func centsText(cents int) string {
	return strconv.FormatFloat(float64(cents)/100, 'f', 2, 64)
}

func epayMoneyCents(value string) int {
	money, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil {
		return 0
	}
	return int(math.Round(money * 100))
}
