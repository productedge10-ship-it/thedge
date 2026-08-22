import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, ArrowUpDown, ChevronDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { CATS, hexA } from './utils';
import AssetPickerModal from '../modals/AssetPickerModal';

/* ==================================================================
   Фільтри журналу помилок.
   Пошук — головний елемент рядка, далі актив і порядок, а знизу
   категорії чипами: по них одразу видно, чого назбиралось найбільше.
================================================================== */

export default function ErrorFilters({ query, setQuery, assetFilter, setAsset, sort, setSort, catFilter, setCatFilter, entries }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    entries.forEach((e) => e.cats.forEach((id) => { c[id] = (c[id] || 0) + 1; }));
    return c;
  }, [entries]);

  const chips = [
    { id: null, label: 'Всі', count: entries.length, color: T.acc },
    ...CATS.map((c) => ({ id: c.id, label: c.label, count: counts[c.id] || 0, color: c.color })),
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: EASE }}
        className="mb-6 flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* пошук */}
          <div className="relative min-w-[240px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200"
              style={{ color: query ? T.acc : T.text4 }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Шукати за парою або описом…"
              className="h-11 w-full rounded-xl pl-11 pr-10 text-[14px] outline-none transition-all duration-200"
              style={{
                background: T.sunken,
                border: `1px solid ${query ? T.lineAcc : T.line}`,
                color: T.text,
                fontFamily: T.sans,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = T.lineAcc;
                e.currentTarget.style.boxShadow = `0 0 0 3px rgba(${T.accRgb},0.10)`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = query ? T.lineAcc : T.line;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg transition-colors duration-200"
                style={{ color: T.text4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
              >
                <X size={14} strokeWidth={2.6} />
              </button>
            )}
          </div>

          {/* актив */}
          <div className="relative">
            <button
              onClick={() => setPickerOpen(true)}
              className="flex h-11 items-center gap-2 whitespace-nowrap rounded-xl pl-3.5 pr-9 text-[13.5px] font-semibold transition-colors duration-200"
              style={{
                background: T.sunken,
                border: `1px solid ${assetFilter !== 'all' ? T.lineAcc : T.line}`,
                color: assetFilter !== 'all' ? T.acc : T.text2,
                fontFamily: assetFilter !== 'all' ? T.mono : T.sans,
              }}
              onMouseEnter={(e) => { if (assetFilter === 'all') e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { if (assetFilter === 'all') e.currentTarget.style.borderColor = T.line; }}
            >
              {assetFilter === 'all' ? 'Усі активи' : assetFilter}
            </button>

            {assetFilter !== 'all' ? (
              <button
                onClick={(e) => { e.stopPropagation(); setAsset('all'); }}
                title="Скинути актив"
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md"
                style={{ color: T.acc }}
              >
                <X size={12} strokeWidth={3} />
              </button>
            ) : (
              <ChevronDown size={13} strokeWidth={2.4} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: T.text4 }} />
            )}
          </div>

          {/* порядок */}
          <button
            onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
            className="flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
          >
            <motion.span
              className="flex"
              animate={{ rotate: sort === 'newest' ? 0 : 180 }}
              transition={{ duration: 0.3, ease: EASE }}
              style={{ color: T.text4 }}
            >
              <ArrowUpDown size={15} />
            </motion.span>
            {sort === 'newest' ? 'спочатку нові' : 'спочатку старі'}
          </button>
        </div>

        {/* категорії */}
        <div className="flex flex-wrap gap-2">
          {chips.map((ch) => {
            const active = catFilter === ch.id;
            const empty = ch.id !== null && !ch.count;
            return (
              <button
                key={ch.id || 'all'}
                onClick={() => setCatFilter(active && ch.id !== null ? null : ch.id)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-200"
                style={{
                  fontFamily: T.sans,
                  color: active ? ch.color : empty ? T.text4 : T.text3,
                  background: active ? hexA(ch.color, 0.12) : 'transparent',
                  border: `1px solid ${active ? hexA(ch.color, 0.38) : T.line}`,
                  opacity: empty ? 0.55 : 1,
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = empty ? T.text4 : T.text3; e.currentTarget.style.borderColor = T.line; } }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ch.color, opacity: active ? 1 : 0.5 }} />
                {ch.label}
                <span className="tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>{ch.count}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      <AssetPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedAsset={assetFilter === 'all' ? null : assetFilter}
        onSelect={(symbol) => setAsset(symbol)}
      />
    </>
  );
}
