package model

import "encoding/json"

type SettingKey string

const (
	SettingKeyPublic  SettingKey = "public"
	SettingKeyPrivate SettingKey = "private"
)

// ModelChannel 模型渠道配置。
type ModelChannel struct {
	Protocol string   `json:"protocol"`
	Name     string   `json:"name"`
	BaseURL  string   `json:"baseUrl"`
	APIKey   string   `json:"apiKey"`
	Models   []string `json:"models"`
	Weight   int      `json:"weight"`
	Enabled  bool     `json:"enabled"`
	Remark   string   `json:"remark"`
}

// ModelCost 模型算力点配置。
type ModelCost struct {
	Model   string `json:"model"`
	Credits int    `json:"credits"`
}

// PublicModelChannelSetting 公开模型渠道配置。
type PublicModelChannelSetting struct {
	AvailableModels    []string    `json:"availableModels"`
	ModelCosts         []ModelCost `json:"modelCosts"`
	DefaultModel       string      `json:"defaultModel"`
	DefaultImageModel  string      `json:"defaultImageModel"`
	DefaultVideoModel  string      `json:"defaultVideoModel"`
	DefaultTextModel   string      `json:"defaultTextModel"`
	SystemPrompt       string      `json:"systemPrompt"`
	AllowCustomChannel *bool       `json:"allowCustomChannel"`
}

// PublicSetting 公开配置。
type PublicSetting struct {
	ModelChannel PublicModelChannelSetting `json:"modelChannel"`
	Auth         PublicAuthSetting         `json:"auth"`
	Payment      PublicPaymentSetting      `json:"payment"`
}

type PublicAuthSetting struct {
	AllowRegister     *bool                          `json:"allowRegister"`
	EmailVerification PublicEmailVerificationSetting `json:"emailVerification"`
}

type PublicEmailVerificationSetting struct {
	Enabled bool `json:"enabled"`
}

type PublicPaymentSetting struct {
	Epay PublicEpayPaymentSetting `json:"epay"`
}

type PublicEpayPaymentSetting struct {
	Enabled        bool            `json:"enabled"`
	Methods        []PaymentMethod `json:"methods"`
	MinCredits     int             `json:"minCredits"`
	PricePerCredit float64         `json:"pricePerCredit"`
}

type PaymentMethod struct {
	Type    string `json:"type"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

// PrivateSetting 私有配置。
type PrivateSetting struct {
	Channels   []ModelChannel        `json:"channels"`
	PromptSync PromptSyncSetting     `json:"promptSync"`
	Auth       PrivateAuthSetting    `json:"auth"`
	Payment    PrivatePaymentSetting `json:"payment"`
}

// PromptSyncSetting 提示词定时同步配置。
type PromptSyncSetting struct {
	Enabled *bool  `json:"enabled"`
	Cron    string `json:"cron"`
}

type PrivateAuthSetting struct {
	SMTP PrivateSMTPSetting `json:"smtp"`
}

type PrivateSMTPSetting struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
	FromName string `json:"fromName"`
	UseSSL   bool   `json:"useSsl"`
}

type PrivatePaymentSetting struct {
	Epay PrivateEpayPaymentSetting `json:"epay"`
}

type PrivateEpayPaymentSetting struct {
	Enabled        bool            `json:"enabled"`
	PayURL         string          `json:"payUrl"`
	PartnerID      string          `json:"partnerId"`
	Key            string          `json:"key"`
	CallbackOrigin string          `json:"callbackOrigin"`
	Methods        []PaymentMethod `json:"methods"`
	MinCredits     int             `json:"minCredits"`
	PricePerCredit float64         `json:"pricePerCredit"`
}

// Setting 系统配置。
type Setting struct {
	Key       SettingKey      `json:"key" gorm:"primaryKey"`
	Value     json.RawMessage `json:"value" gorm:"serializer:json"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

// Settings 系统公开和私有配置。
type Settings struct {
	Public  PublicSetting  `json:"public"`
	Private PrivateSetting `json:"private"`
}
