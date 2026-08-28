import { defineConfig, loadEnv } from 'vite'
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
      /* Один middleware на всю теку api/, а не окремий роут на файл:
         /api/news → api/news.js, /api/verify-email → api/verify-email.js.
         Connect зрізає префікс '/api', тож у req.url лишається '/news?…'. */
      server.middlewares.use('/api', async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const name = url.pathname.replace(/^\/+/, '').split('/')[0]
        if (!name) return next()

        try {
          /* ssrLoadModule, а не import: так правки в обробниках
             підхоплюються без перезапуску сервера. */
          const mod = await server.ssrLoadModule(`/api/${name}.js`)

          req.query = Object.fromEntries(url.searchParams)

          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
            return res
          }
          res.send = (body) => { res.end(body); return res }
          /* Потрібен для підтвердження пошти: юзер клікає лінк у листі,
             обробник перевіряє токен і відправляє його назад у застосунок. */
          res.redirect = (code, to) => {
            const [status, target] = typeof code === 'number' ? [code, to] : [302, code]
            res.statusCode = status
            res.setHeader('Location', target)
            res.end()
            return res
          }

          await mod.default(req, res)
        } catch (e) {
          /* Такого файлу немає — це не збій API, а звичайний 404:
             віддаємо запит далі, хай ним займається Vite. */
          if (/Failed to load url|Cannot find module/i.test(String(e?.message))) return next()

          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(e?.message || e) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  /* Vite сам кладе у код лише змінні з префіксом VITE_, і то в
     import.meta.env — а обробники в api/ читають process.env, бо на
     хостингу живуть саме там. Локально через це всі ключі виявлялись
     undefined, і функція мовчки падала.

     Третій аргумент '' — порожній префікс: беремо всі змінні, а не
     тільки VITE_. Вони потрібні серверній частині, у браузер не
     потрапляють. */
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [react(), apiRoutes()],
  }
})
