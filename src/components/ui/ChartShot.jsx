import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ImageOff, Maximize2, Moon, Sun, X, ChevronLeft, ChevronRight,
} from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { tvImage } from '../../lib/imageStore';
/* `loadForPixels` живе в tfDetect не випадково: там та сама потреба —
   прочитати чужу картинку попіксельно, обійшовши брак CORS-заголовка
   в TradingView. Другої копії тієї обхідної логіки бути не повинно. */
import { loadForPixels } from '../../lib/tfDetect';

/* ==================================================================
   Скрін графіка — той самий, що в блоках плану.

   Тут лише картинка: вибір таймфрейму й нотатка лишились у TdaBlock,
   бо вони частина саме плану. У розборі помилки нотатка вже є своя,
   зверху, і друге поле для тексту в одному вікні — це питання «а в
   яке з них писати».

   Що переїхало разом із картинкою і чому саме воно:

   `tvImage` — з TradingView копіюють посилання на СТОРІНКУ знімка, а
   не на файл. Без розгортання <img> отримує HTML і показує битий
   значок.

   Vision Guard — світлий графік на темному екрані б'є по очах уночі,
   а вночі журнал і заповнюють. Приглушення рахується з пікселів, а не
   з налаштувань: люди вставляють і світлі, і темні скріни впереміш.

   Стан «картинка не відкрилась» — знімки TradingView живуть не вічно,
   і без цього стану <img> схлопується в крихітний значок, а кнопки
   поверх нього стають недосяжними.
================================================================== */

/* Чи світлий графік. Читає пікселі, тому ходить через `loadForPixels`:
   у TradingView немає CORS-заголовка, і пряме читання canvas падає. */
function isLightChart(src) {
  return loadForPixels(src).then(
    (img) => {
      try {
        const c = document.createElement('canvas');
        const w = (c.width = 60);
        const h = (c.height = 60);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);

        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        }
        return sum / (data.length / 4) > 140;
      } catch {
        return false;
      }
    },
    () => false,
  );
}

function OverlayBtn({ icon: Icon, label, onClick, active, danger }) {
  const [hot, setHot] = useState(false);
  const tone = danger ? T.bad : active ? T.acc : T.text2;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      className="grid h-8 w-8 place-items-center rounded-lg backdrop-blur"
      style={{
        background: hot ? 'rgba(10,10,12,0.92)' : 'rgba(10,10,12,0.72)',
        border: `1px solid ${hot ? T.lineHi : T.line}`,
        color: tone,
        transition: 'all .18s',
      }}
    >
      <Icon size={14} strokeWidth={2.2} />
    </button>
  );
}

export default function ChartShot({
  images = [],
  onRemove,
  height = 320,
  className = '',
}) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const [broken, setBroken] = useState(false);
  const [dim, setDim] = useState(false);

  /* Приглушення вирішується для КОЖНОГО кадру окремо: у розборі
     часто лежать поруч світлий скрін із TradingView і темний із
     термінала. */
  const checked = useRef(new Set());

  const count = images.length;
  const src = count ? tvImage(images[Math.min(i, count - 1)]) : null;

  /* Вийшли за межі після видалення — стаємо на останній наявний. */
  useEffect(() => { if (i > count - 1) setI(Math.max(0, count - 1)); }, [count, i]);

  useEffect(() => { setBroken(false); setDim(false); }, [src]);

  useEffect(() => {
    if (!src || checked.current.has(src)) return;
    checked.current.add(src);
    isLightChart(src).then((light) => { if (light) setDim(true); });
  }, [src]);

  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % count);
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + count) % count);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [full, count]);

  if (!count) return null;

  return (
    <>
      <div
        className={`group/shot relative flex w-full items-center justify-center overflow-hidden rounded-[14px] ${className}`}
        style={{ height, background: T.bg, border: `1px solid ${T.line}` }}
      >
        {broken ? (
          <div className="flex flex-col items-center gap-2.5 px-6 text-center">
            <ImageOff size={24} strokeWidth={1.6} style={{ color: T.bad }} />
            <span className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
              Картинка не відкрилась
            </span>
            <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Посилання не на зображення або знімок уже видалено
            </span>
          </div>
        ) : (
          <motion.img
            key={src}
            src={src}
            alt="Графік"
            draggable={false}
            onClick={() => setFull(true)}
            onError={() => setBroken(true)}
            initial={{ opacity: 0, scale: 1.01 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="h-full w-full cursor-zoom-in object-contain"
            style={{
              filter: dim ? 'brightness(0.76) contrast(1.08)' : 'none',
              transition: 'filter .35s ease',
            }}
          />
        )}

        {/* Кнопки проявляються на наведення: на самому скріні вони
            перекривають свічки, а потрібні раз на десять переглядів. */}
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2 opacity-0 transition-opacity duration-200 group-hover/shot:opacity-100">
          {!broken && (
            <>
              <OverlayBtn icon={Maximize2} label="На весь екран" onClick={() => setFull(true)} />
              <OverlayBtn
                icon={dim ? Moon : Sun}
                label={dim ? 'Повернути яскравість' : 'Приглушити'}
                active={dim}
                onClick={() => setDim((v) => !v)}
              />
            </>
          )}
          {onRemove && (
            <OverlayBtn
              icon={X}
              label="Прибрати скрін"
              danger
              onClick={() => onRemove(images[Math.min(i, count - 1)])}
            />
          )}
        </div>

        {/* Карусель показується тільки коли є що гортати. */}
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Попередній скрін"
              onClick={() => setI((n) => (n - 1 + count) % count)}
              className="absolute left-2 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full opacity-0 transition-opacity group-hover/shot:opacity-100"
              style={{ background: 'rgba(10,10,12,0.78)', border: `1px solid ${T.line}`, color: T.text2 }}
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              aria-label="Наступний скрін"
              onClick={() => setI((n) => (n + 1) % count)}
              className="absolute right-2 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full opacity-0 transition-opacity group-hover/shot:opacity-100"
              style={{ background: 'rgba(10,10,12,0.78)', border: `1px solid ${T.line}`, color: T.text2 }}
            >
              <ChevronRight size={16} strokeWidth={2.4} />
            </button>

            <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5">
              {images.map((url, n) => (
                <button
                  key={url}
                  type="button"
                  aria-label={`Скрін ${n + 1}`}
                  onClick={() => setI(n)}
                  className="h-1.5 rounded-full transition-all duration-200"
                  style={{
                    width: n === i ? 18 : 6,
                    background: n === i ? T.acc : 'rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Фулскрін у портал на body: position fixed рахується від вікна
          тільки доти, доки жоден предок не має transform — а цей блок
          живе всередині анімованих модалок, де transform є завжди. */}
      {createPortal(
        <AnimatePresence>
          {full && !broken && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setFull(false)}
              className="fixed inset-0 grid cursor-zoom-out place-items-center p-6"
              style={{ zIndex: 3000, background: 'rgba(6,6,8,0.94)', backdropFilter: 'blur(6px)' }}
            >
              <motion.img
                key={src}
                src={src}
                alt="Графік"
                draggable={false}
                initial={{ scale: 0.97, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.97, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="max-h-full max-w-full object-contain"
                style={{ filter: dim ? 'brightness(0.82)' : 'none' }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
