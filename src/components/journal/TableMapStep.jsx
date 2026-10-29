import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ChevronLeft, ChevronRight, X, Image as ImageIcon } from 'lucide-react';
import { tvImage } from '../../lib/imageStore';
import { TARGETS, buildTrades } from '../../lib/tableImport';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';

/* ==================================================================
   Крок «що в якій колонці».

   Замість рядка-селекта — картка колонки з прикладами значень і
   велика кнопка поля. Клік відкриває вибір: поля згруповані за
   змістом, у кожного — пояснення. Згори — три обовʼязкові поля з
   галочками, знизу живий перегляд: яка угода вийде з першого рядка.
================================================================== */

const GROUPS = [
  { title: tx('Основне', 'Basics'), keys: ['date', 'pair', 'dir', 'rr', 'result'] },
  { title: tx('Гроші й ризик', 'Money & risk'), keys: ['profit', 'profitPct', 'risk'] },
  { title: tx('Час', 'Time'), keys: ['session', 'entryTime', 'exitTime'] },
  { title: tx('Текст і скріни', 'Text & screenshots'), keys: ['description', 'note', 'images', 'mistake', 'id'] },
  { title: tx('Не потрібно', 'Not needed'), keys: ['skip'] },
];

const HINT = {
  date: tx('Коли була угода', 'When the trade happened'),
  pair: tx('EURUSD, XAUUSD, BTC…', 'EURUSD, XAUUSD, BTC…'),
  dir: tx('Long / Short, Buy / Sell', 'Long / Short, Buy / Sell'),
  rr: tx('Результат у R: 2.2, -1, 0', 'Result in R: 2.2, -1, 0'),
  result: tx('Win / Loss, Так / Ні, TP / SL', 'Win / Loss, Yes / No, TP / SL'),
  profit: tx('Прибуток чи збиток у валюті', 'Profit or loss in money'),
  profitPct: tx('Прибуток у відсотках', 'Profit in percent'),
  risk: tx('Скільки ризикував: 0.5% або $50', 'How much you risked: 0.5% or $50'),
  session: tx('Азія, Лондон, Нью-Йорк', 'Asia, London, New York'),
  entryTime: tx('О котрій зайшов', 'When you entered'),
  exitTime: tx('О котрій вийшов', 'When you exited'),
  description: tx('Головний текст: ідея, аргументи', 'Main text: idea, arguments'),
  note: tx('Піде в опис разом з назвою колонки', 'Goes to the description with the column name'),
  images: tx('Посилання TradingView або картинки з архіву', 'TradingView links or images from the archive'),
  mistake: tx('Помилка в угоді, якщо була', 'The mistake in the trade, if any'),
  id: tx('Номер для ідентифікації, дублів не буде', 'A number to identify the row, prevents duplicates'),
  skip: tx('Цю колонку не переносимо', 'This column is not imported'),
};

const label = (k) => { const t = TARGETS.find((x) => x.key === k); return t ? tx(t.uk, t.en, t.ru) : k; };
const REQUIRED = ['date', 'pair', 'result'];
const RESULT_KEYS = ['rr', 'result', 'profit', 'profitPct'];

/* Колір поля: основні — акцент, решта — спокійні відтінки. */
function tone(k) {
  if (k === 'skip') return { fg: T.text4 || T.text3, bg: 'transparent', bd: T.line };
  if (k === 'note') return { fg: T.text2, bg: T.surface, bd: T.line };
  return { fg: T.acc, bg: `rgba(${T.accRgb},0.10)`, bd: `rgba(${T.accRgb},0.38)` };
}

function Picker({ header, samples, current, map, onPick, onClose }) {
  const takenBy = (k) => (k === 'note' || k === 'images' || k === 'skip' ? null : Object.keys(map).find((h) => h !== header && map[h] === k));
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex items-end justify-center rounded-3xl sm:items-center"
      style={{ background: 'rgba(6,6,10,0.7)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="flex max-h-[88%] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl"
        style={{ background: T.surface, border: `1px solid ${T.lineHi || T.line}`, boxShadow: '0 30px 80px -20px rgba(0,0,0,0.9)' }}
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>{tx('Колонка', 'Column')}</div>
            <div className="mt-0.5 truncate text-[16px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>{header}</div>
            {samples.length > 0 && (
              <div className="mt-1 truncate text-[12px]" style={{ fontFamily: T.mono, color: T.text3 }}>{samples.join('  ·  ')}</div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={tx('Закрити', 'Close')} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: T.text3, border: `1px solid ${T.line}` }}>
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto overflow-x-hidden px-2 pb-3" style={{ borderTop: `1px solid ${T.line}` }}>
          {GROUPS.map((g) => (
            <div key={g.title} className="pt-3">
              <div className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 || T.text3 }}>{g.title}</div>
              {g.keys.map((k) => {
                const on = current === k;
                const by = takenBy(k);
                const tn = tone(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onPick(k)}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/5"
                    style={{ background: on ? tn.bg : undefined }}
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ border: on ? 'none' : `1.5px solid ${T.lineHi || T.line}`, background: on ? T.acc : 'transparent', color: '#0A0A0C' }}>
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>{label(k)}</span>
                      <span className="block truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>{HINT[k]}</span>
                    </span>
                    {by && !on && (
                      <span className="max-w-[110px] shrink-0 truncate text-[11px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                        {tx('зараз: ', 'now: ')}{by}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

const resColor = (r) => (r === 'Win' ? T.ok : r === 'Lose' ? T.bad : T.text3);

export default function TableMapStep({ src, map, setTarget, fromSaved, overlayHost }) {
  const [pick, setPick] = useState(null);
  const [ri, setRi] = useState(0);
  void overlayHost;

  const samples = useMemo(() => {
    const out = {};
    for (const h of src.headers) {
      const seen = [];
      for (const r of src.rows) {
        const v = String(r[h] ?? '').replace(/\s+/g, ' ').trim();
        if (v && !seen.includes(v)) seen.push(v);
        if (seen.length >= 3) break;
      }
      out[h] = seen;
    }
    return out;
  }, [src]);

  const has = (k) => Object.values(map).includes(k);
  const colOf = (k) => Object.keys(map).find((h) => map[h] === k);
  const checks = [
    { k: 'date', ok: has('date'), name: tx('Дата', 'Date'), col: colOf('date') },
    { k: 'pair', ok: has('pair'), name: tx('Актив', 'Asset'), col: colOf('pair') },
    { k: 'result', ok: RESULT_KEYS.some(has), name: tx('Результат', 'Result'), col: colOf('rr') || colOf('result') || colOf('profit') || colOf('profitPct') },
  ];

  const rowNo = Math.min(ri, src.rows.length - 1);
  const first = useMemo(() => {
    const r = buildTrades(src.rows.slice(rowNo, rowNo + 1), map, {});
    return { t: r.trades[0], why: r.skipped[0]?.why };
  }, [src, map, rowNo]);
  const all = useMemo(() => {
    const r = buildTrades(src.rows, map, {});
    return { n: r.trades.length, bad: r.skipped.length, w: r.trades.filter((x) => x.result === 'Win').length, l: r.trades.filter((x) => x.result === 'Lose').length };
  }, [src, map]);
  const notes = Object.keys(map).filter((h) => map[h] === 'note').length;
  const shots = Object.keys(map).filter((h) => map[h] === 'images').length;
  void REQUIRED;

  const t = first.t;
  const sideOn = t?.type === 'Short';
  const small = (name, value) => (
    <div className="min-w-0 rounded-lg px-2.5 py-2" style={{ background: T.sunken }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>{name}</div>
      <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: value ? T.text : T.text3 }}>{value || '—'}</div>
    </div>
  );
  const thumbs = t ? (t.trade_images || []).slice(0, 3) : [];
  const fileCount = t ? t.__files.length : 0;
  const rr = t?.__r;

  const preview = (
    <aside className="lg:sticky lg:top-0 lg:self-start">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>{tx('Так це буде в журналі', 'How it will look in the journal')}</div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={tx('Попередня', 'Previous')} disabled={rowNo <= 0} onClick={() => setRi(rowNo - 1)} className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: T.text3, border: `1px solid ${T.line}`, opacity: rowNo <= 0 ? 0.4 : 1 }}><ChevronLeft size={14} /></button>
          <span className="min-w-[44px] text-center text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>{rowNo + 1}/{src.rows.length}</span>
          <button type="button" aria-label={tx('Наступна', 'Next')} disabled={rowNo >= src.rows.length - 1} onClick={() => setRi(rowNo + 1)} className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: T.text3, border: `1px solid ${T.line}`, opacity: rowNo >= src.rows.length - 1 ? 0.4 : 1 }}><ChevronRight size={14} /></button>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.lineHi || T.line}` }}>
        {t ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[20px] font-bold" style={{ fontFamily: T.display || T.sans, color: T.text, letterSpacing: '-0.02em' }}>{t.plan_pair}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, color: sideOn ? T.bad : T.ok, background: sideOn ? `rgba(${T.badRgb},0.12)` : `rgba(${T.okRgb},0.12)` }}>{t.type}</span>
                </div>
                <div className="mt-0.5 text-[12.5px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>{t.plan_date}</div>
              </div>
              <div className="text-right">
                <div className="text-[28px] font-bold leading-none tabular-nums" style={{ fontFamily: T.mono, color: resColor(t.result) }}>
                  {rr == null ? '—' : `${rr > 0 ? '+' : rr < 0 ? '−' : ''}${Math.abs(rr)}R`}
                </div>
                <div className="mt-1 text-[12px] font-semibold" style={{ fontFamily: T.sans, color: resColor(t.result) }}>
                  {t.result === 'Win' ? tx('Плюс', 'Win') : t.result === 'Lose' ? tx('Мінус', 'Loss') : t.result === 'BE' ? tx('Беззбиток', 'Breakeven') : tx('Без результату', 'No result')}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {small(tx('Сесія', 'Session'), t.session)}
              {small(tx('Ризик', 'Risk'), t.risk)}
              {small(tx('Вхід', 'Entry'), t.entry_time)}
              {small(tx('Прибуток', 'Profit'), t.profit_money == null ? null : `${t.profit_money > 0 ? '+' : ''}${t.profit_money}`)}
            </div>

            {(thumbs.length > 0 || fileCount > 0 || shots > 0) && (
              <div className="mt-3 flex gap-2">
                {thumbs.map((u) => (
                  <img key={u} src={tvImage(u)} alt="" loading="lazy" className="h-[58px] min-w-0 flex-1 rounded-lg object-cover" style={{ background: T.sunken, border: `1px solid ${T.line}` }} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                ))}
                {fileCount > 0 && (
                  <div className="flex h-[58px] flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px]" style={{ fontFamily: T.sans, color: T.text3, background: T.sunken, border: `1px solid ${T.line}` }}>
                    <ImageIcon size={14} />{tx(`${fileCount} з архіву`, `${fileCount} from archive`)}
                  </div>
                )}
              </div>
            )}

            {t.trade_description && (
              <div className="mt-3 max-h-[150px] overflow-hidden whitespace-pre-line rounded-lg px-3 py-2.5 text-[12.5px] leading-[1.55]" style={{ fontFamily: T.sans, color: T.text2, background: T.sunken }}>
                {t.trade_description.length > 260 ? `${t.trade_description.slice(0, 260)}…` : t.trade_description}
              </div>
            )}
            {notes > 0 && (
              <div className="mt-2 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{tx(`Ще ${notes} колонок додано в опис`, `${notes} more columns added to the description`)}</div>
            )}
          </>
        ) : (
          <div className="py-6 text-center text-[13px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {first.why === 'pair' ? tx('У цьому рядку немає активу — перевір колонку «Актив».', 'This row has no asset — check the Asset column.') : tx('Цей рядок не читається: перевір колонку з датою.', 'This row can’t be read: check the date column.')}
          </div>
        )}
      </div>

      <div className="mt-2.5 text-[12px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.text3 }}>
        {tx(`Прочитано угод: ${all.n} з ${src.rows.length} · ${all.w} у плюс · ${all.l} у мінус`, `Trades read: ${all.n} of ${src.rows.length} · ${all.w} wins · ${all.l} losses`)}
      </div>
    </aside>
  );

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <p className="m-0 text-[13px] leading-[1.55]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {fromSaved
              ? tx('Ця таблиця вже була — взяли твої налаштування з минулого разу.', 'We’ve seen this table before — your settings from last time are applied.')
              : tx(`${src.rows.length} рядків. Ми підібрали поля самі. Натисни на поле праворуч, щоб змінити. Колонки без поля підуть в опис угоди з назвою — нічого не загубиться.`, `${src.rows.length} rows. We matched the fields ourselves. Tap a field on the right to change it. Columns without a field go into the trade description with their name, so nothing is lost.`)}
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {checks.map((c) => (
              <div key={c.k} className="min-w-0 rounded-xl px-3 py-2" style={{ background: c.ok ? `rgba(${T.okRgb},0.08)` : `rgba(${T.badRgb},0.08)`, border: `1px solid ${c.ok ? `rgba(${T.okRgb},0.3)` : `rgba(${T.badRgb},0.35)`}` }}>
                <div className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ fontFamily: T.sans, color: c.ok ? T.ok : T.bad }}>
                  {c.ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}{c.name}
                </div>
                <div className="mt-0.5 truncate text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{c.ok ? c.col : tx('обери колонку', 'pick a column')}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2">
            {src.headers.map((h) => {
              const k = map[h] || 'note';
              const tn = tone(k);
              const off = k === 'skip';
              const sm = samples[h] || [];
              return (
                <div key={h} className="grid grid-cols-1 gap-2.5 rounded-2xl p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,190px)] sm:items-center sm:gap-3" style={{ background: T.sunken, border: `1px solid ${T.line}`, opacity: off ? 0.6 : 1 }}>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>{h}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {sm.length ? sm.slice(0, 2).map((v) => (
                        <span key={v} className="max-w-full truncate rounded-md px-1.5 py-0.5 text-[11.5px]" style={{ fontFamily: T.mono, color: T.text2, background: 'rgba(255,255,255,0.05)' }}>{v.length > 34 ? `${v.slice(0, 34)}…` : v}</span>
                      )) : <span className="text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{tx('порожня', 'empty')}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPick(h)}
                    className="flex h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-[13.5px] font-semibold"
                    style={{ fontFamily: T.sans, color: tn.fg, background: tn.bg, border: `1px solid ${tn.bd}` }}
                  >
                    <span className="truncate">{label(k)}</span>
                    <ChevronDown size={15} className="shrink-0" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {preview}
      </div>

      <AnimatePresence>
        {pick && (
          <Picker
            key={pick}
            header={pick}
            samples={samples[pick] || []}
            current={map[pick] || 'note'}
            map={map}
            onPick={(k) => { setTarget(pick, k); setPick(null); }}
            onClose={() => setPick(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
