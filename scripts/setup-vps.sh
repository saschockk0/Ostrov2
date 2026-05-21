#!/usr/bin/env bash
# Первичная настройка VPS для сайта Парусного клуба «Остров»
# Запускать под root (или через sudo) на Ubuntu 22.04 / Debian 12

set -euo pipefail

APP_DIR=/srv/ostrov
DB_DIR=/var/lib/ostrov
APP_USER=www-data

echo "=== 1. Node.js 20 LTS ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "=== 2. PM2 ==="
npm install -g pm2

echo "=== 3. nginx + certbot ==="
apt-get install -y nginx certbot python3-certbot-nginx

echo "=== 4. Директория для базы данных ==="
mkdir -p "$DB_DIR"
chown "$APP_USER":"$APP_USER" "$DB_DIR"

echo "=== 5. Клонирование репозитория ==="
# Замените URL на адрес вашего репозитория
git clone https://github.com/YOURUSER/Ostrov2.git "$APP_DIR"
cd "$APP_DIR"

echo "=== 6. Зависимости ==="
npm ci --omit=dev

echo "=== 7. Переменные окружения ==="
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo ">>> ВАЖНО: отредактируйте $APP_DIR/.env — заполните SMTP и TURNSTILE ключи <<<"
  echo ">>> nano $APP_DIR/.env"
  echo ""
fi

# Путь к БД вне git-checkout — переживает git pull
grep -q "DB_PATH" "$APP_DIR/.env" || echo "DB_PATH=$DB_DIR/ostrov.sqlite" >> "$APP_DIR/.env"

echo "=== 8. nginx ==="
cp "$APP_DIR/scripts/nginx.conf" /etc/nginx/sites-available/ostrov
ln -sf /etc/nginx/sites-available/ostrov /etc/nginx/sites-enabled/ostrov
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== 9. Запуск через PM2 ==="
cd "$APP_DIR"
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup | tail -1 | bash   # регистрирует автозапуск при ребуте

echo ""
echo "=== ГОТОВО ==="
echo "Сайт запущен на http://localhost:3000 (через nginx — на 80)"
echo ""
echo "Следующие шаги:"
echo "  1. Заполните .env: nano $APP_DIR/.env"
echo "  2. SSL: certbot --nginx -d ostrov-club.ru -d www.ostrov-club.ru"
echo "  3. Проверка: pm2 status"
echo ""
echo "Деплой обновлений:"
echo "  cd $APP_DIR && git pull && npm ci --omit=dev && pm2 reload ostrov"
