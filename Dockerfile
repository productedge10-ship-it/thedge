# ==================================================================
# Збірка й запуск на власному сервері.
#
# Два етапи навмисно. Для збірки потрібні Vite, Tailwind, eslint і
# решта devDependencies — разом із кешем npm це під гігабайт. У
# готовому образі з усього цього не потрібне ніщо: там лежить уже
# зібраний `dist` і кілька файлів сервера.
#
# Тримати збірку в одному шарі з запуском означає щоразу тягати цей
# гігабайт на сервер і тримати його на диску — на VPS, де диск
# рахують.
# ==================================================================

# ---------- 1. Збірка ----------
FROM node:20-alpine AS build

WORKDIR /app

# Спершу тільки маніфести. Поки вони не змінились, Docker бере
# встановлені пакети з кешу й не качає їх заново — а це найдовший
# крок збірки. Скопіюєш увесь проєкт одразу — кеш злітатиме від
# правки будь-якого рядка в будь-якому файлі.
COPY package.json package-lock.json ./

# `ci`, а не `install`: ставить рівно те, що записано в lock-файлі, і
# падає, якщо lock розійшовся з package.json. `install` у такому разі
# мовчки підтягнув би інші версії — і збірка на сервері відрізнялась
# би від тієї, що працює локально.
RUN npm ci

COPY . .

RUN npm run build

# ---------- 2. Запуск ----------
FROM node:20-alpine AS run

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

# Без devDependencies. Функціям з /api потрібен лише клієнт Supabase,
# він у звичайних залежностях.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY netlify ./netlify
COPY api ./api

# Не з-під root. Якщо колись у цьому сервері знайдуть діру, різниця
# між «зламали процес» і «зламали машину» — саме цей рядок.
USER node

EXPOSE 3000

# Перевірка життя, щоб Coolify перемикав трафік на новий контейнер
# тільки коли той справді відповідає, а не щойно стартував процес.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
