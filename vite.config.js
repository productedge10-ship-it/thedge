import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* ==================================================================
   Локальний запуск серверних функцій.

   На faireconomy.media немає заголовка CORS, і браузер не пускає туди
   запит з localhost. Це правило самого браузера, а не захист сайту —
   з фронтенду його не обходить ніхто. У продакшені запит робить
   serverless-функція api/news.js.

   Раніше в розробці її підміняв проксі на фід. Працювало рівно для
   ?week=, а режим ?desc= в dev просто не існував — і кожну зміну в
   описах доводилось перевіряти деплоєм.

   Тепер dev-сервер запускає ту саму функцію. Vercel дає обробнику
   req.query і res.status().json(), у голого Node цього немає, тому
   нижче тонкий перехідник. Двадцять рядків замість двох середовищ,
   які треба тримати в голові окремо.
================================================================== */
function apiRoutes() {
  return {
    name: 'edge-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/news', async (req, res) => {
        try {
          /* ssrLoadModule, а не import: так правки в api/news.js
             підхоплюються без перезапуску сервера. */
          const mod = await server.ssrLoadModule('/api/news.js')

          const url = new URL(req.url || '/', 'http://localhost')
          req.query = Object.fromEntries(url.searchParams)

          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
            return res
          }
          res.send = (body) => { res.end(body); return res }

          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(e?.message || e) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiRoutes()],
})
