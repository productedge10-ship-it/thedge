import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Trash2, Loader2, Inbox,
  ShieldCheck, ShieldAlert, AlertTriangle, Zap, CircleCheck,
} from 'lucide-react';
import AssetIcon from '../ui/AssetIcon';
import { T, SPRING, EASE } from '../../lib/theme';

/* ==================================================================
   Таблиця угод.
   — сортування по кліку на заголовок
   — рядки 56px: достатньо повітря, щоб око чіплялось за кожен
   — зебра + логотип активу дають вертикальні орієнтири при скануванні
   — дисципліна читається як три чіткі стани, а не три сірі іконки
================================================================== */

const RESULT = {
  win:  { label: 'Take', c: T.ok,   rgb: T.okRgb },
  lose: { label: 'Stop', c: T.bad,  rgb: T.badRgb },
  be:   { label: 'BE',   c: T.warn, rgb: T.warnRgb },
};

const COLUMNS = [
  { key: 'plan_date',    label: 'Date',      align: 'left',   sortable: true },
  { key: 'plan_pair',    label: 'Asset',     align: 'left',   sortable: true },
  { key: 'account_name', label: 'Account',   align: 'left',   sortable: true, hide: true },
  { key: 'risk',         label: 'Risk',      align: 'right',  sortable: false, hide: true },
  { key: 'rr',           label: 'R / $',     align: 'right',  sortable: true },
  { key: 'result',       label: 'Status',    align: 'left',   sortable: true },
  { key: '_discipline',  label: 'Discipline',align: 'center', sortable: false },
  { key: '_actions',     label: '',          align: 'center', sortable: false },
];

/* Три бари — той самий візуальний мотив, що й «Дисципліна» в шапці
   картки угоди (TradeDetailsModal): зелений бар = пункт дотримано,
   червоний = відхилення. Той самий патерн в обох місцях — юзер
   один раз навчився його читати й впізнає одразу, без розшифровки
   трьох різних іконок. */
/* Три іконки, кожна — своя категорія, і кожна ЗАВЖДИ кольорова:
   раніше «ок» ховалось за тьмяною крапкою й лише проблема мала
   іконку — нерівноцінно й важче сканувати. Тепер обидва стани
   показують значущу іконку, просто різного кольору, тому весь
   рядок читається одним поглядом без розшифровки. */
function Discipline({ trade }) {
  const items = [
    { ok: !!trade.followed_plan, okIcon: ShieldCheck, badIcon: ShieldAlert, okC: T.ok, badC: T.bad,    okT: 'Followed the plan',  badT: 'Deviated from the plan' },
    { ok: !trade.has_mistake,    okIcon: CircleCheck,  badIcon: AlertTriangle, okC: T.ok, badC: T.warn, okT: 'No mistakes',         badT: 'Mistake in analysis' },
    { ok: !trade.rushed,         okIcon: CircleCheck,  badIcon: Zap,           okC: T.ok, badC: '#fb923c', okT: 'Entry by the rules', badT: 'Rushed / FOMO' },
  ];

  return (
    <div className="flex items-center justify-center gap-1.5">
      {items.map((it, i) => {
        const Icon = it.ok ? it.okIcon : it.badIcon;
        const c = it.ok ? it.okC : it.badC;
        return (
          <span
            key={i}
            title={it.ok ? it.okT : it.badT}
            className="grid h-6 w-6 place-items-center rounded-full"
            style={{ background: `rgba(${it.ok ? T.okRgb : (i === 0 ? T.badRgb : i === 1 ? T.warnRgb : '251,146,60')},0.14)` }}
          >
            <Icon size={13} strokeWidth={2.4} style={{ color: c }} />
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

/* Вікно номерів сторінок: перша, остання, сусіди поточної — решта
   ховається за «···», щоб при сотні сторінок рядок не розповз. */
function pageWindow(current, total) {
  const set = new Set([1, total, current - 1, current, current + 1]);
  return [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages);

  const navBtn = (disabled, onClick, Icon) => (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={SPRING}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-150 disabled:opacity-25"
      style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text3; }}
    >
      <Icon size={15} strokeWidth={2.4} />
    </motion.button>
  );

  return (
    <div className="flex items-center justify-center gap-1.5 px-5 py-4" style={{ borderTop: `1px solid ${T.line}` }}>
      {navBtn(page === 1, () => onChange(page - 1), ChevronLeft)}

      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const showGap = prev !== undefined && p - prev > 1;
        const active = p === page;
        return (
          <div key={p} className="flex items-center gap-1.5">
            {showGap && (
              <span className="px-1 text-[13px] tabular-nums" style={{ color: T.text4, fontFamily: T.mono }}>
                ···
              </span>
            )}
            <motion.button
              onClick={() => onChange(p)}
              whileTap={{ scale: 0.92 }}
              transition={SPRING}
              className="relative grid h-9 min-w-9 place-items-center overflow-hidden rounded-lg px-2.5 text-[13.5px] font-bold tabular-nums transition-colors duration-150"
              style={{
                color: active ? T.acc : T.text3,
                border: `1px solid ${active ? T.lineAcc : 'transparent'}`,
                fontFamily: T.mono,
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.sunken; } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = 'transparent'; } }}
            >
              {/* Спільний layoutId — приглушена акцентна заливка плавно
                  «переїжджає» між кнопками замість миттєвого стрибка. */}
              {active && (
                <motion.span
                  layoutId="journal-pagination-active"
                  transition={SPRING}
                  className="absolute inset-0 -z-10"
                  style={{ background: `rgba(${T.accRgb},0.14)` }}
                />
              )}
              <span className="relative">{p}</span>
            </motion.button>
          </div>
        );
      })}

      {navBtn(page === totalPages, () => onChange(page + 1), ChevronRight)}
    </div>
  );
}

export default function TradesTable({
  trades, accountsMap, getProfit, onOpen, onDelete,
  loading, page, totalPages, onPageChange, pageSize = 10,
}) {
  const [sort, setSort] = useState({ key: 'plan_date', dir: 'desc' });
  /* R і профіт — та сама угода в двох мірках, не два незалежних
     факти, тому не показуємо обидва одночасно: клік по числу
     перемикає лише той рядок, по якому клікнули, а не весь стовпець. */
  const [profitIds, setProfitIds] = useState(() => new Set());
  const toggleProfit = (id) => setProfitIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
            No trades found
          </span>
          <span className="text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
            Try changing the filters or period
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Зміна сторінки — крос-фейд усього блока таблиці.
         — key прив'язаний до реальних даних (id рядків), а не до
           номера сторінки: клік одразу міняє page, але рядки ще
           старі, поки йде запит — інакше анімація відіграється на
           застарілих даних, а свіжі просто вискакують без переходу.
         — mode="wait" не дає старій і новій сторінці існувати в DOM
           одночасно (це й давало «рваність»).
         — висота завжди зарезервована під повну сторінку (pageSize),
           а не під поточну кількість рядків: інакше на останній,
           неповній сторінці контейнер стискався і всю сторінку сайту
           смикало/скролило вгору. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={rows.map((r) => r.id).join('-') || `empty-${page}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="overflow-x-auto"
          style={{ minHeight: pageSize * 56 + 45 }}
        >
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
              const rowShowProfit = profitIds.has(t.id);
              const zebra = idx % 2 === 1;

              return (
                <tr
                  key={t.id}
                  onClick={() => { const { _profit, ...orig } = t; onOpen(orig); }}
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

                  {/* R і профіт — одна й та сама угода в двох мірках, тому
                      не обидві одразу: клік перемикає лише цей рядок.
                      Значення «перегортається» 3D-фліпом, як табло на
                      вокзалі — соковитіше за банальний fade, і сама
                      висота-обгортка для overflow тепер окрема від
                      падінгів кнопки (раніше вони конфліктували й
                      текст просто обрізало). */}
                  <td className="px-4 py-0 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleProfit(t.id); }}
                      title={rowShowProfit ? 'Show R' : 'Show profit in $'}
                      className="ml-auto flex items-center justify-end rounded-md px-2 py-1.5 transition-colors"
                      style={{ perspective: 300 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="relative block h-[19px] w-[104px] shrink-0 overflow-hidden text-right">
                        <AnimatePresence mode="popLayout" initial={false}>
                          {rowShowProfit ? (
                            <motion.span
                              key="profit"
                              initial={{ rotateX: -90, opacity: 0 }}
                              animate={{ rotateX: 0, opacity: 1 }}
                              exit={{ rotateX: 90, opacity: 0 }}
                              transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                              className="block whitespace-nowrap text-[14.5px] font-bold tabular-nums"
                              style={{ fontFamily: T.mono, color: pColor, lineHeight: '19px', transformOrigin: 'center bottom' }}
                            >
                              {t._profit === null
                                ? '—'
                                : `${t._profit > 0 ? '+' : t._profit < 0 ? '−' : ''}$${Math.abs(t._profit).toFixed(2)}`}
                            </motion.span>
                          ) : (
                            <motion.span
                              key="rr"
                              initial={{ rotateX: -90, opacity: 0 }}
                              animate={{ rotateX: 0, opacity: 1 }}
                              exit={{ rotateX: 90, opacity: 0 }}
                              transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                              className="block whitespace-nowrap text-[14.5px] font-bold tabular-nums"
                              style={{ fontFamily: T.mono, color: rrColor, lineHeight: '19px', transformOrigin: 'center bottom' }}
                            >
                              {rr === null ? '—' : `${rr > 0 ? '+' : ''}${rr}R`}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                    </button>
                  </td>

                  <td className="px-4 py-0">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em]"
                      style={
                        res
                          ? { background: `rgba(${res.rgb},0.12)`, border: `1px solid rgba(${res.rgb},0.26)`, color: res.c, fontFamily: T.sans }
                          : { background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }
                      }
                    >
                      <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: res ? res.c : T.text4 }} />
                      {res ? res.label : 'Not set'}
                    </span>
                  </td>

                  <td className="px-4 py-0">
                    <Discipline trade={t} />
                  </td>

                  <td className="px-4 py-0 pr-6 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                      title="Delete trade"
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
        </motion.div>
      </AnimatePresence>

      <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
    </>
  );
}
