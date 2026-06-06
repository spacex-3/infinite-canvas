package model

type PaymentOrderStatus string

const (
	PaymentOrderStatusPending PaymentOrderStatus = "pending"
	PaymentOrderStatusSuccess PaymentOrderStatus = "success"
	PaymentOrderStatusClosed  PaymentOrderStatus = "closed"
)

// PaymentOrder 用户充值订单。
type PaymentOrder struct {
	ID              string             `json:"id" gorm:"primaryKey"`
	UserID          string             `json:"userId" gorm:"index"`
	Credits         int                `json:"credits"`
	AmountCents     int                `json:"amountCents"`
	PaymentProvider string             `json:"paymentProvider"`
	PaymentMethod   string             `json:"paymentMethod"`
	ProviderTradeNo string             `json:"providerTradeNo"`
	Status          PaymentOrderStatus `json:"status" gorm:"index"`
	NotifyPayload   string             `json:"notifyPayload" gorm:"type:text"`
	CreatedAt       string             `json:"createdAt"`
	UpdatedAt       string             `json:"updatedAt"`
	PaidAt          string             `json:"paidAt"`
}

type PaymentOrderList struct {
	Items []PaymentOrder `json:"items"`
	Total int            `json:"total"`
}
