# Предоплата по СБП (ЮKassa)

Интеграция приёма предоплаты через Систему Быстрых Платежей на базе **ЮKassa**.

## Как это работает

```
Заявка отправлена  →  POST /api/applications        →  запись в applications (status='new')
                                                         + письмо менеджеру

Авто-сценарий:    клиент на экране успеха жмёт «Внести предоплату»
                  →  POST /api/applications/:id/payment  (сумма = % от расчёта)
                  →  редирект на confirmation_url ЮKassa (QR/выбор банка СБП)

Ручной сценарий:  менеджер в /ostrov-admin/ открывает заявку → «Выставить счёт»
                  →  POST /ostrov-admin/api/applications/:id/payment (произвольная сумма)
                  →  ссылка копируется + (опц.) уходит клиенту на email

Оплата прошла     →  ЮKassa шлёт webhook POST /api/webhooks/yookassa
                  →  статус перепроверяется через API ЮKassa (источник истины)
                  →  payments.status='succeeded', applications.paid_amount_kopecks
                  →  status 'new' → 'in_progress', письма клиенту и менеджеру
```

Чеки по 54-ФЗ формирует ЮKassa из объекта `receipt` (позиция «предоплата за услуги»,
`payment_mode=full_prepayment`). Нужен контакт покупателя — email или телефон из заявки.

## Переменные окружения

Добавьте в `.env` (файл `.env.example` в репозиторий не пишется — держите ключи только в `.env`):

```
# Ключи магазина ЮKassa (Личный кабинет → Интеграция → Ключи API)
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=live_or_test_secret_key

# Размер авто-предоплаты в % от суммы расчёта (по умолчанию 30)
SBP_DEFAULT_PREPAY_PERCENT=30

# Куда вернуть клиента после оплаты (по умолчанию <origin>/payment-result.html)
SBP_RETURN_URL=https://ваш-домен.ru/payment-result.html

# Код ставки НДС для чека (1 = без НДС). См. справочник ЮKassa.
YOOKASSA_VAT_CODE=1

# Проверять IP вебхука по списку сетей ЮKassa (true по умолчанию).
# Отключайте только при локальной отладке через туннель: YOOKASSA_WEBHOOK_IP_CHECK=false
YOOKASSA_WEBHOOK_IP_CHECK=true
```

Без `YOOKASSA_SHOP_ID`/`YOOKASSA_SECRET_KEY` онлайн-оплата автоматически выключена:
кнопка на сайте не показывается (`/api/config` → `prepayEnabled:false`), а ручное
выставление счёта в админке возвращает 503.

## Настройка вебхука

В ЛК ЮKassa → Интеграция → HTTP-уведомления укажите URL:
`https://ваш-домен.ru/api/webhooks/yookassa` и события `payment.succeeded`,
`payment.canceled`, `refund.succeeded`.

Для локальной отладки поднимите туннель (`cloudflared tunnel --url http://localhost:3000`
или `ngrok http 3000`), пропишите его адрес в ЛК и временно
`YOOKASSA_WEBHOOK_IP_CHECK=false`.

## Где лежит код

| Файл | Назначение |
|------|------------|
| `src/payments/yookassa.js` | Клиент API ЮKassa: createPayment (SBP+чек), getPayment, refund, проверка IP |
| `src/payments/payments-db.js` | CRUD по таблице `payments` |
| `src/database.js` | Схема таблицы `payments` + колонка `applications.paid_amount_kopecks` |
| `src/server.js` | Публичный `POST /api/applications/:id/payment`, `POST /api/webhooks/yookassa`, флаги в `/api/config` |
| `src/admin/router.js` | Менеджерские: список платежей, ручной счёт, возврат |
| `src/email.js` | `sendPaymentLink`, `sendPaymentSucceeded` |
| `public/admin/admin.js` | Блок «Платежи» в карточке заявки |
| `public/app.js` / `index.html` | CTA «Внести предоплату» на экране успеха |
| `public/payment-result.html` | Страница возврата после оплаты |

## Деньги и точность

Суммы хранятся в **копейках** (`amount_kopecks`), чтобы не терять точность на float.
`quote.total` из калькулятора — в рублях; конвертация — в одном месте
(`prepayKopecks` в server.js и `Math.round(rub*100)` в админ-роуте).
