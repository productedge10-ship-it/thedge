import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Trash2, Loader2,
  ShieldCheck, ShieldAlert, AlertTriangle, Zap, Inbox,
} from 'lucide-react';
import AssetIcon from '../ui/AssetIcon';
import { T, SPRING } from '../../lib/theme';

/* ==================================================================
   Таблиця угод.
   — сортування по кліку на заголовок
   — рядки 56px: достатньо повітря, щоб око чіплялось за кожен
   — зебра + логотип активу дають вертикальні орієнтири при скануванні
   — дисципліна читається як три чіткі стани, а не три сірі іконки
================================================================== */

const RESULT = {
  win:  { label: 'Win',  c: T.ok,   rgb: T.okRgb },
  lose: { label: 'Lose', c: T.bad,  rgb: T.badRgb },
  be:   { label: 'BE',   c: T.warn, rgb: T.warnRgb },
};

const COLUMNS = [
  { key: 'plan_date',    label: 'Дата',      align: 'left',   sortable: true },
  { key: 'plan_pair',    label: 'Актив',     align: 'left',   sortable: true },
  { key: 'account_name', label: 'Акаунт',    align: 'left',   sortable: true, hide: true },
  { key: 'risk',         label: 'Ризик',     align: 'right',  sortable: false, hide: true },
  { key: 'rr',           label: 'R',         align: 'right',  sortable: true },
  { key: '_profit',      label: 'Профіт',    align: 'right',  sortable: true },
  { key: 'result',       label: 'Результат', align: 'left',   sortable: true },
  { key: '_discipline',  label: 'Процес',    align: 'center', sortable: false },
  { key: '_actions',     label: '',          align: 'center', sortable: false },
];

/* Три стани процесу. Позитив = тьмяна крапка, проблема = кольорова іконка */
function Discipline({ trade }) {
  const items = [
    {
      ok: !!trade.followed_plan,
      okIcon: ShieldCheck, badIcon: ShieldAlert,
      okC: T.ok, badC: T.bad,
      okT: 'Торгував за планом', badT: 'Відхилився від плану',
      alwaysShow: true,
    },
    {
      ok: !trade.has_mistake,
      badIcon: AlertTriangle, badC: T.warn,
      okT: 'Без помилок', badT: 'Була помилка в аналізі',
    },
    {
      ok: !trade.rushed,
      badIcon: Zap, badC: '#fb923c',
      okT: 'Вхід за правилами', badT: 'Поспішив / FOMO',
    },
  ];

  return (
    <div className="flex items-center justify-center gap-2">
      {items.map((it, i) => {
        const showIcon = !it.ok || it.alwaysShow;
        const Icon = it.ok ? it.okIcon : it.badIcon;
        const color = it.ok ? it.okC : it.badC;
        const title = it.ok ? it.okT : it.badT;

        if (!showIcon || !Icon) {
          return (
            <span key={i} title={title} className="grid h-6 w-6 place-items-center">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.line }} />
            </span>
          );
        }

        return (
          <span
            key={i}
            title={title}
            className="grid h-6 w-6 place-items-center rounded-md"
            style={{ background: it.ok ? 'transparent' : `${color}18` }}
          >
            <Icon size={15} strokeWidth={2.4} style={{ color }} />
          </span>
        );
      })}
    </div>
  );
}

function SortIcon({ state }) {
  if (state === 'asc')  return <ChevronUp size={13} strokeWidth={3} style={{ color: T.acc }} />;
  if (state === 'desc') return <ChevronDown size={13} strokeWidth={3} style={{ color: T.acc }} />;
  return (
    <ChevronsUpDown
      size={13}
      strokeWidth={2.4}
      style={{ color: T.text4 }}
      className="opacity-0 transition-opacity group-hover/th:opacity-100"
    />
  );
}

export default function TradesTable({
  trades, accountsMap, getProfit, onOpen, onDelete,
  loading, loadingMore, hasMore, onLoadMore,
}) {
  const [sort, setSort] = useState({ key: 'plan_date', dir: 'desc' });

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  const rows = useMemo(() => {
    const withProfit = trades.map((t) => ({ ...t, _profit: getProfit(t, accountsMap) }));
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;

    return withProfit.sort((a, b) => {
      let x = a[key];
      let y = b[key];
      if (key === 'rr' || key === '_profit') {
        x = x === null || x === undefined || x === '' ? -Infinity : parseFloat(x);
        y = y === null || y === undefined || y === '' ? -Infinity : parseFloat(y);
        return (x - y) * mul;
      }
      return String(x ?? '').localeCompare(String(y ?? ''), 'uk') * mul;
    });
  }, [trades, sort, accountsMap, getProfit]);

  const align = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin" style={{ color: T.acc }} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <Inbox size={30} strokeWidth={1.6} style={{ color: T.text4 }} />
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-bold" style={{ color: T.text2, fontFamily: T.sans }}>
            Угод не знайдено
          </span>
          <span className="text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
            Спробуй змінити фільтри або період
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`group/th ${align(c.align)} ${c.hide ? 'hidden lg:table-cell' : ''} px-4 py-3 first:pl-6 last:pr-6`}
                >
                  {c.sortable ? (
                    <button
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1.5 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                    >
                      <span
                        className="text-[12px] font-bold uppercase tracking-[0.1em] transition-colors"
                        style={{ fontFamily: T.sans, color: sort.key === c.key ? T.text : T.text3 }}
                      >
                        {c.label}
                      </span>
                      <SortIcon state={sort.key === c.key ? sort.dir : null} />
                    </button>
                  ) : (
                    <span
                      className="text-[12px] font-bold uppercase tracking-[0.1em]"
                      style={{ fontFamily: T.sans, color: T.text3 }}
                    >
                      {c.label}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((t, idx) => {
              const res = RESULT[t.result?.trim().toLowerCase()];
              const rr = t.rr === null || t.rr === '' ? null : parseFloat(t.rr);
              const rrColor = rr === null ? T.text4 : rr > 0 ? T.ok : rr < 0 ? T.bad : T.text3;
              const pColor = t._profit === null ? T.text4 : t._profit > 0 ? T.ok : t._profit < 0 ? T.bad : T.text3;
              const zebra = idx % 2 === 1;

              return (
                <tr
                  key={t.id}
                  onClick={() => onOpen(t)}
                  className="group cursor-pointer transition-colors duration-150"
                  style={{
                    borderBottom: `1px solid ${T.line}`,
                    background: zebra ? 'rgba(255,255,255,0.012)' : 'transparent',
                    height: 56,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceHi)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = zebra ? 'rgba(255,255,255,0.012)' : 'transparent')}
                >
                  <td className="relative px-4 py-0 pl-6 text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
                    {/* акцентна смуга — зʼїжджає збоку при наведенні */}
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-250 group-hover:h-[34px]"
                      style={{ background: res ? res.c : T.acc }}
                    />
                    {t.plan_date}
                  </td>

                  {/* Актив з логотипом — головний вертикальний орієнтир */}
                  <td className="px-4 py-0">
                    <span className="flex items-center gap-3">
                      <motion.span
                        className="grid w-9 shrink-0 place-items-center"
                        whileHover={{ scale: 1.14 }}
                        transition={SPRING}
                      >
                        <AssetIcon symbol={t.plan_pair || ''} category={t.category} />
                      </motion.span>
                      <span
                        className="text-[15px] font-bold transition-colors duration-200 group-hover:text-[var(--edge-text)]"
                        style={{ fontFamily: T.sans, color: T.text }}
                      >
                        {t.plan_pair}
                      </span>
                    </span>
                  </td>

                  <td className="hidden px-4 py-0 text-[14px] lg:table-cell" style={{ fontFamily: T.sans, color: T.text2 }}>
                    {t.account_name || '—'}
                  </td>

                  <td className="hidden px-4 py-0 text-right text-[14px] tabular-nums lg:table-cell" style={{ fontFamily: T.mono, color: T.text2 }}>
                    {t.risk || '—'}
                  </td>

                  <td className="px-4 py-0 text-right text-[15px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: rrColor }}>
                    {rr === null ? '—' : `${rr > 0 ? '+' : ''}${rr}R`}
                  </td>

                  <td className="px-4 py-0 text-right text-[15px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: pColor }}>
                    {t._profit === null
                      ? '—'
                      : `${t._profit > 0 ? '+' : t._profit < 0 ? '−' : ''}$${Math.abs(t._profit).toFixed(2)}`}
                  </td>

                  <td className="px-4 py-0">
                    <span
                      className="inline-block rounded-lg px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em]"
                      style={
                        res
                          ? { background: `rgba(${res.rgb},0.12)`, border: `1px solid rgba(${res.rgb},0.26)`, color: res.c, fontFamily: T.sans }
                          : { background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }
                      }
                    >
                      {res ? res.label : 'Не вказано'}
                    </span>
                  </td>

                  <td className="px-4 py-0">
                    <Discipline trade={t} />
                  </td>

                  <td className="px-4 py-0 pr-6 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                      title="Видалити угоду"
                      className="grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-all duration-150 group-hover:opacity-100"
                      style={{ color: T.text4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; e.currentTarget.style.color = T.bad; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text4; }}
                    >
                      <Trash2 size={15} strokeWidth={2.2} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center px-5 py-4" style={{ borderTop: `1px solid ${T.line}` }}>
          <motion.button
            onClick={onLoadMore}
            disabled={loadingMore}
            whileTap={{ scale: 0.97 }}
            transition={SPRING}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold transition-colors"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
          >
            {loadingMore
              ? <Loader2 size={15} className="animate-spin" style={{ color: T.acc }} />
              : <ChevronDown size={15} strokeWidth={2.6} />}
            {loadingMore ? 'Завантаження...' : 'Показати ще'}
          </motion.button>
        </div>
      )}
    </>
  );
}
