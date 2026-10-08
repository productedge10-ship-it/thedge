import { useMemo, useState } from 'react';
import { Plus, StickyNote } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { EMOTIONS, MISTAKES } from '../../../lib/backtestTags';
import { allSetups, customSetups, addCustomSetup } from '../../../lib/backtestSetups';

/* ==================================================================
   Нотатка й теги угоди — прямо в панелі графіка: сетап, емоції,
   помилки. Працює і для чернетки, і для відкритої угоди, і для вже
   закритої (тоді зміни одразу йдуть у бектест).
================================================================== */

const TONE = { ok: '#089981', warn: '#f5a623', bad: '#f23645' };

function Chip({ on, onClick, children, tone }) {
  const c = tone ? TONE[tone] : '#5b8cff';
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-2 py-[3px] text-[11.5px] font-semibold transition-colors"
      style={{
        color: on ? '#fff' : T.text2,
        background: on ? c : 'transparent',
        boxShadow: `inset 0 0 0 1px ${on ? c : T.line}`,
      }}
    >
      {children}
    </button>
  );
}

const toggle = (list, id) => ((list || []).includes(id) ? list.filter((x) => x !== id) : [...(list || []), id]);

export default function TradeTags({ note = '', meta = {}, onNote, onMeta, compact = false, usedSetups = [] }) {
  const [custom, setCustom] = useState(() => customSetups());
  const [adding, setAdding] = useState('');
  const setups = useMemo(() => allSetups({ custom, used: [...usedSetups, ...(meta.setups || [])] }), [custom, usedSetups, meta.setups]);
  const m = { setups: meta.setups || [], emotions: meta.emotions || [], mistakes: meta.mistakes || [] };

  const addSetup = () => {
    const v = adding.trim();
    if (!v) return;
    setCustom(addCustomSetup(v));
    onMeta({ setups: [...new Set([...m.setups, v])] });
    setAdding('');
  };

  const Head = ({ children }) => (
    <div className="mb-1 mt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text3 }}>{children}</div>
  );

  return (
    <div>
      <textarea
        value={note}
        onChange={(ev) => onNote(ev.target.value)}
        rows={compact ? 2 : 2}
        placeholder={tx('Нотатка: чому увійшов, що бачив…', 'Note: why you entered, what you saw…')}
        className="w-full resize-none rounded-lg px-2.5 py-2 text-[12.5px] outline-none"
        style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}
        onKeyDown={(ev) => ev.stopPropagation()}
      />
      <Head>{tx('Сетап', 'Setup')}</Head>
      <div className="flex flex-wrap gap-1">
        {setups.map((s) => <Chip key={s} on={m.setups.includes(s)} onClick={() => onMeta({ setups: toggle(m.setups, s) })}>{s}</Chip>)}
        <span className="flex items-center overflow-hidden rounded-md" style={{ boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          <input
            value={adding}
            onChange={(ev) => setAdding(ev.target.value)}
            onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === 'Enter') addSetup(); }}
            placeholder={tx('свій…', 'custom…')}
            className="w-[64px] bg-transparent px-1.5 py-[3px] text-[11.5px] outline-none"
            style={{ color: T.text }}
          />
          <button type="button" onClick={addSetup} aria-label={tx('Додати сетап', 'Add setup')} className="grid h-[22px] w-[22px] place-items-center" style={{ color: T.text3 }}><Plus size={12} /></button>
        </span>
      </div>
      <Head>{tx('Емоції', 'Emotions')}</Head>
      <div className="flex flex-wrap gap-1">
        {EMOTIONS.map((e) => <Chip key={e.id} tone={e.tone} on={m.emotions.includes(e.id)} onClick={() => onMeta({ emotions: toggle(m.emotions, e.id) })}>{tx(e.uk, e.en)}</Chip>)}
      </div>
      <Head>{tx('Помилки', 'Mistakes')}</Head>
      <div className="flex flex-wrap gap-1">
        {MISTAKES.map((e) => <Chip key={e.id} tone="bad" on={m.mistakes.includes(e.id)} onClick={() => onMeta({ mistakes: toggle(m.mistakes, e.id) })}>{tx(e.uk, e.en)}</Chip>)}
      </div>
    </div>
  );
}

export function TagsSummary({ meta, note }) {
  const n = (meta?.setups?.length || 0) + (meta?.emotions?.length || 0) + (meta?.mistakes?.length || 0);
  if (!n && !note) return null;
  return (
    <span className="flex items-center gap-1 text-[11px]" style={{ color: T.text3 }}>
      <StickyNote size={11} /> {n ? `${n}` : ''}{note ? ' ✎' : ''}
    </span>
  );
}
