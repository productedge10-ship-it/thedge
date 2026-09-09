import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, ArrowDownUp, X } from 'lucide-react';
import { T } from '../../lib/theme';
import { CATS, getCat } from './utils';

/* ==================================================================
   Фільтри журналу.

   Один рядок, у якому пошук займає весь вільний простір, а решта —
   рівно стільки, скільки треба під найдовший підпис. Категорії й
   активи — випадашки з лічильниками: цифра поруч із назвою одразу
   каже, чи є сенс туди тиснути.

   Сортування зроблено кнопкою-циклом, а не ще однією випадашкою:
   варіантів три, і перебрати їх кліком швидше, ніж відкривати
   список заради вибору з трьох.
================================================================== */

const A = (a) => `rgba(${T.accRgb}, ${a})`;

const SORTS = [
  { id: 'newest', label: 'Спочатку нові' },
  { id: 'oldest', label: 'Спочатку старі' },
  { id: 'open', label: 'Спочатку нерозібрані' },
];

/* Випадашка живе поруч із кнопкою, а закривається кліком повз неї
   або Esc: без цього список лишається висіти над сторінкою й ловить
   кліки, призначені карткам під ним. */
function useAway(open, close) {
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, close]);

  return box;
}

const Panel = ({ width, children }) => (
  <div
    className="absolute left-0 z-40 mt-2 max-h-[340px] overflow-auto rounded-[14px] p-1.5"
    style={{
      top: '100%',
      width,
      background: 'var(--edge-surface)',
      border: '1px solid var(--edge-line-hi)',
      boxShadow: '0 26px 54px -18px #000',
    }}
  >
    {children}
  </div>
);

export default function ErrorFilters({
  entries, query, setQuery, assetFilter, setAsset, sort, setSort, catFilter, setCatFilter,
}) {
  const list = Array.isArray(entries) ? entries : [];

  const [focus, setFocus] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);

  const catBox = useAway(catOpen, () => setCatOpen(false));
  const assetBox = useAway(assetOpen, () => setAssetOpen(false));

  const counts = {};
  list.forEach((e) => (e.cats || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));

  const assets = {};
  list.forEach((e) => { if (e.pair) assets[e.pair] = (assets[e.pair] || 0) + 1; });

  const curCat = catFilter ? getCat(catFilter) : null;
  const catColor = curCat?.color || T.acc;
  const sortIdx = Math.max(0, SORTS.findIndex((s) => s.id === sort));
  const hasFilter = !!(catFilter || (assetFilter && assetFilter !== 'all') || query.trim());

  const row = (on, color, height) => ({
    fontFamily: T.sans,
    background: on ? `${color}24` : 'transparent',
    border: `1px solid ${on ? `${color}5e` : 'transparent'}`,
    color: on ? 'var(--edge-text)' : 'var(--edge-text2)',
    height,
    transition: 'all .14s',
  });

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2.5">
      {/* ─── пошук ─── */}
      <div
        className="flex h-11 min-w-[240px] flex-1 items-center gap-2.5 rounded-[13px] px-4"
        style={{
          background: focus ? 'rgba(var(--edge-hair-rgb),0.07)' : 'rgba(var(--edge-hair-rgb),0.04)',
          border: `1px solid ${focus ? A(0.55) : 'var(--edge-line)'}`,
          boxShadow: focus ? `0 0 0 4px ${A(0.13)}, inset 0 1px 0 rgba(var(--edge-hair-rgb),0.08)` : 'inset 0 1px 0 rgba(var(--edge-hair-rgb),0.05)',
          transition: 'all .2s',
        }}
      >
        <Search size={16} strokeWidth={1.9} className="shrink-0" style={{ color: 'var(--edge-text3)' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder="Пошук за парою або описом"
          className="w-full border-none bg-transparent text-[14px] font-medium outline-none"
          style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}
        />
      </div>

      {/* ─── категорія ─── */}
      <div className="relative" ref={catBox}>
        <button
          onClick={() => { setCatOpen((v) => !v); setAssetOpen(false); }}
          className="flex h-11 min-w-[196px] items-center gap-2.5 rounded-[13px] px-3.5"
          style={{
            background: catOpen ? 'rgba(var(--edge-hair-rgb),0.07)' : 'rgba(var(--edge-hair-rgb),0.04)',
            border: `1px solid ${catOpen || catFilter ? `${catColor}80` : 'var(--edge-line)'}`,
            transition: 'all .16s',
          }}
        >
          <span
            className="h-[7px] w-[7px] flex-none rounded-full"
            style={{ background: catColor, boxShadow: `0 0 9px 1px ${catColor}aa` }}
          />
          <span
            className="min-w-0 flex-1 whitespace-nowrap text-left text-[13.5px] font-semibold"
            style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}
          >
            {curCat ? curCat.label : 'Усі категорії'}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.9}
            style={{ color: 'var(--edge-text3)', flex: 'none', transform: `rotate(${catOpen ? 180 : 0}deg)`, transition: 'transform .2s' }}
          />
        </button>

        {catOpen && (
          <Panel width={258}>
            {[{ id: null, label: 'Усі категорії', color: T.acc, count: list.length }, ...CATS.map((c) => ({ ...c, count: counts[c.id] || 0 }))].map((c) => {
              const on = catFilter === c.id;
              const zero = !c.count && c.id;
              return (
                <button
                  key={c.id || 'all'}
                  onClick={() => { setCatFilter(on ? null : c.id); setCatOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-semibold"
                  style={{ ...row(on, c.color, 38), color: on ? 'var(--edge-text)' : zero ? 'var(--edge-text3)' : 'var(--edge-text2)' }}
                >
                  <span
                    className="h-[7px] w-[7px] flex-none rounded-full"
                    style={{ background: c.color, opacity: zero ? 0.35 : 1, boxShadow: on ? `0 0 9px 1px ${c.color}cc` : 'none' }}
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{c.label}</span>
                  <span className="flex-none text-[11px]" style={{ fontFamily: T.mono, color: zero ? 'var(--edge-text4)' : 'var(--edge-text3)' }}>
                    {c.count}
                  </span>
                </button>
              );
            })}
          </Panel>
        )}
      </div>

      {/* ─── актив ─── */}
      <div className="relative" ref={assetBox}>
        <button
          onClick={() => { setAssetOpen((v) => !v); setCatOpen(false); }}
          className="flex h-11 min-w-[158px] items-center gap-2.5 rounded-[13px] px-3.5"
          style={{
            background: assetOpen ? 'rgba(var(--edge-hair-rgb),0.07)' : 'rgba(var(--edge-hair-rgb),0.04)',
            border: `1px solid ${assetOpen || (assetFilter && assetFilter !== 'all') ? A(0.5) : 'var(--edge-line)'}`,
            transition: 'all .16s',
          }}
        >
          <span
            className="min-w-0 flex-1 whitespace-nowrap text-left text-[13.5px] font-semibold"
            style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}
          >
            {assetFilter && assetFilter !== 'all' ? assetFilter : 'Усі активи'}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.9}
            style={{ color: 'var(--edge-text3)', flex: 'none', transform: `rotate(${assetOpen ? 180 : 0}deg)`, transition: 'transform .2s' }}
          />
        </button>

        {assetOpen && (
          <Panel width={194}>
            {[{ key: 'all', name: 'Усі активи', count: list.length },
              ...Object.keys(assets).sort().map((k) => ({ key: k, name: k, count: assets[k] }))].map((a) => {
              const on = assetFilter === a.key;
              return (
                <button
                  key={a.key}
                  onClick={() => { setAsset(on ? 'all' : a.key); setAssetOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-[9px] px-3 text-[13.5px] font-semibold"
                  style={row(on, T.acc, 36)}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{a.name}</span>
                  <span className="flex-none text-[11px]" style={{ fontFamily: T.mono, color: 'var(--edge-text3)' }}>
                    {a.count}
                  </span>
                </button>
              );
            })}
          </Panel>
        )}
      </div>

      {/* ─── сортування ─── */}
      <button
        onClick={() => setSort(SORTS[(sortIdx + 1) % SORTS.length].id)}
        className="flex h-11 items-center gap-2.5 rounded-[13px] px-4"
        style={{ background: 'rgba(var(--edge-hair-rgb),0.04)', border: '1px solid var(--edge-line)', transition: 'all .16s' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-hair-rgb),0.08)'; e.currentTarget.style.borderColor = 'var(--edge-line-hi)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-hair-rgb),0.04)'; e.currentTarget.style.borderColor = 'var(--edge-line)'; }}
      >
        <ArrowDownUp size={15} strokeWidth={1.9} style={{ color: 'var(--edge-text3)' }} />
        <span className="whitespace-nowrap text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}>
          {SORTS[sortIdx].label}
        </span>
      </button>

      {hasFilter && (
        <button
          onClick={() => { setCatFilter(null); setAsset('all'); setQuery(''); }}
          className="flex h-11 items-center gap-2 rounded-[13px] px-3.5 text-[13px] font-semibold"
          style={{ background: 'rgba(var(--edge-hair-rgb),0.02)', border: '1px dashed var(--edge-line-hi)', color: 'var(--edge-text3)', fontFamily: T.sans, transition: 'all .16s' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.5); e.currentTarget.style.color = 'var(--edge-acc)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--edge-line-hi)'; e.currentTarget.style.color = 'var(--edge-text3)'; }}
        >
          <X size={12} strokeWidth={2.6} />
          Скинути
        </button>
      )}
    </div>
  );
}
