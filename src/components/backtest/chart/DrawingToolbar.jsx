import { useEffect, useRef, useState } from 'react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { GROUPS, TOOLS, itemName } from '../../../lib/candles/drawings';
import DrawIcon from './DrawingIcons';

/* ==================================================================
   Ліва панель інструментів — як у TradingView.

   Кожна група — одна кнопка з іконкою останнього вибраного в ній
   інструмента. Клік по кнопці бере його, стрілочка праворуч відкриває
   весь список групи. Нижче — лінійка, зум, магніт, режим малювання,
   замок, «сховати» і «видалити».
================================================================== */

const GROUP_NAMES = {
  cursor: ['Курсори', 'Cursors'],
  lines: ['Лінії', 'Trend line tools'],
  fib: ['Фібоначчі', 'Fibonacci tools'],
  forecast: ['Прогнози й виміри', 'Forecasting and measurement tools'],
  shapes: ['Фігури', 'Geometric shapes'],
  annot: ['Підписи', 'Annotation tools'],
};

function Flyout({ open, onClose, children, anchor }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    /* Перехоплення, а не спливання — інакше клік по плаваючій панелі
       чи модалці (вони гасять mousedown) не закривав би меню. */
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); };
  }, [open, onClose, anchor]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className="absolute left-[calc(100%+6px)] top-0 z-50 min-w-[250px] rounded-xl p-1.5"
      style={{ background: T.surface3, border: `1px solid ${T.lineHi}`, boxShadow: '0 16px 40px rgba(0,0,0,0.45)', animation: 'edgeFly .14s ease-out' }}
    >
      {children}
    </div>
  );
}

export const Star = ({ on, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={on ? '#f5b301' : 'none'} stroke={on ? '#f5b301' : 'currentColor'} strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

function FlyItem({ id, active, onClick, hot, label, fav, onFav }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/fly flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[13.5px] transition-colors"
      style={{ background: active ? 'rgba(41,98,255,0.18)' : 'transparent', color: active ? '#fff' : T.text }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ color: active ? '#5b8cff' : T.text2 }}><DrawIcon id={id} size={24} /></span>
      <span className="flex-1">{label || itemName(id)}</span>
      {hot && <span className="text-[11px]" style={{ color: T.text4, fontFamily: T.mono }}>{hot}</span>}
      {onFav && (
        /* Зірочка — додати в панель обраних, як у TV. */
        <span
          role="button"
          tabIndex={0}
          title={fav ? tx('Прибрати з обраних', 'Remove from favorites') : tx('Додати в обрані', 'Add to favorites')}
          onClick={(e) => { e.stopPropagation(); onFav(id); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onFav(id); } }}
          className={`grid h-6 w-6 place-items-center rounded transition-opacity ${fav ? 'opacity-100' : 'opacity-30 group-hover/fly:opacity-70 hover:!opacity-100'}`}
          style={{ color: T.text3 }}
        >
          <Star on={fav} />
        </span>
      )}
    </button>
  );
}

function Btn({ id, title, active, onClick, children, danger }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2962ff]"
      style={{ color: active ? '#5b8cff' : T.text2, background: active ? 'rgba(41,98,255,0.16)' : 'transparent' }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = danger ? '#f23645' : T.text; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; } }}
    >
      {children || <DrawIcon id={id} size={26} />}
    </button>
  );
}

function Group({ g, current, active, onPick, onUse, open, setOpen, favs, onFav }) {
  const anchor = useRef(null);
  const name = tx(...GROUP_NAMES[g.id]);
  return (
    <div ref={anchor} className="group/btn relative">
      <Btn id={current} title={itemName(current)} active={active} onClick={() => onUse(current)} />
      <button
        type="button"
        aria-label={name}
        title={name}
        onClick={() => setOpen(open ? null : g.id)}
        className="absolute -right-1 top-0 grid h-9 w-3 place-items-center opacity-0 transition-opacity group-hover/btn:opacity-100 focus:opacity-100"
        style={{ color: T.text3, opacity: open ? 1 : undefined }}
      >
        <svg width="6" height="10" viewBox="0 0 6 10"><path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>
      </button>
      <Flyout open={open} onClose={() => setOpen(null)} anchor={anchor}>
        <div className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text3 }}>{name}</div>
        {g.items.map((id) => (
          <FlyItem key={id} id={id} hot={TOOLS[id]?.hot} active={id === current && active} onClick={() => { onPick(g.id, id); setOpen(null); }} fav={favs.includes(id)} onFav={onFav} />
        ))}
      </Flyout>
    </div>
  );
}

export default function DrawingToolbar({ st, act }) {
  const [open, setOpen] = useState(null);
  const magAnchor = useRef(null);
  const delAnchor = useRef(null);

  const groupOf = (id) => GROUPS.find((g) => g.items.includes(id))?.id;
  const activeGroup = st.tool ? groupOf(st.tool) : 'cursor';

  return (
    <div className="relative z-20 hidden w-[46px] shrink-0 flex-col items-center gap-0.5 overflow-visible py-2 md:flex" style={{ borderRight: `1px solid ${T.line}`, background: T.surface }}>
      <style>{'@keyframes edgeFly{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:none}}'}</style>
      {GROUPS.map((g) => {
        const current = g.id === 'cursor' ? (st.tool ? (st.groupSel.cursor || st.cursor) : st.cursor) : (st.groupSel[g.id] || g.items[0]);
        return (
          <Group
            key={g.id}
            g={g}
            current={current}
            active={g.id === 'cursor' ? !st.tool : activeGroup === g.id}
            open={open === g.id}
            setOpen={setOpen}
            favs={st.favs || []}
            onFav={act.fav}
            onUse={(id) => (g.id === 'cursor' ? act.cursor(id) : act.tool(st.tool === id ? null : id))}
            onPick={(gid, id) => { act.groupSel(gid, id); if (gid === 'cursor') act.cursor(id); else act.tool(id); }}
          />
        );
      })}

      <span className="my-1 h-px w-6" style={{ background: T.line }} />
      <Btn id="measure" title={`${itemName('measure')} (Shift + ${tx('клік', 'click')})`} active={st.tool === 'measure'} onClick={() => act.tool(st.tool === 'measure' ? null : 'measure')} />
      <Btn id="zoom" title={itemName('zoom')} active={st.tool === 'zoom'} onClick={() => act.tool(st.tool === 'zoom' ? null : 'zoom')} />
      <span className="my-1 h-px w-6" style={{ background: T.line }} />

      <div ref={magAnchor} className="group/btn relative">
        <Btn
          id="magnet"
          title={st.magnet === 'off' ? tx('Магніт: прилипати до OHLC', 'Magnet mode') : st.magnet === 'strong' ? tx('Сильний магніт', 'Strong magnet') : tx('Слабкий магніт', 'Weak magnet')}
          active={st.magnet !== 'off'}
          onClick={() => act.magnet(st.magnet === 'off' ? (st.lastMagnet || 'weak') : 'off')}
        />
        <button
          type="button"
          aria-label={tx('Режими магніту', 'Magnet options')}
          onClick={() => setOpen(open === 'magnet' ? null : 'magnet')}
          className="absolute -right-1 top-0 grid h-9 w-3 place-items-center opacity-0 transition-opacity group-hover/btn:opacity-100"
          style={{ color: T.text3 }}
        >
          <svg width="6" height="10" viewBox="0 0 6 10"><path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>
        </button>
        <Flyout open={open === 'magnet'} onClose={() => setOpen(null)} anchor={magAnchor}>
          <FlyItem id="magnet" label={tx('Слабкий магніт', 'Weak magnet')} active={st.magnet === 'weak'} onClick={() => { act.magnet('weak'); setOpen(null); }} />
          <FlyItem id="magnet" label={tx('Сильний магніт', 'Strong magnet')} active={st.magnet === 'strong'} onClick={() => { act.magnet('strong'); setOpen(null); }} />
        </Flyout>
      </div>
      <Btn id="keep" title={tx('Режим малювання: інструмент лишається після фігури', 'Keep drawing')} active={st.keep} onClick={act.keep} />
      <Btn id="favbar" title={tx('Панель обраних інструментів', 'Favorites toolbar')} active={st.favBar} onClick={act.favBar}>
        <Star on={st.favBar} size={20} />
      </Btn>
      <Btn id={st.lockAll ? 'lock' : 'unlock'} title={tx('Заблокувати всі малюнки', 'Lock all drawings')} active={st.lockAll} onClick={act.lock} />
      <Btn id={st.hideAll ? 'eyeoff' : 'eye'} title={tx('Сховати всі малюнки', 'Hide all drawings')} active={st.hideAll} onClick={act.hide} />
      <div ref={delAnchor} className="relative">
        <Btn id="trash" danger title={tx('Видалити малюнки', 'Remove drawings')} onClick={() => setOpen(open === 'del' ? null : 'del')} />
        <Flyout open={open === 'del'} onClose={() => setOpen(null)} anchor={delAnchor}>
          <FlyItem id="trash" label={tx(`Видалити всі малюнки (${st.count})`, `Remove all drawings (${st.count})`)} onClick={() => { act.removeAll(); setOpen(null); }} />
          <FlyItem id="undo" hot="Ctrl+Z" label={tx('Скасувати останню дію', 'Undo')} onClick={() => { act.undo(); setOpen(null); }} />
        </Flyout>
      </div>
    </div>
  );
}
