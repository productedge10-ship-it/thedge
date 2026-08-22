import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, TrendingUp, TrendingDown, FileText, AlertTriangle, CheckCheck, Circle,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { rOf, fmtDate, fmtR, MISTAKE_TYPES } from '../../lib/reviewsData';

/* ==================================================================
   Матеріал для розбору: угоди, плани, помилки.
   Кожен елемент — рядок із галочкою. Вибране підсвічується акцентом
   і одразу летить у висновок праворуч, тому видно, з чого саме
   зроблений висновок.
================================================================== */

const resColor = (r) => ({ WIN: T.ok, LOSS: T.bad, BE: T.text3 }[r] || T.text3);
const sevColor = (s) => ({ high: T.bad, mid: T.warn, low: T.text3 }[s] || T.text3);

const TABS = [
  { key: 'trades',   label: 'Угоди',   icon: TrendingUp },
  { key: 'plans',    label: 'Плани',   icon: FileText },
  { key: 'mistakes', label: 'Помилки', icon: AlertTriangle },
];

function Row({ selected, onToggle, accent, children }) {
  return (
    <div
      onClick={onToggle}
      className="group flex cursor-pointer items-start gap-3.5 rounded-xl p-3.5 transition-colors duration-200"
      style={{
        background: selected ? `rgba(${T.accRgb},0.07)` : T.sunken,
        border: `1px solid ${selected ? T.lineAcc : T.line}`,
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = T.line; }}
    >
      {/* галочка */}
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors duration-200"
        style={{
          background: selected ? T.acc : 'transparent',
          border: `1.5px solid ${selected ? T.acc : T.lineHi}`,
        }}
      >
        {selected && <Check size={12} strokeWidth={3.4} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />}
      </span>

      <div className="min-w-0 flex-1">{children}</div>

      {accent && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />}
    </div>
  );
}

export default function EvidencePicker({ trades, plans, mistakes, selected, onToggle }) {
  const [tab, setTab] = useState('trades');

  const counts = {
    trades: trades.length,
    plans: plans.length,
    mistakes: mistakes.length,
  };

  const list = { trades, plans, mistakes }[tab];

  const renderItem = (item) => {
    if (tab === 'trades') {
      const r = rOf(item);
      const long = item.type === 'LONG';
      return (
        <Row
          key={item.id}
          selected={selected.trades.includes(item.id)}
          onToggle={() => onToggle('trades', item.id)}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>{item.pair}</span>
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold"
              style={{
                fontFamily: T.sans,
                color: long ? T.ok : T.info,
                background: long ? `rgba(${T.okRgb},0.10)` : `rgba(${T.infoRgb},0.10)`,
              }}
            >
              {long ? <TrendingUp size={11} strokeWidth={2.6} /> : <TrendingDown size={11} strokeWidth={2.6} />}
              {item.type}
            </span>
            <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: resColor(item.result) }}>
              {fmtR(r)}
            </span>
            <span className="ml-auto text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
              {fmtDate(item.date)} · {item.session}
            </span>
          </div>
          <p className="text-[13.5px] leading-snug" style={{ fontFamily: T.sans, color: T.text3 }}>{item.note}</p>
          {!item.followedPlan && (
            <span className="mt-1.5 inline-block text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.warn }}>
              не за планом
            </span>
          )}
        </Row>
      );
    }

    if (tab === 'plans') {
      const done = item.status === 'Відпрацьовано';
      return (
        <Row
          key={item.id}
          selected={selected.plans.includes(item.id)}
          onToggle={() => onToggle('plans', item.id)}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>{item.pair}</span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold"
              style={{
                fontFamily: T.sans,
                color: done ? T.ok : T.warn,
                background: done ? `rgba(${T.okRgb},0.10)` : `rgba(${T.warnRgb},0.10)`,
              }}
            >
              {item.status}
            </span>
            <span className="ml-auto text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
              {fmtDate(item.date)}
            </span>
          </div>
          <p className="text-[13.5px] leading-snug" style={{ fontFamily: T.sans, color: T.text3 }}>{item.text}</p>
        </Row>
      );
    }

    const meta = MISTAKE_TYPES[item.type] || { label: item.type };
    return (
      <Row
        key={item.id}
        selected={selected.mistakes.includes(item.id)}
        onToggle={() => onToggle('mistakes', item.id)}
        accent={sevColor(item.severity)}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: sevColor(item.severity) }}>
            {meta.label}
          </span>
          <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>{item.pair}</span>
          {item.cost != null && (
            <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.bad }}>
              {fmtR(item.cost)}
            </span>
          )}
          <span className="ml-auto text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
            {fmtDate(item.date)}
          </span>
        </div>
        <p className="text-[13.5px] leading-snug" style={{ fontFamily: T.sans, color: T.text3 }}>{item.description}</p>
      </Row>
    );
  };

  const selectedCount = selected[tab].length;
  const allSelected = list.length > 0 && selectedCount === list.length;

  const toggleAll = () => {
    list.forEach((item) => {
      const isOn = selected[tab].includes(item.id);
      if (allSelected ? isOn : !isOn) onToggle(tab, item.id);
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      {/* вкладки */}
      <div className="flex items-center gap-1 px-3 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          const picked = selected[key].length;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-semibold transition-colors duration-200"
              style={{ fontFamily: T.sans, color: on ? T.text : T.text3, zIndex: 1 }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
            >
              {on && (
                <motion.span
                  layoutId="rv-tab"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-xl"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, zIndex: -1 }}
                />
              )}
              <Icon size={15} strokeWidth={2.2} style={{ color: on ? T.acc : T.text4 }} />
              {label}
              <span className="text-[12.5px] tabular-nums" style={{ color: T.text4 }}>{counts[key]}</span>
              {picked > 0 && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums"
                  style={{ background: `rgba(${T.accRgb},0.14)`, color: T.acc }}
                >
                  {picked}
                </span>
              )}
            </button>
          );
        })}

        <button
          onClick={toggleAll}
          disabled={!list.length}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-200"
          style={{ fontFamily: T.sans, color: T.text3, opacity: list.length ? 1 : 0.4 }}
          onMouseEnter={(e) => { if (list.length) e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
        >
          {allSelected ? <Circle size={13} strokeWidth={2.4} /> : <CheckCheck size={14} strokeWidth={2.4} />}
          {allSelected ? 'зняти все' : 'вибрати все'}
        </button>
      </div>

      {/* список */}
      <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto p-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="flex flex-col gap-2"
          >
            {list.length === 0 ? (
              <p className="px-2 py-10 text-center text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                За цей період нічого немає.
              </p>
            ) : (
              list.map(renderItem)
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
