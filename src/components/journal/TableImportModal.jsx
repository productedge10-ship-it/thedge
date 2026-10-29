import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Loader2, FileText, Check, ArrowLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  readSources, mergeTables, suggestMapping, valueChoices, buildTrades, summarize,
  headerSig, hasMistakeText, TARGETS, SESSIONS,
} from '../../lib/tableImport';
import TableMapStep from './TableMapStep';
import { uploadImage } from '../../lib/imageStore';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/pulse';
import { notify } from '../../utils/notify';

/* ==================================================================
   Перенесення журналу з Notion / Google Sheets / Excel.

   Чотири кроки в одному вікні:
   1. файл — CSV або zip з експорту Notion (можна кілька: місяць =
      окрема база);
   2. колонки — що ми вгадали, з можливістю виправити;
   3. значення — лише те, що не вгадати: EUR → EURUSD? Frank →
      Frankfurt? (крок пропускається, якщо питати нічого);
   4. перевірка — підсумок, попередження, «Імпортувати».

   Мапа колонок запамʼятовується за набором назв: наступного місяця
   той самий експорт підхопиться без жодного кліку. Повторний імпорт
   дублів не створює (source='import' + external_id), а щойно
   доданий імпорт можна скасувати одною кнопкою.

   Відкрити звідусіль: openTableImport() або openTableImport(files).
================================================================== */

export const TABLE_IMPORT_EVENT = 'edge:import-table';
export const TRADES_IMPORTED_EVENT = 'edge:trades-imported';
export const openTableImport = (files) => window.dispatchEvent(new CustomEvent(TABLE_IMPORT_EVENT, { detail: { files: files || null } }));

const MAP_KEY = 'edge_tbl_maps_v1';
const CHUNK = 200;
const loadMaps = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch { return {}; } };
const saveMap = (sig, map) => { try { const all = loadMaps(); all[sig] = map; localStorage.setItem(MAP_KEY, JSON.stringify(all)); } catch { /* приватне вікно — не страшно */ } };

const fmtR = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2).replace(/\.?0+$/, '')}R`;

export default function TableImportModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('file');
  const [names, setNames] = useState([]);
  const [src, setSrc] = useState(null);
  const [map, setMap] = useState({});
  const [prof, setProf] = useState({});
  const [fromSaved, setFromSaved] = useState(false);
  const [values, setValues] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [myPairs, setMyPairs] = useState([]);
  const [account, setAccount] = useState('');
  const [markMistakes, setMarkMistakes] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const input = useRef(null);

  const reset = () => { setStep('file'); setNames([]); setSrc(null); setMap({}); setProf({}); setValues({}); setErr(''); setDone(null); setBusy(''); setFromSaved(false); };

  useEffect(() => {
    const on = (e) => {
      reset(); setOpen(true);
      const files = e.detail?.files;
      if (files?.length) setTimeout(() => pick(files), 0);
    };
    window.addEventListener(TABLE_IMPORT_EVENT, on);
    return () => window.removeEventListener(TABLE_IMPORT_EVENT, on);
  }, []);

  useEffect(() => {
    if (!open || !user?.id) return;
    supabase.from('prop_accounts').select('firm_name,status').eq('user_id', user.id).order('created_at', { ascending: true })
      .then(({ data }) => {
        const list = (data || []).filter((a) => a.status !== 'Closed').map((a) => a.firm_name).filter(Boolean);
        setAccounts(list);
      }, () => {});
    /* Активи, які вже є в журналі, — підказка, щоб «US100» з Notion
       можна було одним кліком записати як свій «NQ100». */
    supabase.from('trades').select('plan_pair').eq('user_id', user.id).order('plan_date', { ascending: false }).limit(1000)
      .then(({ data }) => setMyPairs([...new Set((data || []).map((r) => r.plan_pair).filter(Boolean))].slice(0, 60)), () => {});
  }, [open, user?.id]);

  const close = () => { if (!busy) setOpen(false); };

  async function pick(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setErr(''); setNames(files.map((f) => f.name));
    if (files.some((f) => /\.xlsx?$/i.test(f.name))) {
      setErr(tx('Excel збережи як CSV (Файл → Зберегти як → CSV). Google Sheets: Файл → Завантажити → CSV.', 'Save the Excel file as CSV (File → Save as → CSV). Google Sheets: File → Download → CSV.'));
      return;
    }
    if (files.reduce((s, f) => s + f.size, 0) > 60 * 1024 * 1024) { setErr(tx('Файли завеликі (макс. 60 МБ разом)', 'Files are too large (max 60 MB total)')); return; }
    setBusy('read');
    try {
      const bufs = await Promise.all(files.map(async (f) => ({ name: f.name, buf: await f.arrayBuffer() })));
      const s = await readSources(bufs);
      if (!s.tables.length) throw new Error(tx('Не знайшли таблиці. Потрібен CSV або zip з експорту Notion.', 'No table found. A CSV or a Notion export zip is needed.'));
      const merged = mergeTables(s.tables);
      if (!merged.rows.length) throw new Error(tx('Таблиця порожня.', 'The table is empty.'));
      const sug = suggestMapping(merged.headers, merged.rows);
      const saved = loadMaps()[headerSig(merged.headers)];
      const useSaved = saved && merged.headers.every((h) => saved[h]);
      setSrc({ ...merged, images: s.images, tables: s.tables.length });
      setMap(useSaved ? saved : sug.map);
      setProf(sug.prof);
      setFromSaved(!!useSaved);
      setStep('map');
      track('table_import_read', { files: files.length, rows: merged.rows.length, cols: merged.headers.length, saved: !!useSaved });
    } catch (e) {
      setErr(e.message === 'NO_ZIP' || e.message === 'BAD_ZIP'
        ? tx('Цей браузер не розпаковує zip. Розпакуй архів і завантаж CSV з нього.', 'This browser can’t unpack the zip. Unzip it and upload the CSV inside.')
        : (e.message || tx('Не вдалось прочитати файл', 'Could not read the file')));
    } finally {
      setBusy('');
    }
  }

  /* Одне поле — одна колонка: обране поле забираємо в попередньої
     колонки, і вона йде в опис з назвою. */
  const setTarget = (h, key) => {
    const multi = TARGETS.find((t) => t.key === key)?.multi;
    setMap((m) => {
      const next = { ...m };
      if (!multi) for (const k of Object.keys(next)) if (next[k] === key) next[k] = 'note';
      next[h] = key;
      return next;
    });
  };

  const has = (k) => Object.values(map).includes(k);
  const missing = [
    !has('date') && tx('дату', 'the date'),
    !has('pair') && tx('актив', 'the asset'),
    !['rr', 'result', 'profit', 'profitPct'].some(has) && tx('результат (RR, Win/Loss або прибуток)', 'the result (RR, Win/Loss or profit)'),
  ].filter(Boolean);

  const choices = useMemo(() => (src ? valueChoices(map, src.rows) : {}), [src, map]);
  /* Результат питаємо лише тоді, коли немає RR — інакше він з RR. */
  const askResult = choices.result && !has('rr');
  const groups = [
    choices.pair && ['pair', tx('Активи', 'Assets'), choices.pair],
    choices.session && ['session', tx('Сесії', 'Sessions'), choices.session],
    choices.dir && ['dir', tx('Напрям', 'Direction'), choices.dir],
    askResult && ['result', tx('Результат', 'Result'), choices.result],
  ].filter(Boolean);
  const val = (kind, raw, def) => values[kind]?.[raw] ?? def;
  const setVal = (kind, raw, to) => setValues((v) => ({ ...v, [kind]: { ...(v[kind] || {}), [raw]: to } }));

  const descCol = Object.keys(map).find((h) => map[h] === 'description');
  const mistakeCount = useMemo(() => (src && descCol && !has('mistake') ? src.rows.filter((r) => hasMistakeText(r[descCol])).length : 0), [src, descCol, map]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = useMemo(() => {
    if (!src || step !== 'review') return null;
    const vals = {};
    for (const [kind, , list] of groups) vals[kind] = Object.fromEntries(list.map((c) => [c.raw, val(kind, c.raw, c.to)]));
    const r = buildTrades(src.rows, map, { values: vals, account: account.trim(), mistakesFromText: markMistakes });
    return { ...r, sum: summarize(r.trades), files: r.trades.reduce((s, t) => s + t.__files.filter((n) => src.images.has(n)).length, 0) };
  }, [src, step, map, values, account, markMistakes]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    if (step === 'map') { saveMap(headerSig(src.headers), map); setStep(groups.length ? 'values' : 'review'); } else if (step === 'values') setStep('review');
  };
  const back = () => { if (step === 'review') setStep(groups.length ? 'values' : 'map'); else if (step === 'values') setStep('map'); else if (step === 'map') reset(); };

  const run = async () => {
    if (!built?.trades.length || !user?.id) return;
    setBusy('import'); setErr('');
    try {
      /* Картинки з архіву Notion — у наше сховище, як звичайні скріни. */
      const rows = [];
      for (const t of built.trades) {
        const { __files: files, __r: _r, ...row } = t;
        const shots = [...(row.trade_images || [])];
        for (const n of files) {
          const blob = src.images.get(n);
          if (!blob) continue;
          try { shots.push(await uploadImage(user.id, 'import', new File([blob], n, { type: blob.type }))); } catch { /* одна картинка не варта всього імпорту */ }
        }
        rows.push({ ...row, trade_images: shots.length ? shots : null, trade_image: shots[0] || null, user_id: user.id });
      }
      const ids = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data, error } = await supabase.from('trades')
          .upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,source,external_id', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        (data || []).forEach((d) => ids.push(d.id));
      }
      track('trades_imported', { kind: 'table', n: rows.length, added: ids.length });
      setDone({ added: ids.length, skipped: rows.length - ids.length, ids });
      setStep('done');
      window.dispatchEvent(new Event(TRADES_IMPORTED_EVENT));
      notify.success(tx('Імпорт готовий', 'Import done'), tx(`Додано угод: ${ids.length}`, `Trades added: ${ids.length}`));
    } catch (e) {
      setErr(e.message || tx('Не вдалось імпортувати', 'Import failed'));
    } finally {
      setBusy('');
    }
  };

  const undo = async () => {
    if (!done?.ids.length) return;
    setBusy('undo');
    try {
      for (let i = 0; i < done.ids.length; i += CHUNK) {
        const { error } = await supabase.from('trades').delete().in('id', done.ids.slice(i, i + CHUNK)).eq('source', 'import');
        if (error) throw error;
      }
      track('trades_import_undone', { n: done.ids.length });
      window.dispatchEvent(new Event(TRADES_IMPORTED_EVENT));
      notify.success(tx('Імпорт скасовано', 'Import undone'), tx('Угоди з цього файлу прибрали.', 'Trades from this file were removed.'));
      reset();
    } catch (e) {
      setErr(e.message || tx('Не вдалось скасувати', 'Could not undo'));
    } finally {
      setBusy('');
    }
  };

  const field = { fontFamily: T.sans, color: T.text, background: T.sunken, border: `1px solid ${T.line}` };
  const cap = 'mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.14em]';
  const stepNo = { file: 1, map: 2, values: 3, review: 4 }[step];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="timp"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[510] flex items-center justify-center px-3 py-4 sm:px-4"
          style={{ background: 'rgba(6,6,10,0.72)', backdropFilter: 'blur(6px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <motion.div
            role="dialog"
            aria-label={tx('Перенести журнал', 'Move your journal')}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
            className={`relative flex max-h-full w-full flex-col rounded-3xl transition-[max-width] duration-300 ${step === 'map' ? 'max-w-[1060px]' : 'max-w-[620px]'}`}
            style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 50px 110px -35px rgba(0,0,0,0.95)' }}
          >
            <div className="flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              {stepNo > 1 && step !== 'done' && (
                <button type="button" aria-label={tx('Назад', 'Back')} onClick={back} disabled={!!busy} className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: T.text3, border: `1px solid ${T.line}` }}>
                  <ArrowLeft size={15} />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[19px] font-bold" style={{ fontFamily: T.display || T.sans, color: T.text }}>
                  {step === 'map' ? tx('Що в якій колонці', 'Which column is what')
                    : step === 'values' ? tx('Уточни значення', 'Check the values')
                      : step === 'review' ? tx('Перевір і імпортуй', 'Review and import')
                        : tx('Перенести журнал з Notion', 'Move your journal from Notion')}
                </div>
                {stepNo && (
                  <div className="mt-1 text-[12px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {tx(`Крок ${stepNo} з 4`, `Step ${stepNo} of 4`)}{names.length ? ` · ${names.length > 1 ? tx(`${names.length} файли`, `${names.length} files`) : names[0]}` : ''}
                  </div>
                )}
              </div>
              <button type="button" aria-label={tx('Закрити', 'Close')} onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: T.text3 }}>
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-2 pt-4 sm:px-6">
              {step === 'file' && (
                <>
                  <p className="m-0 text-[13px] leading-[1.6]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {tx('Notion: на сторінці з таблицею «…» → Export → Markdown & CSV → завантаж zip сюди, розпаковувати не треба. Google Sheets чи Excel — CSV. Колонки можуть називатись як завгодно: на наступному кроці покажемо, що знайшли.', 'Notion: on the page with the table «…» → Export → Markdown & CSV → drop the zip here, no need to unpack. Google Sheets or Excel — CSV. Columns can be named anything: the next step shows what we found.')}
                  </p>
                  <input ref={input} type="file" multiple accept=".zip,.csv,.tsv,.txt,.xls,.xlsx" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
                    disabled={!!busy}
                    className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl px-4 py-8 text-center"
                    style={{ background: T.sunken, border: `1.5px dashed ${names.length ? T.acc : T.line}` }}
                  >
                    {busy ? <Loader2 size={22} className="animate-spin" style={{ color: T.acc }} /> : names.length ? <FileText size={22} style={{ color: T.acc }} /> : <Upload size={22} style={{ color: T.text3 }} />}
                    <span className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                      {busy ? tx('Читаємо…', 'Reading…') : names.length ? names.join(', ') : tx('Обери файли або перетягни сюди', 'Choose files or drop them here')}
                    </span>
                    <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text4 || T.text3 }}>{tx('zip, csv · можна кілька місяців одразу', 'zip, csv · several months at once is fine')}</span>
                  </button>
                </>
              )}

              {step === 'map' && src && (
                <>
                  <TableMapStep src={src} map={map} prof={prof} setTarget={setTarget} fromSaved={fromSaved} />
                  {missing.length > 0 && (
                    <div className="mt-3 text-[12.5px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.bad }}>
                      {tx(`Обери колонку, де ${missing.join(', ')}.`, `Pick the column with ${missing.join(', ')}.`)}
                    </div>
                  )}
                </>
              )}

              {step === 'values' && (
                <>
                  <p className="m-0 text-[13px] leading-[1.55]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {tx('Підставили, як зрозуміли. Виправ лише те, що не так.', 'Filled in as we understood it. Only fix what’s wrong.')}
                  </p>
                                    {groups.map(([kind, title, list]) => (
                    <div key={kind} className="mt-4">
                      <span className={cap} style={{ fontFamily: T.sans, color: T.text3 }}>{title}</span>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {list.map((c) => {
                          const cur = val(kind, c.raw, c.to);
                          const opts = kind === 'session' ? [...new Set([...SESSIONS, c.to])] : kind === 'dir' ? ['Long', 'Short'] : ['Win', 'Lose', 'BE'];
                          const colorOf = (o) => (o === 'Long' || o === 'Win' ? T.ok : o === 'Short' || o === 'Lose' ? T.bad : T.acc);
                          const rgbOf = (o) => (o === 'Long' || o === 'Win' ? T.okRgb : o === 'Short' || o === 'Lose' ? T.badRgb : T.accRgb);
                          const nice = (o) => (o === 'Lose' ? tx('Збиток', 'Loss') : o === 'Win' ? tx('Плюс', 'Win') : o === 'BE' ? tx('БУ', 'BE') : o);
                          const rawU = c.raw.toUpperCase().replace(/[^A-Z]/g, '');
                          const sugg = kind === 'pair'
                            ? [...new Set([c.to, ...myPairs.filter((x) => rawU.length >= 2 && x.startsWith(rawU.slice(0, 3))), ...['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'NAS100', 'BTCUSD'].filter((x) => rawU.length >= 2 && x.startsWith(rawU.slice(0, 2)))])].slice(0, 5)
                            : [];
                          return (
                            <div key={c.raw} className="rounded-2xl p-3" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                              <div className="mb-2.5 flex items-center gap-2">
                                <span className="min-w-0 truncate rounded-md px-2 py-0.5 text-[12.5px] font-semibold" style={{ fontFamily: T.mono, color: T.text2, background: 'rgba(255,255,255,0.06)' }}>{c.raw}</span>
                                <span className="text-[12px]" style={{ color: T.text4 || T.text3 }}>→</span>
                                <span className="min-w-0 truncate text-[13px] font-bold" style={{ fontFamily: T.mono, color: kind === 'pair' || kind === 'session' ? T.text : colorOf(cur) }}>{kind === 'pair' || kind === 'session' ? cur : nice(cur)}</span>
                              </div>
                              {kind === 'pair' ? (
                                <>
                                  <input value={cur} onChange={(e) => setVal(kind, c.raw, e.target.value.toUpperCase().replace(/\s+/g, ''))} className="h-10 w-full rounded-xl px-3 text-[14px] font-bold outline-none" style={{ ...field, fontFamily: T.mono, background: T.surface }} />
                                  {sugg.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {sugg.map((x) => (
                                        <button key={x} type="button" onClick={() => setVal(kind, c.raw, x)} className="h-7 rounded-lg px-2.5 text-[12px] font-semibold" style={{ fontFamily: T.mono, color: cur === x ? T.acc : T.text2, background: cur === x ? `rgba(${T.accRgb},0.12)` : 'transparent', border: `1px solid ${cur === x ? `rgba(${T.accRgb},0.45)` : T.line}` }}>{x}</button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {opts.map((o) => {
                                    const on = cur === o;
                                    return (
                                      <button key={o} type="button" onClick={() => setVal(kind, c.raw, o)} className="h-9 flex-1 rounded-xl px-3 text-[13px] font-semibold" style={{ fontFamily: T.sans, minWidth: kind === 'session' ? 'calc(50% - 6px)' : 0, color: on ? colorOf(o) : T.text3, background: on ? `rgba(${rgbOf(o)},0.12)` : 'transparent', border: `1px solid ${on ? `rgba(${rgbOf(o)},0.5)` : T.line}` }}>{nice(o)}</button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {step === 'review' && built && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    {[
                      [tx('Угод', 'Trades'), built.sum.n],
                      [tx('Вінрейт', 'Win rate'), built.sum.wr == null ? '—' : `${built.sum.wr}%`],
                      [tx('Сума', 'Total'), fmtR(built.sum.sumR)],
                      [tx('Період', 'Period'), built.sum.from ? `${built.sum.from.slice(5).split('-').reverse().join('.')} – ${built.sum.to.slice(5).split('-').reverse().join('.')}` : '—'],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-xl p-2.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>{l}</div>
                        <div className="mt-1 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {tx(`${built.sum.w} у плюс · ${built.sum.l} у мінус · ${built.sum.be} беззбиток. Звір зі своєю таблицею.`, `${built.sum.w} wins · ${built.sum.l} losses · ${built.sum.be} breakeven. Compare with your table.`)}
                  </div>

                  {(() => {
                    const warns = [];
                    const byWhy = (w) => built.skipped.filter((s) => s.why === w).length;
                    if (byWhy('date')) warns.push(tx(`Без дати, пропустимо: ${byWhy('date')}`, `No date, will be skipped: ${byWhy('date')}`));
                    if (byWhy('pair')) warns.push(tx(`Без активу, пропустимо: ${byWhy('pair')}`, `No asset, will be skipped: ${byWhy('pair')}`));
                    if (!has('dir')) warns.push(tx('Колонки з напрямом немає — усі угоди будуть Long. Виправ на кроці 2, якщо напрям є.', 'No direction column — all trades will be Long. Fix it in step 2 if there is one.'));
                    const dirCol = Object.keys(map).find((h) => map[h] === 'dir');
                    if (built.dirConflicts && built.otherDir.length) warns.push(tx(`У ${built.dirConflicts} угодах «${built.otherDir[0]}» не збігається з «${dirCol}». Напрям беремо з «${dirCol}».`, `In ${built.dirConflicts} trades «${built.otherDir[0]}» differs from «${dirCol}». Direction is taken from «${dirCol}».`));
                    if (built.trades.some((t) => t.result === 'Not Selected')) warns.push(tx('Частина угод без результату — їх можна буде доповнити в журналі.', 'Some trades have no result — you can fill it in later in the journal.'));
                    return warns.length > 0 && (
                      <div className="mt-3 grid gap-1.5">
                        {warns.map((w) => (
                          <div key={w} className="flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.text2, background: T.sunken }}>
                            <AlertTriangle size={14} className="mt-[3px] shrink-0" style={{ color: T.warn || T.acc }} />{w}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={cap} style={{ fontFamily: T.sans, color: T.text3 }}>{tx('Рахунок (необовʼязково)', 'Account (optional)')}</span>
                      <input list="timp-accounts" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={tx('Напр. FTMO 100k', 'E.g. FTMO 100k')} className="h-10 w-full rounded-lg px-3 text-[13.5px] outline-none" style={field} />
                      <datalist id="timp-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
                    </label>
                    {(built.files > 0 || built.trades.some((t) => t.trade_images)) && (
                      <div className="self-end pb-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                        {tx(`Скріни: ${built.trades.reduce((s, t) => s + (t.trade_images?.length || 0), 0) + built.files}`, `Screenshots: ${built.trades.reduce((s, t) => s + (t.trade_images?.length || 0), 0) + built.files}`)}
                      </div>
                    )}
                  </div>

                  {mistakeCount > 0 && (
                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: T.sunken }}>
                      <input type="checkbox" checked={markMistakes} onChange={(e) => setMarkMistakes(e.target.checked)} className="mt-0.5" />
                      <span className="text-[13px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.text2 }}>
                        {tx(`Позначити як помилки угоди, де в описі є «Помилка:» (${mistakeCount}). Вони зʼявляться в журналі помилок.`, `Mark trades whose description has «Mistake:» as mistakes (${mistakeCount}). They’ll show up in the mistakes journal.`)}
                      </span>
                    </label>
                  )}

                  <div className="mt-4">
                    <span className={cap} style={{ fontFamily: T.sans, color: T.text3 }}>{tx('Так виглядатимуть угоди', 'This is how the trades will look')}</span>
                    <div className="grid gap-1">
                      {built.trades.slice(0, 5).map((t) => (
                        <div key={t.external_id} className="flex min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px]" style={{ background: T.sunken, fontFamily: T.sans, color: T.text2 }}>
                          <span className="tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>{t.plan_date.slice(5).split('-').reverse().join('.')}</span>
                          <span className="font-bold" style={{ color: T.text }}>{t.plan_pair}</span>
                          <span>{t.type}</span>
                          <span className="font-semibold" style={{ color: t.result === 'Win' ? T.ok : t.result === 'Lose' ? T.bad : T.text3 }}>{t.result === 'Lose' ? 'Loss' : t.result}</span>
                          {t.__r != null && <span className="tabular-nums" style={{ fontFamily: T.mono }}>{fmtR(t.__r)}</span>}
                          <span className="w-0 min-w-0 flex-1 truncate" style={{ color: T.text3 }}>{(t.trade_description || '').split('\n')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step === 'done' && done && (
                <div className="rounded-2xl p-4" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                  <div className="flex items-center gap-2 text-[15px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
                    <Check size={18} style={{ color: T.ok }} />
                    {tx(`Додано угод: ${done.added}`, `Trades added: ${done.added}`)}
                  </div>
                  {done.skipped > 0 && (
                    <div className="mt-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {tx(`Уже були в журналі й пропущені: ${done.skipped}`, `Already in the journal, skipped: ${done.skipped}`)}
                    </div>
                  )}
                  <div className="mt-1 text-[12.5px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {tx('Наступного місяця просто кинь новий експорт — колонки підхопляться самі, а вже перенесені угоди не задублюються.', 'Next month just drop the new export — the columns are remembered and trades already moved won’t be duplicated.')}
                  </div>
                </div>
              )}

              {err && <div className="mt-3 text-[12.5px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.bad }}>{err}</div>}
            </div>

            <div className="flex flex-wrap gap-2 px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
              {step === 'map' && (
                <button type="button" onClick={next} disabled={missing.length > 0} className="edge-add-btn h-11 flex-1 rounded-xl text-[14px] font-bold" style={{ opacity: missing.length ? 0.5 : 1 }}>
                  {tx('Далі', 'Next')}
                </button>
              )}
              {step === 'values' && (
                <button type="button" onClick={next} className="edge-add-btn h-11 flex-1 rounded-xl text-[14px] font-bold">{tx('Далі', 'Next')}</button>
              )}
              {step === 'review' && built && (
                <button type="button" onClick={run} disabled={!!busy || !built.trades.length} className="edge-add-btn flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-bold" style={{ opacity: busy || !built.trades.length ? 0.5 : 1 }}>
                  {busy === 'import' && <Loader2 size={15} className="animate-spin" />}
                  {tx(`Імпортувати (${built.trades.length})`, `Import (${built.trades.length})`)}
                </button>
              )}
              {step === 'done' && (
                <>
                  <button type="button" onClick={() => { setOpen(false); navigate('/journal'); }} className="edge-add-btn h-11 flex-1 rounded-xl text-[14px] font-bold">{tx('До журналу', 'Go to the journal')}</button>
                  {done?.ids.length > 0 && (
                    <button type="button" onClick={undo} disabled={!!busy} className="flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2, border: `1px solid ${T.line}` }}>
                      {busy === 'undo' && <Loader2 size={14} className="animate-spin" />}
                      {tx('Скасувати імпорт', 'Undo import')}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

