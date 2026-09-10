import { useCallback, useMemo } from 'react';
import useCloudState from '../../hooks/useCloudState';
import { useStats } from './data';
import Board from './overview/Board';
import { PSYCH_DEFAULT, PSYCH_WIDGETS } from './psych/widgets';

/* ==================================================================
   Психологія.

   Була найдовшою сторінкою застосунку: дві нерівні колонки, у лівій
   сім панелей одна під одною, у правій ще три, і жодну з них не можна
   було ні прибрати, ні переставити. Людина, якій цікавий тільки
   ланцюг тільта, прокручувала повз усе інше щоразу.

   Тепер це та сама дошка, що в «Огляді» й «Перформансі»: свій реєстр
   віджетів, своя збережена розкладка, ті самі перетягування,
   налаштування й ширина на віджет. Уся верстка живе в psych/ — тут
   лише дані.
================================================================== */

const DAY = 86400000;
const since = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

const normalize = (v) => {
  if (!Array.isArray(v)) return PSYCH_DEFAULT;
  const clean = v
    .filter((x) => x && typeof x.id === 'string' && PSYCH_WIDGETS[x.id])
    .map((x) => ({
      id: x.id,
      w: Math.min(4, Math.max(1, Number(x.w) || 1)),
      /* Висота теж належить розкладці, а не вмісту. Стара збережена
         дошка про неї не знає, тому підставляємо ту, з якою віджет
         задумувався. */
      h: Math.min(4, Math.max(1, Number(x.h) || PSYCH_WIDGETS[x.id].defaultH || 2)),
      p: typeof x.p === 'string' ? x.p : 'inherit',
      o: x.o && typeof x.o === 'object' ? x.o : {},
    }));
  return v.length && !clean.length ? PSYCH_DEFAULT : clean;
};

export default function Psychology({ s, rows = [] }) {
  const [layout, setLayout, { saving }] = useCloudState(
    'analytics_psychology_v1',
    PSYCH_DEFAULT,
    { normalize },
  );

  const d7 = useMemo(() => { const b = since(7); return rows.filter((t) => t.date >= b); }, [rows]);
  const d30 = useMemo(() => { const b = since(30); return rows.filter((t) => t.date >= b); }, [rows]);
  const d90 = useMemo(() => { const b = since(90); return rows.filter((t) => t.date >= b); }, [rows]);

  const s7 = useStats(d7);
  const s30 = useStats(d30);
  const s90 = useStats(d90);
  const sAll = useStats(rows);

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
      registry={PSYCH_WIDGETS}
      defaults={PSYCH_DEFAULT}
    />
  );
}
