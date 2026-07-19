package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestPendingUsersAreBlockedUntilAdministratorApproval(t *testing.T) {
	if got := loginStatusMessage(model.UserStatusPending); got != "账号正在等待管理员审核" {
		t.Fatalf("pending login message = %q", got)
	}
	if got := loginStatusMessage(model.UserStatusBan); got != "账号已被禁用" {
		t.Fatalf("ban login message = %q", got)
	}
}
