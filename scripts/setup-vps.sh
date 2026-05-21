#!/usr/bin/env bash
# =============================================================================
# Установка сайта Парусного клуба «Остров» на Linux Mint / Ubuntu / Debian
# Запускать от имени root: sudo bash setup-vps.sh
# =============================================================================

set -euo pipefail

APP_DIR=/srv/ostrov
DB_DIR=/var/lib/ostrov
REPO_URL=https://github.com/saschockk0/Ostrov2.git

# ── цвета для читаемого вывода ──────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}==>${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
abort() { echo -e "${RED}ОШИБКА:${NC} $*"; exit 1; }

[ "$EUID" -eq 0 ] || abort "Запустите скрипт через sudo: sudo bash $0"

# =============================================================================
info "1. Обновление системы и базовые пакеты"
# =============================================================================
apt-get update -q
apt-get install -y -q \
  git curl wget gnupg ca-certificates \
  build-essential python3 \
  nginx certbot python3-certbot-nginx \
  ufw

# =============================================================================
info "2. Node.js 20 LTS"
# =============================================================================
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

# =============================================================================
info "3. PM2 (менеджер процессов)"
# =============================================================================
npm install -g pm2

# =============================================================================
info "4. Клонирование репозитория"
# =============================================================================
if [ -d "$APP_DIR/.git" ]; then
  info "Репозиторий уже есть — обновляю"
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# =============================================================================
info "5. Установка зависимостей"
# =============================================================================
npm ci --omit=dev

# =============================================================================
info "6. Директория для базы данных"
# =============================================================================
mkdir -p "$DB_DIR"
chown www-data:www-data "$DB_DIR"

# =============================================================================
info "7. Файл .env"
# =============================================================================
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  # Путь к БД — вне git-checkout, чтобы не терять данные при git pull
  sed -i "s|^DB_PATH=.*|DB_PATH=$DB_DIR/ostrov.sqlite|" "$APP_DIR/.env"

  echo ""
  warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  warn "ВАЖНО: заполните переменные окружения в .env"
  warn "Команда: nano $APP_DIR/.env"
  warn ""
  warn "Что нужно заполнить:"
  warn "  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS"
  warn "  SMTP_FROM — адрес отправителя"
  warn "  MANAGER_EMAIL — куда приходят заявки"
  warn "  TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY — от cloudflare.com/turnstile"
  warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  read -rp "Нажмите Enter, чтобы открыть .env в редакторе (или Ctrl+C чтобы сделать это позже)..." _
  nano "$APP_DIR/.env"
fi

# =============================================================================
info "8. Запуск через PM2"
# =============================================================================
cd "$APP_DIR"
pm2 delete ostrov 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

# Регистрируем автозапуск при перезагрузке ноутбука
PM2_STARTUP=$(pm2 startup | grep "sudo" || true)
if [ -n "$PM2_STARTUP" ]; then
  eval "$PM2_STARTUP"
fi
pm2 save

# =============================================================================
info "9. Проверка — сайт отвечает локально?"
# =============================================================================
sleep 2
if curl -sf http://localhost:3000/api/config > /dev/null; then
  info "Сервер запущен. /api/config отвечает."
else
  abort "Сервер не отвечает на localhost:3000. Проверьте: pm2 logs ostrov"
fi

# =============================================================================
info "10. nginx"
# =============================================================================
# Выясняем домен или используем IP
echo ""
read -rp "Введите ваш домен (например: ostrov-club.ru) или оставьте пустым для работы по IP: " DOMAIN

if [ -n "$DOMAIN" ]; then
  cat > /etc/nginx/sites-available/ostrov <<NGINXCONF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 10m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
NGINXCONF
else
  # Без домена — слушаем на всех IP
  cat > /etc/nginx/sites-available/ostrov <<NGINXCONF
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 10m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
NGINXCONF
fi

ln -sf /etc/nginx/sites-available/ostrov /etc/nginx/sites-enabled/ostrov
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# =============================================================================
info "11. Firewall (ufw)"
# =============================================================================
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# =============================================================================
info "12. SSL (только если указан домен)"
# =============================================================================
if [ -n "$DOMAIN" ]; then
  echo ""
  warn "Для SSL домен $DOMAIN должен уже указывать на IP этого ноутбука."
  read -rp "Получить SSL-сертификат сейчас? (y/n): " GET_SSL
  if [ "$GET_SSL" = "y" ]; then
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN"
  else
    warn "Пропущено. Запустите позже: certbot --nginx -d $DOMAIN"
  fi
fi

# =============================================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  УСТАНОВКА ЗАВЕРШЕНА${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
EXTERNAL_IP=$(curl -s ifconfig.me 2>/dev/null || echo "не определён")
echo "  Внешний IP: $EXTERNAL_IP"
if [ -n "${DOMAIN:-}" ]; then
  echo "  Сайт:       http://$DOMAIN"
else
  echo "  Сайт:       http://$EXTERNAL_IP"
  echo "  (не забудьте пробросить порт 80 на роутере!)"
fi
echo ""
echo "  Полезные команды:"
echo "    pm2 status          — статус процесса"
echo "    pm2 logs ostrov     — логи приложения"
echo "    pm2 reload ostrov   — перезапуск без даунтайма"
echo ""
echo "  Обновление сайта:"
echo "    cd $APP_DIR && git pull && npm ci --omit=dev && pm2 reload ostrov"
echo ""
