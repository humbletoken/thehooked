# 🎣 Hooked — кооперативная рыбалка в Telegram

Мультяшная 2D-рыбалка в виде Telegram Mini App. Бот: **@HookedGame**.

- соло-режим и комнаты на **до 5 игроков** (публичные — видны в списке, приватные — вход по коду или ссылке-приглашению);
- **15 видов рыб** пяти редкостей (часть клюёт только днём или только ночью) и **5 удочек**;
- рабочая механика: заброс (сила = глубина) → поклёвка → подсечка → вываживание с натяжением лески;
- кастомизация персонажа при первом запуске: кожа, причёска, одежда, низ, головные уборы, аксессуары, цвета;
- коллекция, садок, продажа улова, уровни и опыт, магазин удочек и одежды, топ рыбаков — всё хранится в SQLite;
- процедурные звуки природы (вода, ветер, птицы, сверчки ночью), спокойная музыка и игровые эффекты;
- смена дня и ночи по местному времени, анимированный экран загрузки;
- бот с меню из цветных кнопок и премиум-эмодзи из набора [tgiosicons](https://t.me/addemoji/tgiosicons).

## Структура

```
bot.js              — ВСЁ серверное: сайт + API + WebSocket-комнаты + SQLite + Telegram-бот
public/index.html   — мини-приложение
public/css/style.css
public/js/data.js   — данные игры (рыбы, удочки, предметы, правила) — общие для сервера и клиента
public/js/art.js    — векторные модели: персонажи, рыбы, удочки, иконки
public/js/scene.js  — сцена озера (canvas)
public/js/game.js   — механика рыбалки и HUD
public/js/audio.js  — звуки и музыка (WebAudio, без файлов)
public/js/net.js    — API/WebSocket + офлайн-режим
public/js/app.js    — меню, экраны, кастомизация, комнаты
```

## Запуск

Нужен Node.js **22.13+** (используется встроенный модуль `node:sqlite`, нативные зависимости не нужны).

```bash
cp .env.example .env     # заполните BOT_TOKEN и DOMAIN
npm install
npm start
```

### Docker

`.env` в образ не копируется — настройки передаются при запуске.

```bash
docker build -t hooked .
docker run -d --name hooked --env-file .env -p 3000:3000 -v hooked-data:/app/data hooked
```

или `docker compose up -d --build`.

Сайт должен быть доступен по **HTTPS** на домене из `DOMAIN` (например, через nginx/Caddy/Cloudflare перед портом 3000). Не забудьте проксировать WebSocket по пути `/ws`.

## Настройка бота в @BotFather

1. `/newbot` → получите токен, впишите в `BOT_TOKEN`.
2. `Bot Settings → Configure Mini App → Enable Mini App` → укажите `https://ВАШ_ДОМЕН/` — так заработают ссылки вида `t.me/HookedGame?startapp=room_XXXXX` (приглашения в комнату).
3. (необязательно) `Bot Settings → Inline Mode` — чтобы приглашать друзей через `@HookedGame` в любом чате.
4. Кнопку меню «Играть» и команды бот выставит сам при запуске.

### Премиум-эмодзи и цветные кнопки

Кнопки меню используют поле `style` (`success` — зелёная, `primary` — синяя, `danger` — красная) и `icon_custom_emoji_id`.
Иконки бот при старте берёт из набора `tgiosicons` через `getStickerSet` и подбирает по эмодзи-тегу каждой иконки.
Telegram показывает премиум-эмодзи от бота, только если у **владельца бота есть Telegram Premium** (или куплен юзернейм на Fragment).
Если это недоступно, бот автоматически переключится на обычные эмодзи. Команда `/emoji` (для `ADMIN_IDS`) покажет, какие иконки подобраны;
любую можно заменить через `EMOJI_IDS`.

## Переменные окружения

| Переменная | Описание |
|---|---|
| `BOT_TOKEN` | токен бота |
| `DOMAIN` | домен сайта (https) |
| `BOT_USERNAME` | юзернейм бота, по умолчанию `HookedGame` |
| `APP_SHORT_NAME` | короткое имя Mini App для ссылок `t.me/<бот>/<имя>` (необязательно) |
| `PORT` | порт веб-сервера, по умолчанию 3000 |
| `BOT_MODE` | `polling` (по умолчанию) или `webhook` |
| `WEBHOOK_SECRET` | секрет пути вебхука (по умолчанию выводится из токена) |
| `DB_PATH` | путь к файлу SQLite |
| `START_COINS` | монеты на старте |
| `EMOJI_PACK` / `EMOJI_IDS` | набор премиум-эмодзи / ручная замена ID |
| `ADMIN_IDS` | Telegram ID админов |
| `ALLOW_GUEST` | вход без Telegram (только для отладки) |

## Офлайн-демо

Откройте `public/index.html` прямо из папки (двойным кликом) — игра запустится в офлайн-режиме: прогресс хранится в браузере,
соло-рыбалка работает полностью. Параметр `?demo=1&screen=coop` показывает кооп-комнату с ботами
(другие значения `screen`: `home custom shop wear collection keepnet info profile rooms create fish game aim reel catch`; `hour=22` — ночь).

## Скриншоты

Дизайн игры — в папке [`screenshots/`](screenshots) (сняты в офлайн-демо, без запуска бота и сайта):

| | | |
|---|---|---|
| ![](screenshots/01-loading.png) | ![](screenshots/02-customize.png) | ![](screenshots/03-home.png) |
| ![](screenshots/04-solo-wait.png) | ![](screenshots/06-reeling.png) | ![](screenshots/07-catch.png) |
| ![](screenshots/08-coop.png) | ![](screenshots/09-coop-night.png) | ![](screenshots/14-collection.png) |
