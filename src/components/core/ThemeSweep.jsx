import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { applyTheme } from '../../lib/themes';

/* ==================================================================
   Перемикання теми.

   Миттєва підміна кольорів на весь екран — найгірше, що можна
   зробити з очима: різкий стрибок яскравості читається як спалах, і
   в темній кімнаті це відчутно фізично.

   Тому по екрану проходить розмита діагональ — знизу зліва вгору
   направо, як перегорнута сторінка. Вона робить дві речі одразу:
   ховає момент підміни й дає оку півсекунди на адаптацію.

   Кольори міняємо не на початку й не в кінці, а рівно тоді, коли
   смуга накрила середину екрана. Тоді підміни не видно взагалі —
   людина бачить лише те, що з-під смуги виїжджає вже інший
   застосунок.
================================================================== */

const DUR = 820;      /* уся анімація */
const SWAP = 0.44;    /* коли міняти кольори, частка від тривалості */

export const EVENT = 'edge:theme';

/* Перемикач може стояти будь-де — до анімації долітає подія */
export const sweepTheme = (id) => {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
};

export default function ThemeSweep() {
  const [run, setRun] = useState(null);

  useEffect(() => {
    const onSweep = (e) => {
      const id = e.detail;

      /* Людині, яка вимкнула рух, ефект не потрібен: міняємо одразу */
      const noMotion = document.documentElement.classList.contains('edge-no-motion')
        || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      if (noMotion) { applyTheme(id); return; }

      setRun(id);
      const swap = setTimeout(() => applyTheme(id), DUR * SWAP);
      const done = setTimeout(() => setRun(null), DUR);

      return () => { clearTimeout(swap); clearTimeout(done); };
    };

    window.addEventListener(EVENT, onSweep);
    return () => window.removeEventListener(EVENT, onSweep);
  }, []);

  return (
    <AnimatePresence>
      {run && (
        <motion.div
          key="sweep"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[300] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Полотно навмисно більше за екран і повернуте на 45°:
              рухаємо його по одній осі, а на екрані це читається як
              діагональ. Рухається тільки transform, тому браузер
              малює це на композиторі й не перераховує сторінку. */}
          <motion.div
            className="absolute left-1/2 top-1/2"
            style={{
              width: '320vmax',
              height: '320vmax',
              marginLeft: '-160vmax',
              marginTop: '-160vmax',
              rotate: '45deg',
              transformOrigin: 'center',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              /* Мʼякий край: різка межа виглядала б як шторка, а не як
                 перегорнута сторінка. */
              background: `linear-gradient(
                to bottom,
                transparent 0%,
                rgba(139,123,255,0.05) 6%,
                rgba(139,123,255,0.12) 9%,
                rgba(139,123,255,0.05) 13%,
                transparent 22%
              )`,
              maskImage: 'linear-gradient(to bottom, transparent 0%, #000 9%, #000 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 9%, #000 100%)',
            }}
            initial={{ y: '86vmax' }}
            animate={{ y: '-170vmax' }}
            transition={{ duration: DUR / 1000, ease: [0.65, 0, 0.35, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
