/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'sans-serif'],
      },
      colors: {
        bgDark: '#111111',       // Основний дуже темний фон
        surface: '#1E1E1E',      // Фон карток
        surfaceHover: '#2A2A2A', // Фон при наведенні
        borderDark: '#2D2D2D',   // Колір рамок
        textMain: '#EDEDED',     // Світлий текст
        textMuted: '#A1A1AA',    // Сірий текст
        accent: '#3B82F6',       // Синій
        winGreen: '#10B981',     // Зелений
        lossRed: '#EF4444',      // Червоний
      }
    },
  },
  plugins: [],
}