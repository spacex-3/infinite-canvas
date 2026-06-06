package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func SaveEmailVerification(item model.EmailVerification) (model.EmailVerification, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	return item, db.Save(&item).Error
}

func GetValidEmailVerification(email string, scene model.EmailVerificationScene, code string, now string) (model.EmailVerification, bool, error) {
	db, err := DB()
	if err != nil {
		return model.EmailVerification{}, false, err
	}
	item := model.EmailVerification{}
	err = db.Where("email = ? AND scene = ? AND code = ? AND used_at = ? AND expires_at > ?", email, scene, code, "", now).Order("created_at desc").First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.EmailVerification{}, false, nil
	}
	return item, err == nil, err
}
