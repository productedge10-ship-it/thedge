import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Loader2, FileText, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { parseTradesFile, guessRisk, toRows } from '../../lib/tradeImport';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/analytics';
import { notify } from '../../utils/notify';

/* ==================================================================
   Імпорт історії з файлу: звіт MT5/MT4 (HTML) або CSV.

   Три кроки на одному екрані: файл → що знайшли (кількість, період,
   сума) → рахунок і ризик → «Імпортувати». Ризик потрібен лише для
   угод без стопа у файлі: R = прибуток / ризик. Повторний імпорт того
   ж файлу дублів не створює (source='import' + external_id).

   Відкрити звідусіль: window.dispatchEvent(new Event(IMPORT_EVENT)).
================================================================== */

export const IMPORT_EVENT = 'edge:import-trades';
const CHUNK = 200;

export default function ImportTradesModal({ onDone }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [account, setAccount] = useState('');
  const [risk, setRisk] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    const on = () => { setOpen(true); setFile(null); setParsed(null); setErr(''); setDone(null); };
    window.addEventListener(IMPORT_EVENT, on);
    return () => window.removeEventListener(IMPORT_EVENT, on);
  }, []);

  useEffect(() => {
    if (!open || !user?.id) return;
    supabase.from('prop_accounts').select('firm_name,status').eq('user_id', user.id).order('created_at', { ascending: true })
      .then(({ data }) => {
        const list = (data || []).filter((a) => a.status !== 'Closed').map((a) => a.firm_name).filter(Boolean);
        setAccounts(list);
        setAccount((cur) => cur || list[0] || '');
      }, () => {});
  }, [open, user?.id]);

  const pick = async (f) => {
    if (!f) return;
    setErr(''); setParsed(null); setFile(f);
    if (f.size > 15 * 1024 * 1024) { setErr(tx('Файл завеликий (макс. 15 МБ)', 'File too large (max 15 MB)')); return; }
    if (/\.xlsx?$/i.test(f.name)) {
      setErr(tx('Excel відкрий і збережи як CSV (Файл → Зберегти як → CSV), або в MT5 збережи звіт як HTML.', 'Open the Excel file and save it as CSV (File → Save as → CSV), or save the MT5 report as HTML.'));
      return;
    }
    try {
      const buf = await f.arrayBuffer();
      const r = parseTradesFile(f.name, buf);
      if (!r.trades.length) {
        setErr(tx('Не знайшли угод. Потрібні колонки на кшталт Symbol, Type, Time, Profit. У MT5: Історія → правий клік → Звіт → HTML.', 'No trades found. Columns like Symbol, Type, Time, Profit are needed. In MT5: History → right-click → Report → HTML.'));
        return;
      }
      const dates = r.trades.map((t) => t.date).sort();
      const sum = r.trades.reduce((s, t) => s + (t.profit || 0), 0);
      const noStop = r.trades.filter((t) => t.rr == null && !(t.entry && t.sl)).length;
      setParsed({ ...r, from: dates[0], to: dates[dates.length - 1], sum, noStop });
      const g = guessRisk(r.trades);
      setRisk(g ? String(g) : '');
    } catch (e) {
      setErr(e.message || tx('Не вдалось прочитати файл', 'Could not read the file'));
    }
  };

  const run = async () => {
    if (!parsed || !user?.id) return;
    setBusy(true); setErr('');
    const riskUsd = Number(String(risk).replace(',', '.')) || 0;
    const rows = toRows(parsed.trades, { account: account.trim(), riskUsd }).map((r) => ({ ...r, user_id: user.id }));
    let added = 0;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data, error } = await supabase.from('trades')
          .upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,source,external_id', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        added += data?.length || 0;
      }
      track('trades_imported', { kind: parsed.kind, n: rows.length, added });
      setDone({ added, skipped: rows.length - added });
      notify.success(tx('Імпорт готовий', 'Import done'), tx(`Додано угод: ${added}`, `Trades added: ${added}`));
      onDone?.();
    } catch (e) {
      setErr(e.message || tx('Не вдалось імпортувати', 'Import failed'));
    } finally {
      setBusy(false);
    }
  };

  const money = (v) => `${v < 0 ? '−' : '+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  const field = { fontFamily: T.sans, color: T.text, background: T.sunken, border: `1px solid ${T.line}` };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="imp"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[510] flex items-center justify-center px-4"
          style={{ background: 'rgba(6,6,10,0.72)', backdropFilter: 'blur(6px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}
        >
          <motion.div
            role="dialog"
            aria-label={tx('Імпорт угод', 'Import trades')}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="relative w-full max-w-[520px] rounded-3xl p-6"
            style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 50px 110px -35px rgba(0,0,0,0.95)' }}
          >
            <button type="button" aria-label={tx('Закрити', 'Close')} onClick={() => !busy && setOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg" style={{ color: T.text3 }}>
              <X size={16} />
            </button>
            <div className="text-[19px] font-bold" style={{ fontFamily: T.display || T.sans, color: T.text }}>{tx('Імпорт історії угод', 'Import trade history')}</div>
            <p className="m-0 mt-1.5 text-[13px] leading-[1.55]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {tx('Звіт MT5/MT4 (Історія → правий клік → Звіт → HTML) або CSV з cTrader, TradeLocker, Match-Trader чи своєї таблиці. Excel — збережи як CSV.', 'An MT5/MT4 report (History → right-click → Report → HTML) or a CSV from cTrader, TradeLocker, Match-Trader or your own sheet. Excel — save as CSV.')}
            </p>

            {done ? (
              <div className="mt-5 rounded-2xl p-4" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                <div className="flex items-center gap-2 text-[15px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
                  <Check size={18} style={{ color: T.ok }} />
                  {tx(`Додано угод: ${done.added}`, `Trades added: ${done.added}`)}
                </div>
                {done.skipped > 0 && (
                  <div className="mt-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {tx(`Уже були в журналі й пропущені: ${done.skipped}`, `Already in the journal, skipped: ${done.skipped}`)}
                  </div>
                )}
                <button type="button" onClick={() => setOpen(false)} className="edge-add-btn mt-4 h-11 w-full rounded-xl text-[14px] font-bold">{tx('До журналу', 'Back to journal')}</button>
              </div>
            ) : (
              <>
                <input ref={input} type="file" accept=".csv,.txt,.htm,.html,.xls,.xlsx" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
                  className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl px-4 py-6 text-center"
                  style={{ background: T.sunken, border: `1.5px dashed ${file ? T.acc : T.line}` }}
                >
                  {file ? <FileText size={22} style={{ color: T.acc }} /> : <Upload size={22} style={{ color: T.text3 }} />}
                  <span className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                    {file ? file.name : tx('Обери файл або перетягни сюди', 'Choose a file or drop it here')}
                  </span>
                </button>

                {parsed && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {[
                        [tx('Угод', 'Trades'), parsed.trades.length],
                        [tx('Період', 'Period'), `${parsed.from.slice(5)} – ${parsed.to.slice(5)}`],
                        [tx('Разом', 'Total'), money(parsed.sum)],
                      ].map(([l, v]) => (
                        <div key={l} className="rounded-xl p-2.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                          <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>{l}</div>
                          <div className="mt-1 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>{v}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>{tx('Рахунок', 'Account')}</span>
                        <input list="imp-accounts" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={tx('Напр. FTMO 100k', 'E.g. FTMO 100k')} className="h-10 w-full rounded-lg px-3 text-[13.5px] outline-none" style={field} />
                        <datalist id="imp-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>{tx('Ризик на угоду, $', 'Risk per trade, $')}</span>
                        <input value={risk} onChange={(e) => setRisk(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="100" className="h-10 w-full rounded-lg px-3 text-[13.5px] font-bold outline-none" style={{ ...field, fontFamily: T.mono }} />
                      </label>
                    </div>
                    <div className="mt-1.5 text-[11.5px] leading-[1.45]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {parsed.noStop
                        ? tx(`Для угод без стопа (${parsed.noStop}) R = прибуток / ризик. Підставили типовий збиток з файлу — виправ, якщо ризик був інший.`, `For ${parsed.noStop} trades without a stop, R = profit / risk. We used the typical loss from the file — adjust if your risk was different.`)
                        : tx('У всіх угод є стоп — R порахуємо з ціни.', 'All trades have a stop — R is calculated from price.')}
                    </div>
                  </>
                )}

                {err && <div className="mt-3 text-[12.5px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.bad }}>{err}</div>}

                <button
                  type="button"
                  onClick={run}
                  disabled={!parsed || busy}
                  className="edge-add-btn mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold"
                  style={{ opacity: !parsed || busy ? 0.5 : 1 }}
                >
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  {parsed ? tx(`Імпортувати (${parsed.trades.length})`, `Import (${parsed.trades.length})`) : tx('Імпортувати', 'Import')}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
