import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Maximize2, X } from 'lucide-react';
import { T, EASE } from '../../../lib/theme';

/* ==================================================================
   Картинка.
   Скрін графіка — основа опису сетапу, тому вставити його має бути
   найпростішою дією: Ctrl+V, перетягування файлу або посилання.
   Ширина тягнеться мишею за правий край, під низом — підпис.
================================================================== */

export default function ImageBlock({ block, onChange, onFullscreen }) {
  const [drag, setDrag] = useState(false);
  const [resizing, setResizing] = useState(false);
  const fileRef = useRef(null);
  const wrapRef = useRef(null);

  const readFile = (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => onChange({ src: r.result });
    r.readAsDataURL(file);
  };

  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text');
    if (text && /^https?:\/\//.test(text.trim())) { onChange({ src: text.trim() }); e.preventDefault(); return; }
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.indexOf('image') !== -1);
    if (item) { e.preventDefault(); readFile(item.getAsFile()); }
  };

  /* тягнемо за край — рахуємо ширину у відсотках від колонки тексту */
  const startResize = (e) => {
    e.preventDefault();
    setResizing(true);
    const wrap = wrapRef.current;
    const startX = e.clientX;
    const startW = block.width || 100;
    const full = wrap?.parentElement?.offsetWidth || 720;

    const move = (ev) => {
      const delta = ((ev.clientX - startX) / full) * 100;
      onChange({ width: Math.min(100, Math.max(25, Math.round(startW + delta))) });
    };
    const up = () => {
      setResizing(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!block.src) {
    return (
      <div
        tabIndex={0}
        onPaste={onPaste}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0]); }}
        className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl text-[13.5px] font-semibold outline-none transition-colors duration-200"
        style={{
          background: drag ? `rgba(${T.accRgb},0.05)` : T.sunken,
          border: `1px dashed ${drag ? T.lineAcc : T.lineHi}`,
          color: drag ? T.acc : T.text3,
          fontFamily: T.sans,
        }}
      >
        <ImagePlus size={20} strokeWidth={1.9} />
        Встав скрін: Ctrl+V, перетягни файл або клікни
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => readFile(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div className="group/img w-full">
      <div
        ref={wrapRef}
        className="relative"
        style={{ width: `${block.width || 100}%` }}
      >
        <motion.img
          src={block.src}
          alt={block.caption || ''}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="block w-full rounded-xl"
          style={{ border: `1px solid ${T.line}`, background: T.sunken }}
        />

        {/* дії */}
        <span className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover/img:opacity-100">
          <button
            onClick={() => onFullscreen(block.src)}
            title="На весь екран"
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${T.line}`, color: T.text2, backdropFilter: 'blur(8px)' }}
          >
            <Maximize2 size={14} strokeWidth={2.2} />
          </button>
          <button
            onClick={() => onChange({ src: '' })}
            title="Прибрати"
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${T.line}`, color: T.text2, backdropFilter: 'blur(8px)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.text2)}
          >
            <X size={14} strokeWidth={2.6} />
          </button>
        </span>

        {/* ручка розміру */}
        <span
          onMouseDown={startResize}
          title="Тягни, щоб змінити розмір"
          className="absolute -right-1 top-1/2 h-14 w-2 -translate-y-1/2 cursor-col-resize rounded-full transition-opacity duration-200"
          style={{
            background: resizing ? T.acc : T.lineHi,
            opacity: resizing ? 1 : 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
          onMouseLeave={(e) => { if (!resizing) e.currentTarget.style.opacity = 0; }}
        />

        {/* поточна ширина під час тягання */}
        {resizing && (
          <span
            className="absolute -top-7 right-0 rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums"
            style={{ fontFamily: T.mono, background: T.surface, border: `1px solid ${T.lineHi}`, color: T.acc }}
          >
            {block.width || 100}%
          </span>
        )}
      </div>

      {/* підпис */}
      <input
        value={block.caption || ''}
        onChange={(e) => onChange({ caption: e.target.value })}
        placeholder="Підпис до скріна…"
        className="mt-2 w-full bg-transparent text-[13px] outline-none"
        style={{ fontFamily: T.sans, color: T.text3 }}
      />
    </div>
  );
}
