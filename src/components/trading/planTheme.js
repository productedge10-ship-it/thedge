/* Тема переїхала в src/lib/theme.js — це реекспорт для сумісності
   зі старими імпортами. Нові файли імпортують напряму з lib/theme. */
export { T, EASE, SPRING, SPRING_SOFT, useEdgeFonts, fadeUp, stagger } from '../../lib/theme';
