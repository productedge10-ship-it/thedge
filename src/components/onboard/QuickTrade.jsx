import { useEffect, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { writeWithOptional } from '../../lib/tradeStats';
import { T } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/analytics';
import { notify } from '../../utils/notify';

/* ==================================================================
   Перша угода за 15 секунд.

   Повна форма просить актив, рахунок, ризик, сесію і розбір — для
   першої угоди це стіна. Тут лише те, без чого статистика не
   порахується: інструмент, напрям, результат і R. Розбір можна
   дописати потім, відкривши угоду в журналі (вона буде «нерозібраною»).
================================================================== */

const PAIRS = ['XAUUSD', 'EURUSD', 'NAS100', 'GBPUSD', 'US30', 'BTCUSD'];
const RESULTS = [
  ['Win', tx('Тейк', 'Win'), 'ok'],
  ['Lose', tx('Стоп', 'Loss'), 'bad'],
  ['BE', tx('Беззбиток', 'Breakeven'), 'text2'],
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function QuickTrade({ onSaved }) {
  const { user } = useAuth();
  const [pair, setPair] = useState('');
  const [dir, setDir] = useState('Long');
  const [result, setResult] = useState('');
  const [rr, setRr] = useState('');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  /* Рахунок — перший активний, якщо є. Немає — угода ляже з порожнім
     рахунком: це краще, ніж змушувати заводити рахунок заради однієї
     угоди. */
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('prop_accounts').select('firm_name,status').eq('user_id', user.id).order('created_at', { ascending: true })
      .then(({ data }) => {
        const a = (data || []).find((x) => x.status !== 'Closed');
        if (a?.firm_name) setAccount(a.firm_name);
      }, () => {});
  }, [user?.id]);

  const save = async () => {
    const p = pair.trim().toUpperCase().replace(/\s+/g, '');
    const r = parseFloat(String(rr).replace(',', '.'));
    if (!p) return setErr(tx('Вкажи інструмент', 'Pick an instrument'));
    if (!result) return setErr(tx('Обери результат', 'Pick a result'));
    if (result !== 'BE' && !(r > 0)) return setErr(tx('Скільки R? Наприклад, 2 для тейку чи 1 для стопу', 'How many R? E.g. 2 for a win or 1 for a loss'));
    setErr(''); setBusy(true);
    const payload = {
      plan_date: today(),
      plan_pair: p,
      account_name: account || null,
      risk: '1%',
      rr: result === 'BE' ? 0 : Math.abs(r),
      type: dir,
      result,
      session: null,
    };
    const { error } = await writeWithOptional((body) => supabase.from('trades').insert([body]).select('id').single(), payload);
    setBusy(false);
    if (error) { setErr(error.message || tx('Не вдалось зберегти', 'Could not save')); return; }
    track('quick_trade_saved', { result });
    notify.success(tx('Перша угода в журналі', 'First trade logged'), tx('Розбір можна дописати, відкривши угоду.', 'Open the trade later to add a review.'));
    onSaved?.();
  };

  const chip = (on, label, onClick, tone) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className="h-9 rounded-lg px-3 text-[13px] font-semibold transition-colors"
      style={{
        fontFamily: T.sans,
        color: on ? (tone ? T[tone] : T.text) : T.text2,
        background: on ? `rgba(${T.accRgb},0.16)` : T.sunken,
        border: `1px solid ${on ? T.acc : T.line}`,
      }}
    >
      {label}
    </button>
  );

  const label = (s) => (
    <div className="mb-1.5 text-left text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>{s}</div>
  );

  return (
    <div className="mt-3 w-full max-w-[460px] rounded-2xl p-4 text-left" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="mb-3 flex items-center gap-2 text-[14px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
        <Zap size={15} style={{ color: T.acc }} />
        {tx('Швидка угода', 'Quick trade')}
        <span className="ml-auto text-[11.5px] font-medium" style={{ color: T.text3 }}>{tx('15 секунд', '15 seconds')}</span>
      </div>

      {label(tx('Інструмент', 'Instrument'))}
      <input
        value={pair}
        onChange={(e) => setPair(e.target.value)}
        placeholder="XAUUSD"
        maxLength={20}
        className="h-10 w-full rounded-lg px-3 text-[14px] font-bold uppercase outline-none"
        style={{ fontFamily: T.mono, color: T.text, background: T.sunken, border: `1px solid ${T.line}` }}
      />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {PAIRS.map((x) => (
          <button key={x} type="button" onClick={() => setPair(x)} className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ fontFamily: T.mono, color: pair.toUpperCase() === x ? T.acc : T.text3, border: `1px solid ${T.line}` }}>{x}</button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          {label(tx('Напрям', 'Direction'))}
          <div className="flex gap-1.5">
            {chip(dir === 'Long', 'Long', () => setDir('Long'), 'ok')}
            {chip(dir === 'Short', 'Short', () => setDir('Short'), 'bad')}
          </div>
        </div>
        <div>
          {label('R')}
          <input
            value={rr}
            onChange={(e) => setRr(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder={result === 'Lose' ? '1' : '2'}
            inputMode="decimal"
            disabled={result === 'BE'}
            className="h-9 w-full rounded-lg px-3 text-[14px] font-bold outline-none"
            style={{ fontFamily: T.mono, color: T.text, background: T.sunken, border: `1px solid ${T.line}`, opacity: result === 'BE' ? 0.4 : 1 }}
          />
        </div>
      </div>

      <div className="mt-3">
        {label(tx('Результат', 'Result'))}
        <div className="flex flex-wrap gap-1.5">
          {RESULTS.map(([id, l, tone]) => chip(result === id, l, () => setResult(id), tone))}
        </div>
      </div>

      {err && <div className="mt-2.5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.bad }}>{err}</div>}

      <button type="button" onClick={save} disabled={busy} className="edge-add-btn mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold">
        {busy && <Loader2 size={15} className="animate-spin" />}
        {tx('Зберегти угоду', 'Save trade')}
      </button>
      <div className="mt-2 text-center text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
        {account ? tx(`Рахунок: ${account} · дата: сьогодні`, `Account: ${account} · date: today`) : tx('Дата: сьогодні. Деталі й розбір — потім, у самій угоді.', 'Date: today. Details and review later, in the trade itself.')}
      </div>
    </div>
  );
}
