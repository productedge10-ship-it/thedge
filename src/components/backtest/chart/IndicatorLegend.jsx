import { useEffect, useReducer, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Settings2, Trash2 } from 'lucide-react';
import { t as tx } from '../../../lib/lang';
import { INDICATORS, indName, indBrief, inputsOf } from '../../../lib/candles/indicators';

/* ==================================================================
   Легенда індикаторів зліва вгорі — як у TradingView.
   Рядок: назва, параметри, значення ліній на свічці під курсором.
   При наведенні — сховати, налаштування, прибрати. Подвійний клік —
   налаштування. Індикатори в окремих панелях (RSI, MACD…) підписані
   у верхньому лівому куті своєї панелі.
================================================================== */

/* Коротші назви для легенди — повні є в списку індикаторів. */
const SHORT = { ma: 'MA', bb: 'BB', volume: 'Vol', sessions: () => tx('Сесії', 'Sessions'), killzones: () => tx('Кілзони', 'Killzones'), separators: () => tx('Роздільники', 'Separators') };
const shortName = (id) => { const v = SHORT[id]; return typeof v === 'function' ? v() : v || indName(id); };

const fmtVal = (v, digits, precision, hist) => {
  if (hist) {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
    return String(Math.round(v));
  }
  return v.toFixed(precision ?? digits);
};

function Btn({ title, onClick, children, danger }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`grid h-[22px] w-[22px] place-items-center rounded transition-colors ${danger ? 'hover:text-[#f23645]' : ''}`}
      style={{ background: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(128,128,128,0.22)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function Row({ cfg, im, k, digits, prefs, onToggle, onSettings, onRemove, tfId }) {
  const [hover, setHover] = useState(false);
  const inp = inputsOf(cfg);
  const offTf = inp[`vis_${tfId}`] === false;
  const dim = cfg.hidden || offTf;
  const brief = indBrief(cfg.id, inp);
  const vals = !dim && im ? im.valuesAt(cfg.id, k) : [];
  const bg = prefs.bg || '#0b0b0d';
  return (
    <div
      className="pointer-events-auto flex h-[24px] max-w-full cursor-default select-none items-center gap-2 whitespace-nowrap rounded px-1.5"
      style={{
        border: `1px solid ${hover ? 'rgba(128,128,128,0.35)' : 'transparent'}`,
        background: hover ? bg : 'transparent',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={() => onSettings(cfg.id)}
    >
      <span title={indName(cfg.id)} style={{ opacity: dim ? 0.45 : 1 }}>{shortName(cfg.id)}</span>
      {brief && <span style={{ opacity: dim ? 0.35 : 0.6 }}>{brief}</span>}
      {offTf && <span style={{ opacity: 0.45 }}>· {tx('не на цьому ТФ', 'hidden on this TF')}</span>}
      {vals.map((v, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="tabular-nums" style={{ color: v.color }}>{fmtVal(v.value, digits, v.precision, v.hist)}</span>
      ))}
      {hover && (
        <span className="ml-0.5 flex items-center gap-0.5">
          <Btn title={cfg.hidden ? tx('Показати', 'Show') : tx('Сховати', 'Hide')} onClick={() => onToggle(cfg.id)}>{cfg.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</Btn>
          <Btn title={tx('Налаштування', 'Settings')} onClick={() => onSettings(cfg.id)}><Settings2 size={15} /></Btn>
          <Btn title={tx('Прибрати', 'Remove')} danger onClick={() => onRemove(cfg.id)}><Trash2 size={15} /></Btn>
        </span>
      )}
    </div>
  );
}

export default function IndicatorLegend({ config, im, k, digits, prefs, top, tfId, onChange, onSettings }) {
  const [, tick] = useReducer((x) => x + 1, 0);
  const [open, setOpen] = useState(true);
  const [tops, setTops] = useState({});

  /* Перерахунок індикаторів → нові значення; панелі могли зсунутись. */
  useEffect(() => {
    if (!im) return undefined;
    const upd = () => {
      tick();
      const t = im.paneTops();
      setTops((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t));
    };
    const off = im.subscribe(upd);
    /* Межу між панелями можна тягнути — підглядаємо зрідка. */
    const iv = setInterval(() => {
      const t = im.paneTops();
      setTops((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t));
    }, 400);
    upd();
    return () => { off(); clearInterval(iv); };
  }, [im]);

  const list = (config || []).filter((c) => INDICATORS[c.id] && c.on !== false);
  if (!list.length) return null;
  const main = list.filter((c) => !INDICATORS[c.id].pane);
  const panes = list.filter((c) => INDICATORS[c.id].pane);

  const toggle = (id) => onChange(config.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)));
  const remove = (id) => onChange(config.filter((c) => c.id !== id));
  const common = { im, k, digits, prefs, tfId, onToggle: toggle, onSettings, onRemove: remove };
  const style = { color: prefs.text, fontSize: prefs.fontSize + 1, fontFamily: "-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif" };

  return (
    <>
      {main.length > 0 && (
        <div className="pointer-events-none absolute left-2 z-[5] flex max-w-[calc(100%-120px)] flex-col items-start gap-px" style={{ top, ...style }}>
          {open && main.map((c) => <Row key={c.id} cfg={c} {...common} />)}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={open ? tx('Згорнути індикатори', 'Collapse indicators') : tx('Показати індикатори', 'Show indicators')}
            className="pointer-events-auto ml-1 mt-0.5 flex h-[20px] items-center gap-1 rounded px-1 opacity-60 transition-opacity hover:opacity-100"
            style={{ border: '1px solid rgba(128,128,128,0.3)' }}
          >
            {open ? <ChevronUp size={14} /> : <><ChevronDown size={14} /><span className="text-[11px] tabular-nums">{main.length}</span></>}
          </button>
        </div>
      )}
      {panes.map((c) => (tops[c.id] != null ? (
        <div key={c.id} className="pointer-events-none absolute left-2 z-[5]" style={{ top: tops[c.id] + 4, ...style }}>
          <Row cfg={c} {...common} />
        </div>
      ) : null))}
    </>
  );
}
