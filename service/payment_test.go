package service

import "testing"

func TestEpaySignSortsParamsAndSkipsSignatureFields(t *testing.T) {
	params := map[string]string{
		"type":         "alipay",
		"pid":          "1001",
		"out_trade_no": "pay-1",
		"money":        "1.00",
		"name":         "充值",
		"sign":         "ignored",
		"sign_type":    "MD5",
	}
	got := epaySign(params, "abc")
	want := "a52e1555608ada3292619ec0bf096fe4"
	if got != want {
		t.Fatalf("epaySign = %q, want %q", got, want)
	}
}

func TestNormalizeEpaySubmitURL(t *testing.T) {
	if got := normalizeEpaySubmitURL("https://pay.example.com"); got != "https://pay.example.com/submit.php" {
		t.Fatalf("normalizeEpaySubmitURL host = %q", got)
	}
	if got := normalizeEpaySubmitURL("https://pay.example.com/submit.php"); got != "https://pay.example.com/submit.php" {
		t.Fatalf("normalizeEpaySubmitURL file = %q", got)
	}
}
