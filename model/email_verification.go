package model

type EmailVerificationScene string

const (
	EmailVerificationSceneRegister EmailVerificationScene = "register"
)

// EmailVerification 邮箱验证码记录。
type EmailVerification struct {
	ID        string                 `json:"id" gorm:"primaryKey"`
	Email     string                 `json:"email" gorm:"index"`
	Code      string                 `json:"code"`
	Scene     EmailVerificationScene `json:"scene" gorm:"index"`
	ExpiresAt string                 `json:"expiresAt" gorm:"index"`
	UsedAt    string                 `json:"usedAt"`
	CreatedAt string                 `json:"createdAt"`
}
