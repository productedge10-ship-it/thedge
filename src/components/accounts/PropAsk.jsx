import { useState } from 'react';
import { ArrowUp, MessageCircleQuestion } from 'lucide-react';
import { T } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

/* «Спитай про правила» — відповідь лише з правил цього пропа (api/prop-ask.js). */
const EXAMPLES = ['Чи можна тримати угоду на вихідних?', 'Що буде, якщо порушу денний ліміт?', 'Коли перша виплата?'];

export default function PropAsk({ firmId, firm, data }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]); // [{q, a, err}]

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (question.length < 3 || busy) return;
    setBusy(true); setQ('');
    const { data: s } = await supabase.auth.getSession();
    let a = null; let err = null;
    try {
      const r = await fetch('/api/prop-ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s?.session?.access_token || ''}` },
        body: JSON.stringify({ firm: firmId, name: firm, question, rules: { structured: data?.structured, rulebook: data?.rulebook } }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) a = j.answer; else err = j.error || `Помилка ${r.status}`;
    } catch (e) { err = 'Немає звʼязку з сервером'; }
    setItems((xs) => [{ q: question, a, err }, ...xs].slice(0, 6));
    setBusy(false);
  };

  return (
    <section className="p-5 sm:p-6" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 20 }}>
      <div className="flex items-center gap-2 text-[15px] font-bold" style={{ color: T.text, fontFamily: T.display }}>
        <MessageCircleQuestion size={17} style={{ color: T.acc }} />Спитай про правила {firm}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="mt-3 flex items-center gap-2 rounded-xl pl-3.5 pr-1.5" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Наприклад: чи можна торгувати на новинах на 2-Step?"
          className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none" style={{ color: T.text, fontFamily: T.sans }} />
        <button type="submit" disabled={busy || q.trim().length < 3} aria-label="Спитати" className="grid h-8 w-8 place-items-center rounded-lg transition-opacity disabled:opacity-40"
          style={{ background: T.acc, color: '#fff' }}><ArrowUp size={16} /></button>
      </form>
      {!items.length && !busy && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => ask(x)} className="rounded-lg px-2.5 py-1 text-[12.5px]" style={{ color: T.text3, border: '1px solid var(--edge-line)', fontFamily: T.sans }}>{x}</button>
          ))}
        </div>
      )}
      {busy && <div className="mt-3 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>Шукаю в правилах…</div>}
      <div className="mt-3 grid gap-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl p-3.5" style={{ background: 'var(--edge-sunken)' }}>
            <div className="text-[12.5px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>{it.q}</div>
            <div className="mt-1 whitespace-pre-line text-[14px] leading-[1.6]" style={{ color: it.err ? T.bad : T.text, fontFamily: T.sans }}>{it.a || it.err}</div>
          </div>
        ))}
      </div>
      <p className="m-0 mt-2 text-[11.5px]" style={{ color: T.text3, fontFamily: T.sans }}>Відповідь з правил, які ми зібрали з сайту пропа. Для важливих рішень звір з першоджерелом.</p>
    </section>
  );
}
