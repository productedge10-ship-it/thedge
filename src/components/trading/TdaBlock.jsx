import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ImagePlus, ImageOff, Moon, Sun, Maximize2, Clock } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import { notify } from '../../utils/notify';
import TfSelect from '../ui/TfSelect';
import useDeferredField from '../../hooks/useDeferredField';
import { T, EASE, SPRING } from './planTheme';
import { tvImage } from '../../lib/imageStore';
import { detectTimeframe, loadForPixels } from '../../lib/tfDetect';
import { useSettings } from '../../context/SettingsContext';

/* Визначає, чи світлий графік — щоб автоматично приглушити його.

   Читає пікселі, тому ходить через той самий loadForPixels: у
   TradingView немає CORS-заголовка, і пряме читання canvas падає.
   Доти ця перевірка мовчки не спрацьовувала жодного разу. */
function detectLightBackground(src) {
  return loadForPixels(src).then(
    (probe) => {
      try {
        const c = document.createElement('canvas');
        c.width = 10; c.height = 10;
        const ctx = c.getContext('2d');
        ctx.drawImage(probe, 0, 0, 10, 10);
        const d = ctx.getImageData(0, 0, 10, 10).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        const brightness = ((r / n) * 299 + (g / n) * 587 + (b / n) * 114) / 1000;
        return { success: true, isLight: brightness > 160 };
      } catch { return { success: false, isLight: false }; }
    },
    () => ({ success: false, isLight: false }),
  );
}

/* Плаваюча кнопка поверх графіка */
function OverlayBtn({ icon: Icon, label, onClick, danger, active }) {
  return (
    <div className="group/btn relative flex items-center">
      <span
        className="pointer-events-none absolute right-[calc(100%+8px)] translate-x-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-semibold opacity-0 transition-all duration-200 group-hover/btn:translate-x-0 group-hover/btn:opacity-100"
        style={{
          background: 'rgba(10,10,12,0.94)',
          border: `1px solid ${T.line}`,
          color: danger ? T.bad : T.text2,
          fontFamily: T.sans,
        }}
      >
        {label}
      </span>
      <button
        onClick={onClick}
        className="grid h-8 w-8 place-items-center rounded-lg transition-all duration-200 active:scale-90"
        style={{
          background: 'rgba(10,10,12,0.86)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${active ? T.lineAcc : T.line}`,
          color: active ? T.acc : T.text2,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = danger ? `rgba(${T.badRgb},0.5)` : T.lineHi;
          e.currentTarget.style.color = danger ? T.bad : T.text;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = active ? T.lineAcc : T.line;
          e.currentTarget.style.color = active ? T.acc : T.text2;
        }}
      >
        <Icon size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function TdaBlock({ id, tf, image, text, isDimmed, onSave, eyebrow }) {
  /* Автовибір таймфрейму можна вимкнути в налаштуваннях. Читаємо з
     запасним `!== false`: поки налаштування ще не доїхали з бази, поле
     порожнє, і жорстка перевірка на `true` мовчки вимикала б
     розпізнавання на першій вставці після входу. */
  const { autoTf } = useSettings();
  const [full, setFull] = useState(false);
  const [dim, setDim] = useState(isDimmed || false);
  const [dropHot, setDropHot] = useState(false);
  /* Посилання може виявитись не картинкою — або картинкою, яку вже
     видалили з TradingView. Тоді <img> схлопується у крихітний значок
     «зламано», а кнопки поверх нього — разом із «прибрати» — стають
     недосяжними. Тому битий стан показуємо окремо. */
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => { setImgBroken(false); }, [image]);
  const [noteFocus, setNoteFocus] = useState(false);
  /* Нотатка друкується локально, нагору їде після паузи —
     інакше кожна літера перемальовувала весь план */
  const note = useDeferredField(text, (v) => onSave(id, { tf, image, text: v, isDimmed: dim }));

  const pasteRef = useRef(null);
  const imgRef = useRef(null);

  /* Телефон. Ctrl+V і перетягування там не існують, а довге натискання
     на звичайному блоці не показує «Вставити» — тільки на полі вводу.
     Тому на сенсорних екранах замість підказки про клавіші — кнопка:
     вона сама читає буфер, а якщо браузер не дав (Firefox, відмова в
     дозволі) — відкриває поле, куди посилання вставляється довгим
     натисканням. */
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const [linkOpen, setLinkOpen] = useState(false);
  const pasteFromClipboard = async (e) => {
    e.stopPropagation();
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t.startsWith('http')) { applyImage(t); return; }
    } catch { /* немає дозволу — нижче поле вводу */ }
    setLinkOpen(true);
  };

  /* Розпізнавання відповідає з затримкою, а до того часу і TF, і
     приглушення могли змінитись. Тримаємо їх у рефах, щоб коллбек
     читав поточне, а не те, що було на момент вставки. */
  const [tfBusy, setTfBusy] = useState(false);
  const tfRef = useRef(tf);
  const dimRef = useRef(dim);
  useEffect(() => { tfRef.current = tf; }, [tf]);
  useEffect(() => { dimRef.current = dim; }, [dim]);

  useEffect(() => { if (isDimmed !== undefined) setDim(isDimmed); }, [isDimmed]);

  useEffect(() => {
    document.body.style.overflow = full ? 'hidden' : '';
    const onKey = (e) => e.key === 'Escape' && setFull(false);
    if (full) window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [full]);

  const applyImage = (url) => {
    setDim(false);
    onSave(id, { tf, image: url, text: note.valueRef.current, isDimmed: false });

    /* Обидві перевірки читають ту саму картинку, але відповідають на
       різні питання, тому й живуть окремо: одна дивиться на яскравість
       усього кадру, друга читає підпис у шапці.

       Обом віддаємо вже РОЗГОРНУТУ адресу: людина вставляє посилання
       на сторінку знімка (tradingview.com/x/CODE/), а пікселі живуть
       за іншою — на s3. Досі туди їхала сторінка, тобто HTML замість
       картинки, і обидві перевірки падали ще до всякого CORS. */
    const pixels = tvImage(url);

    detectLightBackground(pixels).then((res) => {
      if (res.success && res.isLight) {
        setDim(true);
        onSave(id, { tf, image: url, text: note.valueRef.current, isDimmed: true });
        notify.success('Vision Guard', 'Світлий графік автоматично приглушено.');
      }
    });

    /* Таймфрейм підставляємо тільки в порожнє поле — вибір людини не
       чіпаємо ніколи. І тільки якщо вона за цей час не встигла
       вибрати сама: OCR триває секунду-другу, і за цей час клік по
       TfSelect цілком можливий.

       Вимикач у налаштуваннях перевіряємо саме тут, а не всередині
       розпізнавання: так модель узагалі не піднімається, і той, хто
       автовибором не користується, не качає кілька мегабайт даремно. */
    if (!tf && autoTf !== false) {
      setTfBusy(true);
      detectTimeframe(pixels)
        .then((found) => {
          if (!found || tfRef.current) return;
          onSave(id, { tf: found, image: url, text: note.valueRef.current, isDimmed: dimRef.current });
          notify.success('Таймфрейм', `Зі скріна прочитано ${found}. Якщо не те — поміняй вручну.`);
        })
        .finally(() => setTfBusy(false));
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && pasted.startsWith('http')) { e.preventDefault(); applyImage(pasted); return; }
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image')) {
        e.preventDefault();
        notify.error('Скріншоти вимкнено', 'Скопіюй посилання на зображення в TradingView (Alt+S).');
        return;
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDropHot(false);
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text');
    if (url && url.startsWith('http')) applyImage(url);
    else notify.error('Не вийшло', 'Перетягни посилання на зображення, а не файл.');
  };

  const hasContent = !!image || !!text?.trim();

  return (
    <>
      <div
        className="group/card flex flex-col overflow-hidden rounded-2xl transition-all duration-300"
        style={{
          background: T.surface,
          border: `1px solid ${hasContent ? T.line : `${T.line}`}`,
          boxShadow: '0 20px 40px -32px rgba(0,0,0,0.9)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
      >
        {/* Шапка */}
        <div
          className="flex items-center justify-between gap-3 px-3 py-2.5"
          style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
        >
          <div className="flex items-center gap-2">
            <TfSelect value={tf} onChange={(v) => onSave(id, { tf: v, image, text: note.valueRef.current, isDimmed: dim })} />
            {/* Поки читаємо шапку скріна — тихий пульс біля поля.
                Без нього поле мовчки заповнюється через дві секунди
                після вставки, і це виглядає як глюк. */}
            {/* Пульс живе без AnimatePresence навмисно.

                З ним крапка не зникала ніколи: transition із
                repeat: Infinity успадковувався і виходом теж, тому
                exit-анімація не завершувалась — а поки вона не
                завершиться, елемент лишається в дереві. Виходило, що
                таймфрейм уже знайдено, а крапка поруч блимає далі.
                Анімація тепер чисто на CSS, а зникнення — звичайне
                зняття з рендера. */}
            {tfBusy && !tf && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: T.acc, animation: 'tfPulse 1.2s ease-in-out infinite' }}
                title="Читаю таймфрейм зі скріна"
              />
            )}
          </div>
          {eyebrow && (
            <span
              className="flex items-center gap-1.5 truncate text-[12px] font-semibold"
              style={{ fontFamily: T.sans, color: T.text4 }}
            >
              <Clock size={10} strokeWidth={2.5} /> {eyebrow}
            </span>
          )}
        </div>

        {/* Зона графіка */}
        <div
          ref={pasteRef}
          onPaste={handlePaste}
          onDragOver={(e) => { e.preventDefault(); setDropHot(true); }}
          onDragLeave={() => setDropHot(false)}
          onDrop={handleDrop}
          tabIndex={0}
          className="relative w-full cursor-text outline-none"
          style={{ background: T.sunken }}
        >
          {/* Висота їде плавно з заглушки в графік, а самі шари
              перетікають один в одного — без стрибка й порожнечі */}
          <motion.div
            className="relative w-full overflow-hidden"
            initial={false}
            animate={{ height: image ? 'auto' : 210 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
          <AnimatePresence initial={false}>
          {!image && (
            <motion.div
              key="placeholder"
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="absolute inset-0 flex w-full flex-col items-center justify-center gap-3 px-6 text-center transition-colors duration-300"
              style={{
                background: dropHot ? `rgba(${T.accRgb},0.05)` : 'transparent',
                outline: dropHot ? `2px dashed rgba(${T.accRgb},0.45)` : 'none',
                outlineOffset: -8,
              }}
            >
              <ImagePlus
                size={26}
                strokeWidth={1.6}
                className="transition-colors duration-300"
                style={{ color: dropHot ? T.acc : T.text4 }}
              />
              <div className="flex flex-col gap-1">
                <span
                  className="text-[14px] font-semibold transition-colors duration-300"
                  style={{ color: dropHot ? T.acc : T.text3, fontFamily: T.sans }}
                >
                  {dropHot ? 'Відпусти посилання' : 'Встав лінк з TradingView'}
                </span>
                {!touch && (
                  <span className="text-[12px] font-medium" style={{ color: T.text4, fontFamily: T.sans }}>
                    Ctrl+V або перетягни
                  </span>
                )}
              </div>

              {touch && (linkOpen ? (
                <input
                  autoFocus
                  inputMode="url"
                  placeholder="Натисни й утримуй → Вставити"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (v.startsWith('http')) { setLinkOpen(false); applyImage(v); }
                  }}
                  className="h-10 w-full max-w-[280px] rounded-xl px-3 text-[14px] outline-none"
                  style={{ background: T.surface, border: `1px solid ${T.lineAcc}`, color: T.text, fontFamily: T.sans }}
                />
              ) : (
                <button
                  type="button"
                  onClick={pasteFromClipboard}
                  className="h-10 rounded-xl px-4 text-[13.5px] font-bold transition-transform active:scale-95"
                  style={{ background: `rgba(${T.accRgb},0.14)`, border: `1px solid ${T.lineAcc}`, color: T.text, fontFamily: T.sans }}
                >
                  Вставити посилання
                </button>
              ))}
            </motion.div>
          )}
          </AnimatePresence>

          {image && (
            <motion.div
              key="chart"
              ref={imgRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.08 }}
              className="group/img relative flex w-full cursor-zoom-in items-center justify-center"
            >
              {imgBroken ? (
                <div className="flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                  <ImageOff size={26} strokeWidth={1.6} style={{ color: T.bad }} />
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-semibold" style={{ color: T.text2, fontFamily: T.sans }}>
                      Картинка не відкрилась
                    </span>
                    <span className="text-[12px] font-medium" style={{ color: T.text4, fontFamily: T.sans }}>
                      Посилання не на зображення або знімок уже видалено
                    </span>
                  </div>
                  {/* Кнопка тут, а не поверх картинки: поверх немає
                      чого наводитись, коли картинки немає. */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSave(id, { tf, image: null, text: note.valueRef.current, isDimmed: false });
                    }}
                    className="mt-1 h-9 rounded-lg px-4 text-[13px] font-bold transition-colors"
                    style={{ background: `rgba(${T.badRgb},0.12)`, border: `1px solid rgba(${T.badRgb},0.3)`, color: T.bad, fontFamily: T.sans }}
                  >
                    Прибрати
                  </button>
                </div>
              ) : (
                <motion.img
                  src={tvImage(image)}
                  alt="Графік"
                  onClick={() => setFull(true)}
                  onError={() => setImgBroken(true)}
                  draggable={false}
                  initial={{ scale: 1.015 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="h-auto w-full object-contain"
                  style={{
                    filter: dim ? 'brightness(0.76) contrast(1.08)' : 'none',
                    transition: 'filter 0.35s ease',
                  }}
                />
              )}

              <div className={`absolute right-3 top-3 z-20 flex-col items-end gap-2 opacity-0 transition-opacity duration-200 group-hover/img:opacity-100 ${imgBroken ? 'hidden' : 'flex'}`}>
                <OverlayBtn
                  icon={Maximize2}
                  label="На весь екран"
                  onClick={(e) => { e.stopPropagation(); setFull(true); }}
                />
                <OverlayBtn
                  icon={dim ? Moon : Sun}
                  label={dim ? 'Повернути яскравість' : 'Приглушити'}
                  active={dim}
                  onClick={(e) => {
                    e.stopPropagation();
                    const v = !dim;
                    setDim(v);
                    onSave(id, { tf, image, text: note.valueRef.current, isDimmed: v });
                  }}
                />
                <OverlayBtn
                  icon={X}
                  label="Прибрати графік"
                  danger
                  onClick={(e) => {
                    e.stopPropagation();
                    setDim(false);
                    onSave(id, { tf, image: null, text: note.valueRef.current, isDimmed: false });
                  }}
                />
              </div>
            </motion.div>
          )}
          </motion.div>
        </div>

        {/* Нотатки */}
        <div
          className="relative transition-colors duration-300"
          style={{
            borderTop: `1px solid ${T.line}`,
            background: noteFocus ? T.surfaceHi : T.surface,
          }}
        >
          <motion.span
            aria-hidden
            className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full"
            style={{ background: T.acc }}
            initial={false}
            animate={{ opacity: noteFocus ? 1 : 0, scaleY: noteFocus ? 1 : 0.3 }}
            transition={{ duration: 0.25, ease: EASE }}
          />
          <TextareaAutosize
            value={note.draft}
            onChange={(e) => note.onType(e.target.value)}
            onPaste={handlePaste}
            onFocus={() => setNoteFocus(true)}
            onBlur={() => { setNoteFocus(false); note.flush(); }}
            placeholder="Що бачиш на цьому ТФ?"
            minRows={2}
            spellCheck={false}
            className="w-full resize-none border-none bg-transparent px-4 py-3.5 outline-none"
            style={{
              fontFamily: T.sans,
              fontSize: 14,
              lineHeight: 1.65,
              color: T.text,
            }}
          />
        </div>
      </div>

      {/* Фулскрін */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {full && image && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => setFull(false)}
              className="fixed inset-0 z-[9999] flex cursor-zoom-out items-center justify-center p-4 sm:p-10"
              style={{ background: 'rgba(6,6,8,0.95)', backdropFilter: 'blur(20px)' }}
            >
              <motion.img
                initial={{ scale: 0.96, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 12 }}
                transition={SPRING}
                src={tvImage(image)}
                alt="Графік на весь екран"
                className="max-h-full max-w-full rounded-xl object-contain"
                style={{
                  border: `1px solid ${T.lineHi}`,
                  filter: dim ? 'brightness(0.84) contrast(1.05)' : 'none',
                }}
              />
              <span
                className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
              >
                Esc або клік — закрити
              </span>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

/* Сусідній блок з важкою картинкою не має перемальовуватись,
   коли друкуєш у цьому */
export default memo(TdaBlock);
