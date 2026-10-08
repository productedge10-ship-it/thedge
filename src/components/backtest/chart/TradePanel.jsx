import { useEffect, useMemo, useState } from 'react';
import { Check, Play, Plus, Scissors, MousePointerClick, Trash2, PanelRightClose, Pencil, ChevronDown } from 'lucide-react';
import TradeTags, { TagsSummary } from './TradeTags';
import { mistakeLabel } from '../../../lib/backtestTags';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { ACT, act } from '../accent';
import { fmtStamp } from '../../../lib/candles/timefmt';

/* ==================================================================
   Панель угоди праворуч — як ордер-панель у TradingView, але під
   бектест.

   1. Обираєш Buy чи Sell — на графіку зʼявляється майбутня угода:
      вхід, стоп, тейк. Тягнеш рівні мишкою або вписуєш тут. Можна й
      просто намалювати «Довгу/Коротку позицію» — вона сама стане
      чернеткою.
   2. Тип: по ринку або відкладений (ліміт/стоп — визначається сам,
      з якого боку від ціни рівень).
   3. Підтвердив — угода живе на графіку, стоп і тейк спрацьовують самі.
   4. Закрилась — одразу в обраний бектест, з R, сумою в $ і нотаткою.
================================================================== */

const BUY = '#2962ff';
const SELL = '#f23645';

const fmtNum = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const fmtR = (r) => `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`;
const fmtUsd = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 })}`;

/* Відстань у піпсах для валют (5 і 3 знаки), у пунктах — для решти. */
function dist(v, digits) {
  if (!Number.isFinite(v)) return '';
  if (digits === 5 || digits === 3) return `${(v / 10 ** -(digits - 1)).toFixed(1)} pips`;
  return `${(v / 10 ** -digits).toFixed(0)} ${tx('пт', 'pt')}`;
}

/* Поле ціни: поки в ньому курсор — не перебиваємо тим, що тягнеш
   на графіку; Enter або вихід із поля — застосувати. */
function NumField({ value, digits, onCommit, width = 'w-[112px]', suffix }) {
  const [edit, setEdit] = useState(null);
  const shown = edit ?? (Number.isFinite(value) ? value.toFixed(digits) : '');
  const commit = () => {
    if (edit == null) return;
    const v = Number(String(edit).replace(',', '.'));
    setEdit(null);
    if (Number.isFinite(v) && v > 0) onCommit(v);
  };
  return (
    <div className="relative">
      <input
        value={shown}
        onFocus={(e) => { setEdit(shown); e.currentTarget.select(); }}
        onChange={(e) => setEdit(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEdit(null); e.currentTarget.blur(); } }}
        inputMode="decimal"
        className={`${width} rounded-lg px-2.5 py-1.5 text-right text-[13px] outline-none transition-colors focus:border-[#2962ff]`}
        style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.mono, paddingRight: suffix ? 26 : undefined }}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: T.text3 }}>{suffix}</span>}
    </div>
  );
}

function Row({ label, color, children, hint }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold" style={{ color: color || T.text2 }}>{label}</div>
        {hint && <div className="truncate text-[11px] tabular-nums" style={{ color: T.text3, fontFamily: T.mono }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="grid rounded-lg p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)`, background: T.sunken, border: `1px solid ${T.line}` }}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className="rounded-md py-1.5 text-[12.5px] font-semibold transition-colors"
          style={{ background: value === id ? T.surface3 || 'rgba(255,255,255,0.08)' : 'transparent', color: value === id ? T.text : T.text3 }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* Крива капіталу в R — проста лінія з нулем, як у звіті стратегії TV. */
function EquityCurve({ curve, riskUsd }) {
  const W = 268; const H = 64; const pad = 4;
  const min = Math.min(0, ...curve); const max = Math.max(0, ...curve);
  const span = max - min || 1;
  const x = (i) => pad + (i / (curve.length - 1)) * (W - pad * 2);
  const y = (v) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const pts = curve.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = curve[curve.length - 1];
  const col = last >= 0 ? '#089981' : '#f23645';
  return (
    <div className="mt-3 rounded-lg p-2" style={{ background: T.sunken }}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text3 }}>
        <span>{tx('Крива капіталу', 'Equity curve')}</span>
        <span style={{ color: col, fontFamily: T.mono }}>{fmtR(last)} · {fmtUsd(last * riskUsd)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-1 block" aria-hidden>
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="rgba(128,128,128,0.35)" strokeDasharray="3 3" />
        <polygon points={`${x(0)},${y(0)} ${pts} ${x(curve.length - 1)},${y(0)}`} fill={col} fillOpacity="0.12" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function TradePanel({
  st, eng, prefs, setPrefs, digits: d, symbolName, closed, balance,
  sessions, sessionId, demo, onChooseSession, onCreateSession, creating, saving, unsaved, onSaveUnsaved,
  onStartReplay, onDeleteTrade, onFocusTrade, onEditTrade, resume, onResume, onHide,
}) {
  const [note, setNote] = useState('');
  const [meta, setMeta] = useState({});
  const [tagsOpen, setTagsOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const usedSetups = useMemo(() => [...new Set(closed.flatMap((t) => t.meta?.setups || []))], [closed]);
  const pos = st.pos;
  const order = st.order;
  const draft = st.draft;
  const riskPct = Number(prefs.riskPct) > 0 ? Number(prefs.riskPct) : 1;
  const riskUsd = (balance * riskPct) / 100;

  /* Нотатка належить угоді: після входу поле очищаємо. */
  useEffect(() => { if (pos || order) { setNote(''); setMeta({}); } }, [!!pos, !!order]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const dec = closed.filter((t) => t.result !== 'BE');
    const wins = closed.filter((t) => t.result === 'WIN');
    const gw = wins.reduce((a, t) => a + t.r, 0);
    const gl = Math.abs(closed.filter((t) => t.result === 'LOSS').reduce((a, t) => a + t.r, 0));
    let eq = 0; let peak = 0; let dd = 0;
    closed.forEach((t) => { eq += t.result === 'BE' ? 0 : t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); });
    const net = closed.reduce((a, t) => a + (t.result === 'BE' ? 0 : t.r), 0);
    /* Серії підряд: найдовша виграшна й програшна. BE серію не рве. */
    let cw = 0; let cl = 0; let bw = 0; let bl = 0;
    closed.forEach((t) => {
      if (t.result === 'WIN') { cw += 1; cl = 0; } else if (t.result === 'LOSS') { cl += 1; cw = 0; }
      bw = Math.max(bw, cw); bl = Math.max(bl, cl);
    });
    let run = 0;
    const curve = [0, ...closed.map((t) => { run += t.result === 'BE' ? 0 : t.r; return run; })];
    const avgW = wins.length ? gw / wins.length : null;
    const losses = closed.filter((t) => t.result === 'LOSS');
    const avgL = losses.length ? gl / losses.length : null;
    return {
      n: closed.length, net, wr: dec.length ? (wins.length / dec.length) * 100 : null,
      pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : null, avg: closed.length ? net / closed.length : null, dd,
      bw, bl, curve, avgW, avgL,
    };
  }, [closed]);

  const e = eng();
  const pick = (side) => {
    if (!e) return;
    if (!st.replay) { onStartReplay(); return; }
    if (prefs.oneClick) { e.openPosition(side, { rr: prefs.rr, note, meta }); return; }
    e.setDraft({ side });
  };

  /* ---------- запис у бектест ---------- */
  const saveBox = (
    <div className="rounded-xl p-2.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.text3 }}>{tx('Записувати в', 'Save to')}</span>
        {sessionId && !demo && <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: T.ok }}><Check size={12} /> {tx('автоматично', 'auto')}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={sessionId || ''}
          onChange={(ev) => onChooseSession(ev.target.value)}
          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[13px] outline-none"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}
        >
          <option value="">{tx('Без запису', 'Not saving')}</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button
          type="button"
          title={tx('Новий бектест для цього інструмента', 'New backtest for this symbol')}
          onClick={onCreateSession}
          disabled={creating}
          className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-lg disabled:opacity-50"
          style={{ background: act(0.14), color: ACT.tint }}
        >
          <Plus size={16} />
        </button>
      </div>
      {!sessionId && closed.length > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: T.warn }}>{tx('Угоди зараз не зберігаються — обери або створи бектест.', 'Trades aren’t saved — pick or create a backtest.')}</p>
      )}
      {unsaved.length > 0 && sessionId && !demo && (
        <button type="button" onClick={onSaveUnsaved} disabled={saving} className="mt-2 w-full rounded-lg py-1.5 text-[12.5px] font-semibold disabled:opacity-60" style={{ background: act(0.18), color: '#fff' }}>
          {saving ? tx('Записую…', 'Saving…') : tx(`Записати незбережені (${unsaved.length})`, `Save unsaved (${unsaved.length})`)}
        </button>
      )}
    </div>
  );

  /* Нотатка й теги відкритої угоди / ордера: згорнуто — коротко,
     розгорнуто — повний редактор. */
  const liveTags = (x) => (
    <div className="mt-2.5 rounded-lg" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <button type="button" onClick={() => setTagsOpen((v) => !v)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-[12px] font-semibold" style={{ color: T.text2 }}>
        <span className="flex min-w-0 items-center gap-2">
          {tx('Нотатка й теги', 'Note & tags')}
          {!tagsOpen && <TagsSummary meta={x.meta} note={x.note} />}
        </span>
        <ChevronDown size={14} style={{ transform: tagsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {tagsOpen && (
        <div className="px-2.5 pb-2.5">
          <TradeTags note={x.note || ''} meta={x.meta || {}} onNote={(v) => e?.setTradeMeta({ note: v })} onMeta={(patch) => e?.setTradeMeta({ meta: patch })} usedSetups={usedSetups} />
        </div>
      )}
    </div>
  );

  /* ---------- квиток ---------- */
  let ticket;
  if (pos) {
    const long = pos.side === 'LONG';
    const usd = pos.r * riskUsd;
    ticket = (
      <div className="rounded-xl p-3" style={{ background: T.sunken, border: `1px solid ${long ? 'rgba(41,98,255,0.55)' : 'rgba(242,54,69,0.55)'}` }}>
        <div className="flex items-center justify-between">
          <span className="rounded-md px-2 py-0.5 text-[12px] font-bold text-white" style={{ background: long ? BUY : SELL }}>{long ? 'LONG' : 'SHORT'}</span>
          <div className="text-right">
            <div className="text-[19px] font-bold tabular-nums leading-none" style={{ fontFamily: T.mono, color: pos.r >= 0 ? T.ok : T.bad }}>{fmtR(pos.r)}</div>
            <div className="mt-0.5 text-[11.5px] tabular-nums" style={{ fontFamily: T.mono, color: pos.r >= 0 ? T.ok : T.bad }}>{fmtUsd(usd)}</div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Row label={tx('Вхід', 'Entry')} hint={pos.kind && pos.kind !== 'market' ? (pos.kind === 'limit' ? 'Limit' : 'Stop') : tx('по ринку', 'market')}>
            <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>{fmtNum(pos.entry, d)}</span>
          </Row>
          <Row label="Stop loss" color={SELL} hint={dist(Math.abs(pos.entry - pos.sl), d)}>
            <NumField value={pos.sl} digits={d} onCommit={(v) => e?.moveLevel('sl', v)} />
          </Row>
          <Row label="Take profit" color="#089981" hint={`${dist(Math.abs(pos.tp - pos.entry), d)} · ${pos.rr.toFixed(2)}R`}>
            <NumField value={pos.tp} digits={d} onCommit={(v) => e?.moveLevel('tp', v)} />
          </Row>
        </div>
        {liveTags(pos)}
        {(pos.partials || []).length > 0 && (
          <p className="mt-2 text-[11.5px]" style={{ color: T.text3 }}>
            {tx('Відкрито', 'Open')} {Math.round((pos.size ?? 1) * 100)}% · {tx('зафіксовано', 'locked')} <span style={{ color: pos.realized >= 0 ? T.ok : T.bad, fontFamily: T.mono }}>{fmtR(pos.realized)}</span>
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => e?.partialClose(0.5)} title={tx('Закрити половину позиції за поточною ціною', 'Close half at the current price')} className="rounded-lg py-2 text-[12.5px] font-semibold" style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}>{tx('Закрити 50%', 'Close 50%')}</button>
          <button
            type="button"
            onClick={() => e?.toggleTrail()}
            title={tx('Стоп іде за ціною на тій самій відстані, що зараз', 'Stop follows price at the current distance')}
            aria-pressed={!!pos.trail}
            className="rounded-lg py-2 text-[12.5px] font-semibold"
            style={{ background: pos.trail ? act(0.22) : T.surface, border: `1px solid ${pos.trail ? 'rgba(41,98,255,0.6)' : T.line}`, color: pos.trail ? '#fff' : T.text }}
          >
            {tx('Трейлінг', 'Trailing')}{pos.trail ? ' ✓' : ''}
          </button>
          <button type="button" onClick={() => e?.moveToBE()} className="rounded-lg py-2 text-[12.5px] font-semibold" style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}>{tx('Беззбиток', 'Breakeven')}</button>
          <button type="button" onClick={() => e?.closePosition('manual')} className="rounded-lg py-2 text-[12.5px] font-semibold text-white" style={{ background: long ? SELL : BUY }}>{tx('Закрити', 'Close')} {fmtNum(st.price, d)}</button>
        </div>
      </div>
    );
  } else if (order) {
    const long = order.side === 'LONG';
    ticket = (
      <div className="rounded-xl p-3" style={{ background: T.sunken, border: `1px dashed ${long ? 'rgba(41,98,255,0.6)' : 'rgba(242,54,69,0.6)'}` }}>
        <div className="flex items-center justify-between">
          <span className="rounded-md px-2 py-0.5 text-[12px] font-bold text-white" style={{ background: long ? BUY : SELL }}>{long ? 'BUY' : 'SELL'} {order.kind === 'limit' ? 'LIMIT' : 'STOP'}</span>
          <span className="text-[11.5px]" style={{ color: T.text3 }}>{tx('чекає на ціну', 'waiting')} · {dist(Math.abs(order.entry - st.price), d)}</span>
        </div>
        <div className="mt-3 space-y-2">
          <Row label={tx('Ціна ордера', 'Order price')}><NumField value={order.entry} digits={d} onCommit={(v) => e?.moveLevel('entry', v)} /></Row>
          <Row label="Stop loss" color={SELL} hint={dist(Math.abs(order.entry - order.sl), d)}><NumField value={order.sl} digits={d} onCommit={(v) => e?.moveLevel('sl', v)} /></Row>
          <Row label="Take profit" color="#089981" hint={`${order.rr.toFixed(2)}R`}><NumField value={order.tp} digits={d} onCommit={(v) => e?.moveLevel('tp', v)} /></Row>
        </div>
        {liveTags(order)}
        <button type="button" onClick={() => e?.cancelOrder()} className="mt-3 w-full rounded-lg py-2 text-[12.5px] font-semibold" style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}>{tx('Скасувати ордер', 'Cancel order')}</button>
      </div>
    );
  } else {
    const side = draft?.side;
    ticket = (
      <>
        <div className="grid grid-cols-2 gap-2">
          {[['SHORT', 'Sell', SELL], ['LONG', 'Buy', BUY]].map(([id, label, col]) => {
            const on = side === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className="rounded-xl py-2.5 text-white transition-transform active:scale-[0.98]"
                style={{ background: col, opacity: side && !on ? 0.4 : 1, boxShadow: on ? `0 0 0 2px ${T.surface}, 0 0 0 4px ${col}` : 'none' }}
              >
                <span className="block text-[14px] font-bold">{label}</span>
                <span className="block text-[11.5px] tabular-nums opacity-90" style={{ fontFamily: T.mono }}>{fmtNum(st.price, d)}</span>
              </button>
            );
          })}
        </div>

        {!st.replay && resume && (
          <button type="button" onClick={onResume} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white" style={{ background: act(0.32) }}>
            <Play size={15} /> {tx('Продовжити з', 'Resume at')} {fmtStamp(resume.t, prefs)}
          </button>
        )}
        {!st.replay && (
          <button type="button" onClick={onStartReplay} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold" style={{ background: act(0.16), color: ACT.tint }}>
            <Scissors size={15} /> {tx('Обрати точку старту реплею', 'Pick replay start')}
          </button>
        )}

        {draft && st.replay && (
          <div className="mt-3 space-y-2.5 rounded-xl p-3" style={{ background: T.sunken, border: `1px solid ${side === 'LONG' ? 'rgba(41,98,255,0.45)' : 'rgba(242,54,69,0.45)'}` }}>
            <Seg
              value={draft.type}
              onChange={(v) => e?.setDraft(v === 'market' ? { type: 'market' } : { type: 'pending', entry: draft.entry })}
              options={[['market', tx('По ринку', 'Market')], ['pending', tx('Відкладений', 'Pending')]]}
            />
            {draft.type === 'pending' && (
              <Row label={tx('Ціна входу', 'Entry price')} hint={`${(e?.orderKind(draft.side, draft.entry) === 'limit' ? 'Limit' : 'Stop')} · ${dist(Math.abs(draft.entry - st.price), d)}`}>
                <NumField value={draft.entry} digits={d} onCommit={(v) => e?.moveLevel('entry', v)} />
              </Row>
            )}
            <Row label="Stop loss" color={SELL} hint={`${dist(Math.abs(draft.entry - draft.sl), d)} · −$${riskUsd.toFixed(0)}`}>
              <NumField value={draft.sl} digits={d} onCommit={(v) => e?.moveLevel('sl', v)} />
            </Row>
            <Row label="Take profit" color="#089981" hint={`${dist(Math.abs(draft.tp - draft.entry), d)} · +$${(riskUsd * draft.rr).toFixed(0)}`}>
              <NumField value={draft.tp} digits={d} onCommit={(v) => e?.moveLevel('tp', v)} />
            </Row>
            <Row label="R:R">
              <NumField
                value={draft.rr}
                digits={2}
                width="w-[80px]"
                onCommit={(v) => { const L = e?.draftLevels(); if (L) e.setDraft({ tpD: Math.abs(L.entry - L.sl) * v }); }}
              />
            </Row>
            <Row label={tx('Ризик', 'Risk')} hint={`$${riskUsd.toFixed(0)} ${tx('з', 'of')} $${balance.toLocaleString('en-US')}`}>
              <NumField value={riskPct} digits={2} width="w-[80px]" suffix="%" onCommit={(v) => setPrefs({ ...prefs, riskPct: Math.min(100, v) })} />
            </Row>
            <TradeTags note={note} meta={meta} onNote={setNote} onMeta={(patch) => setMeta((m) => ({ ...m, ...patch }))} usedSetups={usedSetups} />
            <button
              type="button"
              onClick={() => e?.confirmDraft({ note: note.trim(), meta })}
              className="w-full rounded-xl py-2.5 text-[13.5px] font-bold text-white transition-transform active:scale-[0.98]"
              style={{ background: side === 'LONG' ? BUY : SELL }}
            >
              {draft.type === 'market'
                ? `${side === 'LONG' ? tx('Купити', 'Buy') : tx('Продати', 'Sell')} ${tx('по ринку', 'market')} · ${fmtNum(st.price, d)}`
                : `${side === 'LONG' ? 'Buy' : 'Sell'} ${e?.orderKind(draft.side, draft.entry) === 'limit' ? 'Limit' : 'Stop'} · ${fmtNum(draft.entry, d)}`}
            </button>
            <button type="button" onClick={() => e?.setDraft(null)} className="w-full text-center text-[12px]" style={{ color: T.text3 }}>{tx('Скасувати', 'Cancel')} (Esc)</button>
          </div>
        )}

        {st.replay && !draft && (
          <p className="mt-3 flex gap-2 text-[12px] leading-relaxed" style={{ color: T.text3 }}>
            <MousePointerClick size={15} className="mt-0.5 shrink-0" />
            {prefs.oneClick
              ? tx('Вхід в один клік: Buy/Sell одразу відкриває угоду зі стопом за ATR.', 'One-click: Buy/Sell opens at once with an ATR stop.')
              : tx('Обери Buy чи Sell — на графіку зʼявиться угода, тягни вхід, стоп і тейк. Або намалюй «Довгу/Коротку позицію». Shift+B / Shift+S.', 'Pick Buy or Sell — drag entry, stop and target on the chart. Or draw a Long/Short position. Shift+B / Shift+S.')}
          </p>
        )}
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: T.text3 }}>
          <input type="checkbox" checked={!!prefs.oneClick} onChange={(ev) => setPrefs({ ...prefs, oneClick: ev.target.checked })} className="accent-[#2962ff]" />
          {tx('Вхід в один клік', 'One-click trading')}
        </label>
      </>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: T.text3 }}>{symbolName}</span>
          <span className="ml-auto text-[20px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>{fmtNum(st.price, d)}</span>
          <button
            type="button"
            onClick={onHide}
            title={tx('Сховати панель (угоди можна відкривати інструментом «Довга/Коротка позиція»)', 'Hide panel (trade with the Long/Short position tool)')}
            aria-label={tx('Сховати панель', 'Hide panel')}
            className="grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-white/5"
            style={{ color: T.text3 }}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
        {ticket}
        {saveBox}
      </div>

      <div className="px-4 pb-4 pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            [tx('Угод', 'Trades'), stats.n, T.text],
            ['Win rate', stats.wr == null ? '—' : `${stats.wr.toFixed(0)}%`, T.warn],
            [tx('Разом', 'Net'), stats.n ? fmtR(stats.net) : '—', stats.net >= 0 ? T.ok : T.bad],
            [tx('У $', 'In $'), stats.n ? fmtUsd(stats.net * riskUsd) : '—', stats.net >= 0 ? T.ok : T.bad],
            ['PF', stats.pf == null ? '—' : stats.pf === Infinity ? '∞' : stats.pf.toFixed(2), T.text],
            [tx('Просідання', 'Max DD'), stats.n ? `${stats.dd.toFixed(1)}R` : '—', stats.dd > 0 ? T.bad : T.text],
            [tx('Сер. угода', 'Avg trade'), stats.avg == null ? '—' : fmtR(stats.avg), stats.avg >= 0 ? T.ok : T.bad],
            [tx('Сер. виграш', 'Avg win'), stats.avgW == null ? '—' : fmtR(stats.avgW), T.ok],
            [tx('Сер. збиток', 'Avg loss'), stats.avgL == null ? '—' : fmtR(-stats.avgL), T.bad],
            [tx('Серія +', 'Win streak'), stats.n ? stats.bw : '—', T.ok],
            [tx('Серія −', 'Loss streak'), stats.n ? stats.bl : '—', T.bad],
            [tx('Ризик', 'Risk'), `${riskPct}%`, T.text],
          ].map(([label, v, c]) => (
            <div key={label} className="rounded-lg px-2 py-1.5" style={{ background: T.sunken }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.text3 }}>{label}</div>
              <div className="mt-0.5 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {stats.n > 1 && <EquityCurve curve={stats.curve} riskUsd={riskUsd} />}

        <div className="mt-3 space-y-1">
          {[...closed].reverse().map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => onFocusTrade?.(t)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') onFocusTrade?.(t); }}
              className="group/tr cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] transition-colors hover:brightness-125"
              style={{ background: T.sunken, outline: st.selClosed === t.id ? '1px solid rgba(41,98,255,0.7)' : 'none' }}
              title={t.note || tx('Показати на графіку', 'Show on chart')}
            >
              <div className="flex items-center gap-2">
                <span className="w-9 font-bold" style={{ color: t.side === 'LONG' ? '#5b8cff' : SELL }}>{t.side === 'LONG' ? 'Buy' : 'Sell'}</span>
                <span className="min-w-0 flex-1 truncate tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>{fmtStamp(t.entryT, prefs)}</span>
                <span className="text-[10.5px] font-semibold uppercase" style={{ color: T.text3 }}>{t.reason === 'tp' ? 'TP' : t.reason === 'sl' ? 'SL' : tx('руч.', 'man.')}</span>
                <span className="w-[62px] text-right font-bold tabular-nums" style={{ fontFamily: T.mono, color: t.result === 'BE' ? T.text2 : t.r > 0 ? T.ok : T.bad }}>
                  {t.result === 'BE' ? 'BE' : fmtR(t.r)}
                </span>
                <button
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); setEditId(editId === t.id ? null : t.id); }}
                  title={tx('Нотатка й теги', 'Note & tags')}
                  aria-label={tx('Нотатка й теги', 'Note & tags')}
                  className="grid h-5 w-5 place-items-center rounded transition-colors hover:text-white"
                  style={{ color: editId === t.id ? '#5b8cff' : T.text3 }}
                >
                  <Pencil size={12} />
                </button>
                {t.saved && <Check size={13} className="group-hover/tr:hidden" style={{ color: T.ok }} aria-label={tx('Записано', 'Saved')} />}
                <button
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); onDeleteTrade(t); }}
                  title={t.saved ? tx('Видалити угоду з графіка й бектесту', 'Delete from chart and backtest') : tx('Прибрати угоду з графіка', 'Remove from chart')}
                  aria-label={tx('Видалити угоду', 'Delete trade')}
                  className={`${t.saved ? 'hidden group-hover/tr:grid' : 'grid opacity-40 group-hover/tr:opacity-100'} h-5 w-5 place-items-center rounded transition-colors hover:text-[#f23645]`}
                  style={{ color: T.text3 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {t.note && editId !== t.id && <div className="mt-0.5 truncate text-[11px]" style={{ color: T.text3 }}>{t.note}</div>}
              {editId !== t.id && (t.meta?.setups?.length || t.meta?.mistakes?.length) ? (
                <div className="mt-0.5 truncate text-[10.5px]" style={{ color: T.text3 }}>{[...(t.meta.setups || []), ...(t.meta.mistakes || []).map(mistakeLabel)].join(' · ')}</div>
              ) : null}
              {editId === t.id && (
                <div className="mt-2" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()} role="presentation">
                  <TradeTags
                    note={t.note || ''}
                    meta={t.meta || {}}
                    onNote={(v) => onEditTrade?.(t, { note: v })}
                    onMeta={(patch) => onEditTrade?.(t, { meta: { ...(t.meta || {}), ...patch } })}
                    usedSetups={usedSetups}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
