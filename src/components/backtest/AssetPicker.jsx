import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Plus, Loader2, X } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { COMMON_PAIRS } from '../../lib/backtestStats';
import { ACT, act } from './accent';
import AssetIcon from '../ui/AssetIcon';
import useCachedList from '../../hooks/useCachedList';
import { supabase } from '../../lib/supabase';

/* ==================================================================
   Вибір активу в бектестах.

   Той самий довідник, що в журналі: пошук, іконка інструмента і
   власні активи трейдера з `user_assets`. Раніше тут був короткий
   зашитий список — людина заводила «свій» тікер у журналі, а в
   бектесті мусила вписувати його заново руками.

   Один компонент на швидкий рядок і на картку угоди: два однакові
   списки в двох файлах розʼїхались би при першій же правці.
================================================================== */

export default function AssetPicker({
  value,
  onChange,
  height = 46,
  placeholder = 'Обрати актив',
  /* Активи, які варто показати першими: інструмент самого бектесту
     і ті, що вже зустрічались у ньому. */
  priority = [],
  /* Дрібна позначка праворуч від рядка — наприклад «бектест» */
  noteOf,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useCachedList('assets', 'user_assets', 'name', 'name');
  const box = useRef(null);

  const mine = rows.map((r) => r.name);
  const all = [...new Set([...priority, value, ...mine, ...COMMON_PAIRS].filter(Boolean))];
  const found = all.filter((p) => p.toLowerCase().includes(search.trim().toLowerCase()));
  const canAdd = search.trim() !== '' && !all.some((p) => p.toLowerCase() === search.trim().toLowerCase());

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    /* Escape закриває спершу список, а не модалку навколо: інакше
       людина втратить незбережену угоду через одну зайву клавішу. */
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const pick = (p) => { onChange(p); setOpen(false); setSearch(''); };

  const addAsset = async () => {
    const name = search.trim().toUpperCase();
    if (!name || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('user_assets').insert([{ name }]);
      if (!error) setRows([...rows, { name }]);
      /* Навіть якщо база не прийняла (немає звʼязку, дубль) — актив
         усе одно підставляємо: угоду треба записати зараз. */
      pick(name);
    } finally {
      setSaving(false);
    }
  };

  const removeAsset = async (e, name) => {
    e.stopPropagation();
    if (!mine.includes(name)) return;
    const { error } = await supabase.from('user_assets').delete().eq('name', name);
    if (!error) setRows(rows.filter((x) => x.name !== name));
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5"
        style={{
          height,
          background: T.sunken,
          border: `1px solid ${open ? ACT.to : T.line}`,
          boxShadow: open ? `0 0 0 3px ${act(0.13)}` : 'none',
          transition: 'border-color .18s, box-shadow .18s',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
      >
        {value ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <AssetIcon symbol={value} />
            <span className="truncate text-[14px] font-bold tracking-[0.05em]" style={{ fontFamily: T.mono, color: T.text }}>
              {value}
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2.5 truncate text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
            <Search size={15} strokeWidth={2.4} className="shrink-0" />
            {placeholder}
          </span>
        )}
        <ChevronDown
          size={15}
          strokeWidth={2.2}
          className="shrink-0"
          style={{ color: ACT.tint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 top-[calc(100%+8px)] z-40 w-[300px] max-w-[92vw] overflow-hidden rounded-[14px]"
            style={{
              background: T.surfaceHi,
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)',
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Search size={13} strokeWidth={2.4} style={{ color: T.text3 }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); addAsset(); } }}
                placeholder="Пошук або новий актив…"
                className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-[var(--edge-text3,#7A7A85)]"
                style={{ fontFamily: T.sans, color: T.text }}
              />
            </div>

            <div className="custom-scrollbar max-h-[230px] overflow-y-auto p-1.5">
              {found.map((p) => {
                const on = p === value;
                const custom = mine.includes(p);
                const note = noteOf ? noteOf(p) : null;
                return (
                  <div key={p} className="group flex items-center">
                    <button
                      onClick={() => pick(p)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors"
                      style={{ background: on ? act(0.18) : 'transparent' }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surface; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <AssetIcon symbol={p} />
                      <span className="truncate text-[13.5px] font-bold tracking-[0.04em]" style={{ fontFamily: T.mono, color: T.text }}>
                        {p}
                      </span>
                      {note && (
                        <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.mono, color: T.text3 }}>
                          {note}
                        </span>
                      )}
                    </button>
                    {custom && (
                      <button
                        onClick={(e) => removeAsset(e, p)}
                        title="Прибрати зі списку"
                        className="hidden shrink-0 px-2 group-hover:block"
                        style={{ color: T.text4 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
                      >
                        <X size={12} strokeWidth={2.6} />
                      </button>
                    )}
                  </div>
                );
              })}

              {found.length === 0 && !canAdd && (
                <p className="px-2.5 py-3 text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Нічого не знайшлось.
                </p>
              )}
            </div>

            {canAdd && (
              <button
                onClick={addAsset}
                disabled={saving}
                className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[13px] font-semibold transition-colors"
                style={{ fontFamily: T.sans, color: ACT.tint, borderTop: `1px solid ${T.line}` }}
                onMouseEnter={(e) => { e.currentTarget.style.background = act(0.1); }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {saving ? <Loader2 size={13} strokeWidth={3} className="animate-spin" /> : <Plus size={13} strokeWidth={3} />}
                Додати «{search.trim().toUpperCase()}»
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
