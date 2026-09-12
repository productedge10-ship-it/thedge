import { useCallback, useMemo } from 'react';
import useCloudState from '../../hooks/useCloudState';
import { useStats } from './data';
import Board from './overview/Board';
import { DEFAULT_LAYOUT, WIDGETS } from './overview/widgets';

/* ==================================================================
   Огляд.

   Тонка обгортка над дошкою: тримає розкладку й готує зрізи журналу
   за періодами. Уся верстка живе у overview/ — тут лише дані.

   Періодів рахується чотири плюс той, що обрано зверху сторінки.
   Здається марнотратним, але кожен зріз — це один прохід по вибірці
   в кілька сотень рядків, і робиться він у useMemo. Альтернатива —
   рахувати на кожен віджет окремо — дала б п'ять однакових проходів
   там, де вистачає одного.
================================================================== */

const DAY = 86400000;

/* Межа періоду в тому ж форматі, що й дата угоди: рядок YYYY-MM-DD.
   Порівнювати рядки дешевше, ніж будувати Date на кожен елемент. */
const since = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

/* Прибираємо з розкладки те, чого вже немає в реєстрі, і чинимо
   зіпсовані записи. Збережена дошка переживає оновлення застосунку:
   якщо віджет прибрали з коду, сторінка не має падати через рядок у
   базі, який на нього посилається. */
const normalize = (v) => {
  if (!Array.isArray(v)) return DEFAULT_LAYOUT;
  const clean = v
    .filter((x) => x && typeof x.id === 'string' && WIDGETS[x.id])
    .map((x) => ({
      id: x.id,
      /* Обмежень знизу немає навмисно: будь-який віджет має вміти
         стиснутись до чверті. Крива еквіті у вузькій колонці читається
         гірше — але це вибір людини, а не помилка, яку треба
         виправляти за неї. */
      w: Math.min(4, Math.max(1, Number(x.w) || 1)),
      /* Висота теж належить розкладці, а не вмісту. Стара збережена
         дошка про неї не знає, тому підставляємо ту, з якою віджет
         задумувався.

         Але на відміну від ширини, тут є нижня межа — і не 1, а
         `minH` віджета. Список на п'ять рядків чи серії з трьох
         рядків фізично не влазять у чверть клітинки: це не вибір
         людини, як вузька крива, а зламане верстання, яке обрізає
         текст. Якщо колись давно зберігся h:1 для такого віджета,
         він підтягується вгору й тут, а не тільки для нових карток. */
      h: Math.min(4, Math.max(WIDGETS[x.id].minH || 1, Number(x.h) || WIDGETS[x.id].defaultH || 2)),
      p: typeof x.p === 'string' ? x.p : 'inherit',
      o: x.o && typeof x.o === 'object' ? x.o : {},
    }));
  /* Порожній масив — теж валідний стан: людина могла прибрати все
     свідомо, і підсовувати їй розкладку назад було б нахабством.
     Повертаємо стандарт лише коли не лишилось жодного впізнаваного
     запису, тобто дані справді зіпсовані. */
  return v.length && !clean.length ? DEFAULT_LAYOUT : clean;
};

export default function Overview({ s, rows = [] }) {
  const [layout, setLayout, { saving }] = useCloudState(
    'analytics_overview_v1',
    DEFAULT_LAYOUT,
    { normalize },
  );

  const d7 = useMemo(() => { const b = since(7); return rows.filter((t) => t.date >= b); }, [rows]);
  const d30 = useMemo(() => { const b = since(30); return rows.filter((t) => t.date >= b); }, [rows]);
  const d90 = useMemo(() => { const b = since(90); return rows.filter((t) => t.date >= b); }, [rows]);

  const s7 = useStats(d7);
  const s30 = useStats(d30);
  const s90 = useStats(d90);
  const sAll = useStats(rows);

  /* Віджет питає свій період — дошка не знає, звідки беруться цифри.
     Так само працюватиме, коли зрізів стане більше. */
  const statsFor = useCallback((period) => {
    switch (period) {
      case '7': return s7;
      case '30': return s30;
      case '90': return s90;
      case 'all': return sAll;
      default: return s;
    }
  }, [s, s7, s30, s90, sAll]);

  return (
    <Board
      layout={layout}
      setLayout={setLayout}
      statsFor={statsFor}
      saving={saving}
    />
  );
}
