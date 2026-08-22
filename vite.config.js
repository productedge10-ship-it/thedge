import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* ==================================================================
   Проксі календаря для розробки.

   На faireconomy.media немає заголовка CORS, і браузер не пускає туди
   запит з localhost. Це правило самого браузера, а не захист сайту —
   з фронтенду його не обходить ніхто.

   У продакшені запит робить serverless-функція (api/news.js). Тут же
   ту саму адресу /api/news підміняє dev-сервер: шлях у коді один і
   той самий, і нічого не треба перемикати між середовищами.

   Режим ?desc= в розробці не працює — проксі веде тільки на фід.
   Це навмисно: описи потрібні зрідка, а тримати два різні шляхи
   заради них означало б розсинхронізувати dev і прод.
================================================================== */
const FEEDS = { last: 'lastweek', this: 'thisweek', next: 'nextweek' }

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/news': {
        target: 'https://nfs.faireconomy.media',
        changeOrigin: true,
        rewrite: (path) => {
          const week = new URL(path, 'http://local').searchParams.get('week') || 'this'
          return `/ff_calendar_${FEEDS[week] || FEEDS.this}.json`
        },
      },
    },
  },
})
