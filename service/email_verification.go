package service

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"html"
	"math/big"
	"net/mail"
	"net/smtp"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const emailCodeTTL = 10 * time.Minute

func SendRegisterEmailCode(email string) error {
	settings, err := repository.GetSettings()
	if err != nil {
		return err
	}
	settings = normalizeSettings(settings)
	if settings.Public.Auth.AllowRegister != nil && !*settings.Public.Auth.AllowRegister {
		return safeMessageError{message: "当前未开放注册"}
	}
	email, err = normalizeEmailAddress(email)
	if err != nil {
		return err
	}
	if _, ok, err := repository.GetUserByEmail(email); err != nil || ok {
		if err != nil {
			return err
		}
		return safeMessageError{message: "邮箱已被注册"}
	}
	code, err := randomEmailCode()
	if err != nil {
		return err
	}
	nowText := now()
	_, err = repository.SaveEmailVerification(model.EmailVerification{
		ID:        newID("email"),
		Email:     email,
		Code:      code,
		Scene:     model.EmailVerificationSceneRegister,
		ExpiresAt: time.Now().Add(emailCodeTTL).Format(time.RFC3339),
		CreatedAt: nowText,
	})
	if err != nil {
		return err
	}
	return sendSMTPEmail(settings.Private.Auth.SMTP, email, "朋克注册验证码", registerEmailBody(code))
}

func verifyRegisterEmailCode(email string, code string) error {
	email, err := normalizeEmailAddress(email)
	if err != nil {
		return err
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return safeMessageError{message: "请输入邮箱验证码"}
	}
	item, ok, err := repository.GetValidEmailVerification(email, model.EmailVerificationSceneRegister, code, now())
	if err != nil {
		return err
	}
	if !ok {
		return safeMessageError{message: "邮箱验证码错误或已过期"}
	}
	item.UsedAt = now()
	_, err = repository.SaveEmailVerification(item)
	return err
}

func normalizeEmailAddress(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", safeMessageError{message: "请输入邮箱"}
	}
	address, err := mail.ParseAddress(email)
	if err != nil || strings.ToLower(address.Address) != email {
		return "", safeMessageError{message: "邮箱格式不正确"}
	}
	return email, nil
}

func randomEmailCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func sendSMTPEmail(setting model.PrivateSMTPSetting, receiver string, subject string, body string) error {
	setting.Host = strings.TrimSpace(setting.Host)
	setting.Username = strings.TrimSpace(setting.Username)
	setting.From = strings.TrimSpace(setting.From)
	if setting.From == "" {
		setting.From = setting.Username
	}
	if setting.Host == "" || setting.From == "" {
		return safeMessageError{message: "SMTP 未配置"}
	}
	if setting.Port <= 0 {
		setting.Port = 25
	}
	fromName := strings.TrimSpace(setting.FromName)
	if fromName == "" {
		fromName = "朋克"
	}
	auth := smtp.Auth(nil)
	if setting.Username != "" || setting.Password != "" {
		auth = smtp.PlainAuth("", setting.Username, setting.Password, setting.Host)
	}
	message := []byte(fmt.Sprintf("To: %s\r\nFrom: %s <%s>\r\nSubject: %s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		receiver,
		mimeHeader(fromName),
		setting.From,
		mimeHeader(subject),
		body,
	))
	addr := fmt.Sprintf("%s:%d", setting.Host, setting.Port)
	if setting.UseSSL || setting.Port == 465 {
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: setting.Host, MinVersion: tls.VersionTLS12})
		if err != nil {
			return err
		}
		client, err := smtp.NewClient(conn, setting.Host)
		if err != nil {
			return err
		}
		defer client.Close()
		if auth != nil {
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
		if err := client.Mail(setting.From); err != nil {
			return err
		}
		if err := client.Rcpt(receiver); err != nil {
			return err
		}
		writer, err := client.Data()
		if err != nil {
			return err
		}
		if _, err := writer.Write(message); err != nil {
			_ = writer.Close()
			return err
		}
		return writer.Close()
	}
	return smtp.SendMail(addr, auth, setting.From, []string{receiver}, message)
}

func mimeHeader(value string) string {
	return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(value)) + "?="
}

func registerEmailBody(code string) string {
	return fmt.Sprintf(`<p>你的朋克注册验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px;">%s</p><p>验证码 10 分钟内有效。如果不是你本人操作，可以忽略这封邮件。</p>`, html.EscapeString(code))
}
