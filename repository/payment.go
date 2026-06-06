package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SavePaymentOrder(order model.PaymentOrder) (model.PaymentOrder, error) {
	db, err := DB()
	if err != nil {
		return order, err
	}
	return order, db.Save(&order).Error
}

func GetPaymentOrderByID(id string) (model.PaymentOrder, bool, error) {
	db, err := DB()
	if err != nil {
		return model.PaymentOrder{}, false, err
	}
	order := model.PaymentOrder{}
	err = db.Where("id = ?", id).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.PaymentOrder{}, false, nil
	}
	return order, err == nil, err
}

func ListPaymentOrders(userID string, q model.Query) ([]model.PaymentOrder, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.PaymentOrder{}).Where("user_id = ?", userID)
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		tx = tx.Where("id LIKE ? OR provider_trade_no LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var orders []model.PaymentOrder
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&orders).Error
	return orders, total, err
}

func CompletePaymentOrder(id string, providerTradeNo string, paymentMethod string, notifyPayload string, now string) (model.PaymentOrder, model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.PaymentOrder{}, model.User{}, false, err
	}
	var order model.PaymentOrder
	var user model.User
	completed := false
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ?", id).First(&order).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return gorm.ErrRecordNotFound
			}
			return err
		}
		if order.Status != model.PaymentOrderStatusPending {
			if err := tx.Where("id = ?", order.UserID).First(&user).Error; err != nil {
				return err
			}
			return nil
		}
		updates := map[string]any{
			"status":            model.PaymentOrderStatusSuccess,
			"provider_trade_no": providerTradeNo,
			"payment_method":    paymentMethod,
			"notify_payload":    notifyPayload,
			"paid_at":           now,
			"updated_at":        now,
		}
		txOrder := tx.Model(&model.PaymentOrder{}).Where("id = ? AND status = ?", id, model.PaymentOrderStatusPending).Updates(updates)
		if txOrder.Error != nil {
			return txOrder.Error
		}
		if txOrder.RowsAffected == 0 {
			if err := tx.Where("id = ?", order.UserID).First(&user).Error; err != nil {
				return err
			}
			return nil
		}
		if err := tx.Model(&model.User{}).Where("id = ?", order.UserID).Updates(map[string]any{
			"credits":    gorm.Expr("credits + ?", order.Credits),
			"updated_at": now,
		}).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", order.UserID).First(&user).Error; err != nil {
			return err
		}
		order.Status = model.PaymentOrderStatusSuccess
		order.ProviderTradeNo = providerTradeNo
		order.PaymentMethod = paymentMethod
		order.NotifyPayload = notifyPayload
		order.PaidAt = now
		order.UpdatedAt = now
		completed = true
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.PaymentOrder{}, model.User{}, false, nil
	}
	return order, user, completed, err
}
