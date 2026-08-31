import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ImagePlus, Moon, Sun, Maximize2, Clock } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import { notify } from '../../utils/notify';
import TfSelect from '../ui/TfSelect';
import useDeferredField from '../../hooks/useDeferredField';
import { T, EASE, SPRING } from './planTheme';
import { tvImage } from '../../lib/imageStore';

/* Визначає, чи світлий графік — щоб автоматично приглушити його */
function detectLightBackground(src) {
  return new Promise((resolve) => {
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
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
        resolve({ success: true, isLight: brightness > 160 });
      } catch { resolve({ success: false, isLight: false }); }
    };
    probe.onerror = () => resolve({ success: false, isLight: false });
    probe.src = src;
  });
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
  const [full, setFull] = useState(false);
  const [dim, setDim] = useState(isDimmed || false);
  const [dropHot, setDropHot] = useState(false);
  const [noteFocus, setNoteFocus] = useState(false);
  /* Нотатка друкується локально, нагору їде після паузи —
     інакше кожна літера перемальовувала весь план */
  const note = useDeferredField(text, (v) => onSave(id, { tf, image, text: v, isDimmed: dim }));

  const pasteRef = useRef(null);
  const imgRef = useRef(null);

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
    detectLightBackground(url).then((res) => {
      if (res.success && res.isLight) {
        setDim(true);
        onSave(id, { tf, image: url, text: note.valueRef.current, isDimmed: true });
        notify.success('Vision Guard', 'Світлий графік автоматично приглушено.');
      }
    });
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
          <TfSelect value={tf} onChange={(v) => onSave(id, { tf: v, image, text: note.valueRef.current, isDimmed: dim })} />
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
                <span className="text-[12px] font-medium" style={{ color: T.text4, fontFamily: T.sans }}>
                  Ctrl+V або перетягни
                </span>
              </div>
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
              <motion.img
                src={tvImage(image)}
                alt="Графік"
                onClick={() => setFull(true)}
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

              <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2 opacity-0 transition-opacity duration-200 group-hover/img:opacity-100">
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
