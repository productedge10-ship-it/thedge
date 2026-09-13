import { useCallback, useMemo } from 'react';
import useCloudState from '../../hooks/useCloudState';
import { useStats } from './data';
import Board from './overview/Board';
import {
  PSYCH_MAIN_WIDGETS, PSYCH_MAIN_DEFAULT, PSYCH_SIDE_WIDGETS, PSYCH_SIDE_DEFAULT,
} from './psych/widgets';

/* ==================================================================
   Психологія.

   Стара сторінка стояла на двох нерівних колонках — широкій зліва
   (нейропрофіль, тільт, емоції, стани, помилки, план і ризик) і
   вужчій, приклеєній справа (AI-психолог, вердикт, чек-лист), яка не
   гортається разом з рештою. Дошка з «Огляду» цього не вміє: одна
   сітка на весь реєстр. Тому тут не одна дошка, а дві — кожна зі
   своєю збереженою розкладкою й бібліотекою, — а 2fr/1fr-верстку й
   sticky для правої малює сам цей файл, не Board.
================================================================== */

const DAY = 86400000;
const since = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

/* Одна й та сама перевірка збереженої розкладки для обох дощок —
   різниться лише реєстр і дефолт, з яких вона звіряє id та висоту. */
const makeNormalize = (WIDGETS, DEFAULT) => (v) => {
  if (!Array.isArray(v)) return DEFAULT;
  const clean = v
    .filter((x) => x && typeof x.id === 'string' && WIDGETS[x.id])
    .map((x) => ({
      id: x.id,
      w: Math.min(4, Math.max(1, Number(x.w) || 1)),
      /* Висота теж належить розкладці, а не вмісту. Стара збережена
         дошка про неї не знає, тому підставляємо ту, з якою віджет
         задумувався. */
      h: Math.min(4, Math.max(1, Number(x.h) || WIDGETS[x.id].defaultH || 2)),
      p: typeof x.p === 'string' ? x.p : 'inherit',
      o: x.o && typeof x.o === 'object' ? x.o : {},
    }));
  return v.length && !clean.length ? DEFAULT : clean;
};

const normalizeMain = makeNormalize(PSYCH_MAIN_WIDGETS, PSYCH_MAIN_DEFAULT);
const normalizeSide = makeNormalize(PSYCH_SIDE_WIDGETS, PSYCH_SIDE_DEFAULT);

export default function Psychology({ s, rows = [] }) {
  const [mainLayout, setMainLayout, { saving: savingMain }] = useCloudState(
    'analytics_psychology_main_v1',
    PSYCH_MAIN_DEFAULT,
    { normalize: normalizeMain },
  );
  const [sideLayout, setSideLayout, { saving: savingSide }] = useCloudState(
    'analytics_psychology_side_v1',
    PSYCH_SIDE_DEFAULT,
    { normalize: normalizeSide },
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
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <Board
        layout={mainLayout}
        setLayout={setMainLayout}
        statsFor={statsFor}
        saving={savingMain}
        registry={PSYCH_MAIN_WIDGETS}
        defaults={PSYCH_MAIN_DEFAULT}
      />

      <div className="xl:sticky xl:top-5">
        <Board
          layout={sideLayout}
          setLayout={setSideLayout}
          statsFor={statsFor}
          saving={savingSide}
          registry={PSYCH_SIDE_WIDGETS}
          defaults={PSYCH_SIDE_DEFAULT}
        />
      </div>
    </div>
  );
}
