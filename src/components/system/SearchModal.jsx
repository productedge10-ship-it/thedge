import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, CornerDownLeft } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { searchPages, pathTo } from '../../lib/systemDoc';

/* ==================================================================
   Пошук по всій системі.
   Шукає і в назвах сторінок, і в тексті блоків — з уривком, щоб
   зрозуміти, що саме знайшлось, ще до переходу.
================================================================== */

export default function SearchModal({ pages, onOpen, onClose }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const results = useMemo(() => searchPages(pages, q).slice(0, 12), [pages, q]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, []);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      if (e.key === 'Enter' && results[active]) { e.preventDefault(); onOpen(results[active].page.id); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [results, active, onOpen, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[400] flex items-start justify-center p-4 pt-[12vh]"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.985 }}
        transition={{ duration: 0.2, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[620px] overflow-hidden rounded-2xl"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 40px 90px -30px rgba(0,0,0,0.95)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Search size={17} strokeWidth={2.2} style={{ color: q ? T.acc : T.text4 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Шукати по всій системі…"
            className="w-full bg-transparent text-[15px] outline-none"
            style={{ fontFamily: T.sans, color: T.text }}
          />
          <kbd className="rounded px-1.5 py-0.5 text-[11.5px]" style={{ fontFamily: T.mono, background: T.sunken, border: `1px solid ${T.line}`, color: T.text4 }}>
            esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {!q && (
            <p className="px-3 py-6 text-center text-[13.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Введи слово — знайду і в назвах, і всередині сторінок.
            </p>
          )}

          {q && results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Нічого не знайшлось.
            </p>
          )}

          {results.map((r, i) => {
            const on = i === active;
            const crumbs = pathTo(pages, r.page.id).slice(0, -1).map((p) => p.title).join(' › ');
            return (
              <button
                key={r.page.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => onOpen(r.page.id)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150"
                style={{ background: on ? `rgba(${T.accRgb},0.10)` : 'transparent' }}
              >
                <span className="mt-0.5 shrink-0 text-[16px]">{r.page.icon || '📄'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold" style={{ fontFamily: T.sans, color: on ? T.text : T.text2 }}>
                    {r.page.title || 'Без назви'}
                  </span>
                  {crumbs && (
                    <span className="block truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>{crumbs}</span>
                  )}
                  {r.snippet && (
                    <span className="mt-1 block truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {r.snippet}
                    </span>
                  )}
                </span>
                {on && <CornerDownLeft size={14} strokeWidth={2.2} className="mt-1 shrink-0" style={{ color: T.acc }} />}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
