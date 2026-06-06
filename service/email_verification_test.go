package service

import "testing"

func TestNormalizeEmailLowercasesAndTrims(t *testing.T) {
	got, err := normalizeEmailAddress("  User@Example.COM ")
	if err != nil {
		t.Fatalf("normalizeEmailAddress returned error: %v", err)
	}
	if got != "user@example.com" {
		t.Fatalf("normalizeEmailAddress = %q, want user@example.com", got)
	}
}

func TestRandomEmailCodeHasSixDigits(t *testing.T) {
	code, err := randomEmailCode()
	if err != nil {
		t.Fatalf("randomEmailCode returned error: %v", err)
	}
	if len(code) != 6 {
		t.Fatalf("code length = %d, want 6", len(code))
	}
	for _, char := range code {
		if char < '0' || char > '9' {
			t.Fatalf("code contains non digit: %q", code)
		}
	}
}
