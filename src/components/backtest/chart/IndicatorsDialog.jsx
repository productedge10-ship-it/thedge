import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Plus, Settings2, Eye, EyeOff, Trash2, Check, AlertTriangle } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx, isEn } from '../../../lib/lang';
import { CATS, INDICATORS, PRESETS, indName, indDesc } from '../../../lib/candles/indicators';

/* ==================================================================
   Вікно «Індикатори» — як у TV: пошук, розділи, список з описом.
   Доданий індикатор лишається в списку з кнопками «сховати»,
   «налаштування», «прибрати». Угорі — швидкі набори, щоб ICT-розмітку
   не збирати по одному.
================================================================== */

function IconBtn({ title, onClick, children, danger, active }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
      style={{ color: active ? '#5b8cff' : T.text3 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = danger ? '#f23645' : T.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = active ? '#5b8cff' : T.text3; }}
    >
      {children}
    </button>
  );
}

export default function IndicatorsDialog({ config, notes = {}, onChange, onSettings, onClose }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const search = useRef(null);
  const list = config || [];
  const added = (id) => list.find((c) => c.id === id);

  useEffect(() => {
    search.current?.focus();
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const ids = useMemo(() => {
    const all = Object.keys(INDICATORS);
    const needle = q.trim().toLowerCase();
    return all.filter((id) => {
      if (cat === 'added' && !added(id)) return false;
      if (cat !== 'all' && cat !== 'added' && INDICATORS[id].cat !== cat) return false;
      if (!needle) return true;
      const d = INDICATORS[id];
      return [d.uk, d.en, d.dUk, d.dEn, id].join(' ').toLowerCase().includes(needle);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, q, list]);

  const add = (id) => { if (!added(id)) onChange([...list, { id, on: true, inputs: {} }]); };
  const remove = (id) => onChange(list.filter((c) => c.id !== id));
  const toggleHidden = (id) => onChange(list.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)));
  const preset = (items) => onChange([...list, ...items.filter((id) => !added(id)).map((id) => ({ id, on: true, inputs: {} }))]);

  const cats = [['all', tx('Усі', 'All')], ...CATS.map((c) => [c.id, isEn ? c.en : c.uk]), ['added', `${tx('Додані', 'Added')} · ${list.length}`]];

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-3" style={{ background: 'rgba(0,0,0,0.3)' }} onMouseDown={onClose}>
      <div
        className="flex h-[min(620px,92dvh)] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl"
        style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', animation: 'edgeChartPop .2s cubic-bezier(.22,1,.36,1)' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={tx('Індикатори', 'Indicators')}
      >
        <style>{'@keyframes edgeChartPop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}'}</style>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-[18px] font-bold" style={{ color: T.text }}>{tx('Індикатори', 'Indicators')}</h3>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5" style={{ color: T.text3 }} aria-label={tx('Закрити', 'Close')}><X size={18} /></button>
        </div>
        <div className="px-5 pt-3">
          <label className="flex h-10 items-center gap-2.5 rounded-xl px-3" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
            <Search size={16} style={{ color: T.text3 }} />
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Пошук: сесії, FVG, RSI…', 'Search: sessions, FVG, RSI…')} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" style={{ color: T.text }} />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px]" style={{ color: T.text3 }}>{tx('Швидкі набори:', 'Quick sets:')}</span>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => preset(p.items)}
                title={p.items.map(indName).join(', ')}
                className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold transition-colors hover:bg-white/10"
                style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2 }}
              >
                + {isEn ? p.en : p.uk}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col sm:flex-row" style={{ borderTop: `1px solid ${T.line}` }}>
          <nav className="flex shrink-0 gap-1 overflow-x-auto p-2 sm:w-[190px] sm:flex-col sm:overflow-visible sm:p-3">
            {cats.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCat(id)}
                className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors"
                style={{ background: cat === id ? T.surfaceHi : 'transparent', color: cat === id ? T.text : T.text2, fontWeight: cat === id ? 700 : 500 }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:pr-3">
            {ids.length === 0 && (
              <p className="p-6 text-center text-[13.5px]" style={{ color: T.text3 }}>
                {cat === 'added' ? tx('Ще нічого не додано.', 'Nothing added yet.') : tx('Нічого не знайшов.', 'Nothing found.')}
              </p>
            )}
            {ids.map((id) => {
              const c = added(id);
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  onClick={() => (c ? onSettings(id) : add(id))}
                  onKeyDown={(e) => { if (e.key === 'Enter') (c ? onSettings(id) : add(id)); }}
                  className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: c?.hidden ? T.text3 : T.text }}>
                      {indName(id)}
                      {c && <Check size={14} style={{ color: '#5b8cff' }} />}
                      {c && notes[id] === 'novol' && (
                        <span className="flex items-center gap-1 text-[11.5px] font-medium" style={{ color: T.warn }} title={tx('Свічки завантажені без обсягів', 'Candles were loaded without volume')}>
                          <AlertTriangle size={12} /> {tx('потрібен CSV з обсягами — завантаж файл ще раз', 'needs volume — re-import the CSV')}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px]" style={{ color: T.text3 }}>{indDesc(id)}</div>
                  </div>
                  {c ? (
                    <div className="flex shrink-0 items-center">
                      <IconBtn title={c.hidden ? tx('Показати', 'Show') : tx('Сховати', 'Hide')} onClick={() => toggleHidden(id)}>{c.hidden ? <EyeOff size={16} /> : <Eye size={16} />}</IconBtn>
                      <IconBtn title={tx('Налаштування', 'Settings')} onClick={() => onSettings(id)}><Settings2 size={16} /></IconBtn>
                      <IconBtn title={tx('Прибрати', 'Remove')} danger onClick={() => remove(id)}><Trash2 size={16} /></IconBtn>
                    </div>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold opacity-70 transition-opacity group-hover:opacity-100" style={{ color: '#5b8cff' }}>
                      <Plus size={14} /> {tx('Додати', 'Add')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
