/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* Шрифт — та сама змінна, що й у T.sans: раніше тут стояв Roboto,
         і клас font-sans давав гарнітуру, якої в інтерфейсі більше немає. */
      fontFamily: {
        sans: ['var(--edge-sans, "Golos Text")', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* Єдине джерело кольорів — CSS-змінні з lib/themes.js. Тут
           жила третя, окрема палітра (#111, синій акцент #3B82F6),
           яка не збігалась ні з застосунком, ні з лендінгом і не
           перемикалась разом із темою.

           Старі імена лишаються аліасами: ними користуються кілька
           селектів (AssetSelect, FilterSelect, ResultSelect), і
           видалити імена — значить тихо втратити там колір. Модифікатори
           прозорості (bg-accent/20) з var() не працюють, але таких
           використань зараз немає. */
        bgDark: 'var(--edge-bg)',
        surface: 'var(--edge-surface)',
        surfaceHover: 'var(--edge-surface-hi)',
        borderDark: 'var(--edge-line)',
        textMain: 'var(--edge-text)',
        textMuted: 'var(--edge-text3)',
        accent: 'var(--edge-acc)',
        winGreen: 'var(--edge-ok)',
        lossRed: 'var(--edge-bad)',

        /* Новий простір імен для класів: bg-edge-surface2, text-edge-text3,
           border-edge-line тощо. Коротше за bg-[var(--edge-…)] і не дає
           вписати колір повз токени. */
        edge: {
          bg: 'var(--edge-bg)',
          surface: 'var(--edge-surface)',
          surface2: 'var(--edge-surface-hi)',
          surface3: 'var(--edge-surface-3)',
          sunken: 'var(--edge-sunken)',
          line: 'var(--edge-line)',
          'line-hi': 'var(--edge-line-hi)',
          'line-input': 'var(--edge-line-input)',
          text: 'var(--edge-text)',
          text2: 'var(--edge-text2)',
          text3: 'var(--edge-text3)',
          text4: 'var(--edge-text4)',
          disabled: 'var(--edge-disabled)',
          acc: 'var(--edge-acc)',
          'acc-hover': 'var(--edge-acc-hover)',
          'acc-press': 'var(--edge-acc-press)',
          'acc-text': 'var(--edge-acc-text)',
          'on-acc': 'var(--edge-on-acc)',
          ok: 'var(--edge-ok)',
          warn: 'var(--edge-warn)',
          bad: 'var(--edge-bad)',
          info: 'var(--edge-info)',
        },
      }
    },
  },
  plugins: [],
}
