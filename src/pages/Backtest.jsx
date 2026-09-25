import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, X, Loader2, FlaskConical, Trash2, Layers, SlidersVertical,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { computeStats, fmtR, fmtPF } from '../lib/backtestStats';
import { DEMO_SESSIONS, isDemo } from '../lib/backtestDemo';
import { setBacktestPublic } from '../lib/backtestShare';
import { notify } from '../utils/notify';
import { ACT } from '../components/backtest/accent';
import BacktestCard from '../components/backtest/BacktestCard';
import NewBacktestModal from '../components/backtest/NewBacktestModal';

/* «1 бектест», «3 бектести», «5 бектестів». Без цього виходило
   «3 бектестів» — рядок, що виглядає як помилка набору. Окремий
   випадок для 11–14: там завжди форма множини. */
const plural = (n, one, few, many) => {
  const t = n % 100;
  if (t >= 11 && t <= 14) return many;
  const d = n % 10;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
};

/* ==================================================================
   Головна бектестів.
   Список усіх гіпотез, які ти перевіряв, з достатньою статистикою,
   щоб зрозуміти, котра з них жива, не заходячи всередину.
   Поки в базі порожньо — показуються демо-бектести.
================================================================== */

function Summary({ sessions }) {
  const agg = useMemo(() => {
    const all = sessions.flatMap((s) => (s.trades || []).map((t) => t));
    const s = computeStats(all, 10000);
    return {
      count: sessions.length,
      trades: s.total,
      netR: s.netR,
      winrate: s.winrate,
      pf: s.profitFactor,
    };
  }, [sessions]);

  /* Кожна плитка має свій колір, а не спільний акцент. Пʼять
     однакових фіолетових прямокутників читаються як орнамент; коли
     кожна цифра має свій відтінок, погляд знаходить потрібну, не
     перечитуючи підписи. */
  const items = [
    { label: 'Бектестів', value: agg.count, hue: ACT.tint, rgb: ACT.rgb },
    { label: 'Угод усього', value: agg.trades, hue: T.info, rgb: T.infoRgb },
    {
      label: 'Сумарний R',
      value: agg.trades ? fmtR(agg.netR) : '—',
      hue: agg.netR >= 0 ? T.ok : T.bad,
      rgb: agg.netR >= 0 ? T.okRgb : T.badRgb,
      big: true,
    },
    { label: 'Win rate', value: agg.trades ? `${agg.winrate.toFixed(0)}%` : '—', hue: T.warn, rgb: T.warnRgb },
    {
      label: 'Profit factor',
      value: agg.trades ? fmtPF(agg.pf) : '—',
      hue: agg.pf >= 1.5 ? T.ok : agg.pf < 1 && agg.trades ? T.bad : T.text2,
      rgb: agg.pf >= 1.5 ? T.okRgb : agg.pf < 1 && agg.trades ? T.badRgb : ACT.rgb,
    },
  ];

  return (
    /* sm: (640px) рахує за шириною вікна, а не за вільним місцем —
       на цій сторінці ліворуч завжди сидить бічна панель ~300px, тож
       на екрані 768px під сітку лишається реальних ~450px, і три
       вузькі стовпці знову обрізають «+15.20R» до «+15.2…». lg:
       вмикається вже там, де ця різниця відпрацьована. */
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3 xl:grid-cols-5">
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: i * 0.04, ease: EASE }}
          /* Пʼять плиток на два стовпці лишають одну сиротою в
             останньому рядку — вона розтягується на всю ширину, поки
             ґрати не стануть рівними. */
          className={`group relative min-w-0 overflow-hidden ${i === items.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}
          style={{
            padding: '14px 16px',
            borderRadius: 16,
            background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
            border: `1px solid ${T.line}`,
            transition: 'border-color .22s, box-shadow .22s, transform .22s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `rgba(${it.rgb},0.45)`;
            e.currentTarget.style.boxShadow = `0 18px 40px -26px rgba(${it.rgb},0.55)`;
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = T.line;
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'none';
          }}
        >
          {/* Ореол проявляється на наведенні. */}
          <span
            aria-hidden
            className="pointer-events-none absolute opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              inset: -40,
              background: `radial-gradient(120px circle at 50% 0%, rgba(${it.rgb},0.16), transparent 70%)`,
            }}
          />

          <div
            className="relative truncate uppercase"
            style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '1.6px', color: T.text3 }}
            title={it.label}
          >
            {it.label}
          </div>
          <div
            className={`relative mt-2 truncate tabular-nums leading-none ${it.big ? 'text-[21px] lg:text-[26px]' : 'text-[19px] lg:text-[24px]'}`}
            style={{ fontFamily: T.mono, fontWeight: 600, letterSpacing: '-0.8px', color: it.hue }}
            title={String(it.value)}
          >
            {it.value}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ==================================================================
   «Новий бектест» — потік даних у 3D-перспективі.

   За основою користувача: два ряди плашок пливуть назустріч одна
   одній під нахилом, у масці, що гасить їх по краях кнопки, а «+»
   на ховері перетворюється на повзунки — саме те, чим і є створення
   бектесту, налаштування параметрів. Панель лишилась тією самою, що
   в «Add Account» (це вже не тимчасова копія — просто той самий
   стиль кнопки пасує обом), змінився лише вміст усередині.

   Плашки — не декоративний текст, а ті самі поняття, що й у формі
   створення нижче (пара, ризик, R, депозит): кнопка натякає на
   форму, яку зараз відкриє. Емодзі свідомо нема — у проєкті іконки
   лише SVG. Прозорість плашок і тінь під написом підібрані так, щоб
   «Новий бектест» лишався читабельним поверх руху, а не змагався з
   ним за увагу. */
function NewBacktestButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bt-stream inline-flex h-[54px] shrink-0 items-center justify-center gap-2.5 rounded-2xl px-6 text-[14.5px] font-bold"
      style={{
        background: 'linear-gradient(180deg, var(--edge-surface-hi, #18181C), var(--edge-sunken, #0D0D10))',
        border: '1px solid rgba(139,123,255,0.5)',
        color: '#fff',
        fontFamily: T.sans,
        boxShadow: '0 10px 28px -12px rgba(139,123,255,0.4)',
      }}
    >
      <span className="bt-stream-bg" aria-hidden="true">
        <span className="bt-stream-row bt-stream-row-a">
          <span className="bt-pill">EURUSD</span>
          <span className="bt-pill bt-pill-ok">+2.4R</span>
          <span className="bt-pill">Ризик 1%</span>
          <span className="bt-pill bt-pill-ok">Win 62%</span>
          <span className="bt-pill">EURUSD</span>
          <span className="bt-pill bt-pill-ok">+2.4R</span>
          <span className="bt-pill">Ризик 1%</span>
          <span className="bt-pill bt-pill-ok">Win 62%</span>
        </span>
        <span className="bt-stream-row bt-stream-row-b">
          <span className="bt-pill bt-pill-ok">NET +18.5R</span>
          <span className="bt-pill">SFP · ORB</span>
          <span className="bt-pill">$1 000 / R</span>
          <span className="bt-pill">XAUUSD</span>
          <span className="bt-pill bt-pill-ok">NET +18.5R</span>
          <span className="bt-pill">SFP · ORB</span>
          <span className="bt-pill">$1 000 / R</span>
          <span className="bt-pill">XAUUSD</span>
        </span>
      </span>

      <span className="bt-stream-icon relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <Plus size={16} strokeWidth={2.6} className="bt-stream-plus" style={{ color: 'var(--edge-acc, #8b7bff)' }} />
        <SlidersVertical size={15} strokeWidth={2.3} className="bt-stream-sliders" style={{ color: 'var(--edge-acc, #8b7bff)' }} />
      </span>
      <span className="bt-stream-label whitespace-nowrap">Новий бектест</span>
    </button>
  );
}

export default function Backtest() {
  useEdgeFonts();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [confirm, setConfirm] = useState(null);

  /* Перезавантажуємо список тільки коли змінюється користувач.
     load() оголошена в тілі компонента й пересоздається щорендера —
     у deps її не тягнемо навмисно. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      /* Явний фільтр по user_id, а не покладатись на RLS. У власника
         адмінська політика admin_read_all відкриває SELECT на всі
         рядки — і особиста сторінка бектестів раптом показувала чужі
         тестові прогони, які до того ж не можна видалити (DELETE
         лишається тільки для своїх). Решта сторінок застосунку теж
         фільтрують по user_id вручну — тримаємось того самого. */
      if (!user?.id) {
        setSessions(DEMO_SESSIONS);
        setUsingDemo(true);
        return;
      }

      const { data: rows, error } = await supabase
        .from('backtest_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      if (!rows || rows.length === 0) {
        setSessions(DEMO_SESSIONS);
        setUsingDemo(true);
      } else {
        const ids = rows.map((r) => r.id);
        const { data: trades } = await supabase
          .from('backtest_trades')
          .select('*')
          .in('session_id', ids)
          .order('date', { ascending: true });

        const byId = {};
        (trades || []).forEach((t) => {
          (byId[t.session_id] = byId[t.session_id] || []).push(t);
        });
        setSessions(rows.map((r) => ({ ...r, trades: byId[r.id] || [] })));
        setUsingDemo(false);
      }
    } catch (e) {
      console.error(e);
      setSessions(DEMO_SESSIONS);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }

  const createSession = async (f) => {
    setSaving(true);
    try {
      const payload = {
        user_id: user?.id,
        name: f.name.trim(),
        pair: f.pair || 'EURUSD',
        strategy_name: f.strategy_name || null,
        initial_balance: Number(f.initial_balance) || 10000,
      };
      const { data, error } = await supabase.from('backtest_sessions').insert([payload]).select().single();
      if (error) throw error;
      setCreating(false);
      navigate(`/backtest/${data.id}`);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Не вдалось створити бектест');
    } finally {
      setSaving(false);
    }
  };

  /* Поділитись прямо зі списку: відкриваємо доступ, якщо він ще
     закритий, і кладемо лінк у буфер. Друге натискання на вже
     відкритому прогоні просто копіює — доступ не перемикаємо, бо
     випадково закрити чужу посилку гірше, ніж зайвий раз скопіювати. */
  const [sharingId, setSharingId] = useState(null);

  const shareSession = async (s) => {
    if (sharingId) return;
    setSharingId(s.id);
    try {
      if (!s.is_public) {
        const next = await setBacktestPublic(user.id, s.id, true);
        setSessions((list) => list.map((x) => (x.id === s.id ? { ...x, ...next } : x)));
      }
      await navigator.clipboard.writeText(`${window.location.origin}/shared/backtest/${s.id}`);
      notify.success('Лінк скопійовано', 'Бектест відкритий для перегляду за посиланням.');
    } catch (e) {
      notify.error('Не вдалось поділитись', e.message);
    } finally {
      setSharingId(null);
    }
  };

  const removeSession = async (s) => {
    /* Демо живе тільки в памʼяті: у базі його немає, а спроба
       видалити рядок із нечисловим id ('demo-sb') валиться на
       невалідному uuid. Тому демо просто прибираємо зі списку —
       банер уже попереджає, що після перезавантаження воно
       повернеться. */
    if (usingDemo || isDemo(s.id)) {
      setSessions((list) => list.filter((x) => x.id !== s.id));
      setConfirm(null);
      return;
    }

    try {
      /* Спершу угоди. Якщо між ними й сесією стоїть зовнішній ключ
         без cascade, видалення самої сесії інакше падає на 23503 —
         а раніше цю помилку просто ковтали, і картка «зникала» лише
         в інтерфейсі до першого перезавантаження. */
      const { error: tErr } = await supabase
        .from('backtest_trades')
        .delete()
        .eq('session_id', s.id)
        .eq('user_id', user.id);
      if (tErr) throw tErr;

      const { data: gone, error: sErr } = await supabase
        .from('backtest_sessions')
        .delete()
        .eq('id', s.id)
        .eq('user_id', user.id)
        .select('id');
      if (sErr) throw sErr;

      /* .select() повернув порожньо — рядок не наш або його вже
         немає. RLS у такому разі не кидає помилку, просто нічого не
         чіпає. Картку не прибираємо, щоб інтерфейс не розходився з
         базою. */
      if (!gone || gone.length === 0) {
        notify.error(
          'Бектест не видалено',
          'Схоже, він належить іншому акаунту або вже видалений — онови сторінку.',
        );
        return;
      }

      setSessions((list) => list.filter((x) => x.id !== s.id));
      notify.success('Бектест видалено', `«${s.name}» більше немає.`);
    } catch (e) {
      console.error(e);
      notify.error('Не вдалось видалити бектест', e.message || 'Спробуй ще раз.');
    } finally {
      setConfirm(null);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sessions.filter((s) =>
      !q
      || (s.name || '').toLowerCase().includes(q)
      || (s.pair || '').toLowerCase().includes(q)
      || (s.strategy_name || '').toLowerCase().includes(q));

    const stat = (s) => computeStats(s.trades || [], s.initial_balance || 10000);
    return [...list].sort((a, b) => {
      if (sort === 'netR') return stat(b).netR - stat(a).netR;
      if (sort === 'trades') return (b.trades?.length || 0) - (a.trades?.length || 0);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [sessions, search, sort]);

  /* Загальна кількість угод для підзаголовка: у макеті поруч із
     кількістю бектестів. */
  const totalTrades = useMemo(
    () => sessions.reduce((n, x) => n + (x.trades?.length || 0), 0),
    [sessions],
  );

  /* Суперлативи, а не назви ключів: «Highest R» одразу каже, що
     згори найкращі, тоді як «За R» лишало здогадуватись про напрям. */
  const SORTS = [
    { key: 'recent', label: 'Newest' },
    { key: 'netR', label: 'Highest R' },
    { key: 'trades', label: 'Most trades' },
  ];

  return (
    <div className="relative min-h-full">

      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Шапка ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-wrap items-end justify-between"
          style={{ gap: 36, padding: '10px 0 30px' }}
        >
          <div className="min-w-0">
            <div className="flex items-center" style={{ gap: 9 }}>
              {/* Крапка з ореолом. Дрібниця, але саме вона перетворює
                  надпис на позначку розділу, а не на службовий рядок. */}
              <span
                style={{
                  width: 6, height: 6, borderRadius: 99,
                  background: ACT.tint, boxShadow: `0 0 12px ${ACT.tint}`,
                }}
              />
              <span
                className="uppercase"
                style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 600, letterSpacing: '2.6px', color: ACT.tint }}
              >
                Backtesting
              </span>
            </div>

            <h1
              className="edge-page-title"
              style={{
                fontFamily: T.display, marginTop: 13, fontWeight: 600,
                letterSpacing: '-1.3px', lineHeight: 1, color: T.text,
              }}
            >
              Бектести
            </h1>

            <p style={{ fontFamily: T.sans, marginTop: 11, fontSize: 14, color: T.text2 }}>
              {usingDemo
                ? 'Це демо-дані — створи свій бектест, і вони зникнуть.'
                : `${sessions.length} ${plural(sessions.length, 'бектест', 'бектести', 'бектестів')} · ${totalTrades} ${plural(totalTrades, 'угода', 'угоди', 'угод')}`}
            </p>
          </div>

          {/* NewBacktestButton вище — панель і вибух за формулою
              «Add Account» з рахунків, перефарбовані під суть
              бектесту (деталі — у коментарі над компонентом). */}
          <NewBacktestButton onClick={() => setCreating(true)} />
        </motion.div>

        {loading ? (
          <div className="grid place-items-center py-32">
            <Loader2 size={30} className="animate-spin" style={{ color: ACT.tint }} />
          </div>
        ) : (
          <>
            {/* Зведення над фільтрами, а не під ними: це підсумок усього
                розділу, і читається він до того, як щось відбирати. */}
            {sessions.length > 0 && <Summary sessions={sessions} />}

            {/* ─────────── Фільтри ───────────
                На телефоні пошук іде першим (ним і починають шукати
                конкретний бектест), а сортування — горизонтальною
                стрічкою без переносу, що виходить за бічні поля
                сторінки: три пігулки в 320px не влазять в один рядок,
                а перенесення лишало одну сиротою окремим рядком
                зліва. Від sm — звичний ряд: сортування ліворуч,
                пошук фіксованої ширини праворуч. */}
            <div
              className="flex flex-col gap-3 pt-3.5 pb-[18px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4"
              style={{
                marginTop: 22,
                borderTop: `1px solid ${T.line}`,
                borderBottom: `1px solid ${T.line}`,
              }}
            >
              <div
                className="edge-search order-1 flex w-full items-center sm:order-2 sm:w-[250px]"
                style={{
                  gap: 10, height: 40, padding: '0 15px', borderRadius: 11,
                  background: T.sunken, border: `1px solid ${T.line}`,
                  transition: 'border-color .18s, box-shadow .18s',
                }}
              >
                <Search size={15} strokeWidth={2} className="shrink-0" style={{ color: T.text3 }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Пошук"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  style={{ fontFamily: T.sans, fontSize: 14, color: T.text }}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="shrink-0" style={{ color: T.text3 }}>
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              <div className="no-scrollbar order-2 -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:order-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                {SORTS.map((x) => {
                  const on = sort === x.key;
                  return (
                    <button
                      key={x.key}
                      onClick={() => setSort(x.key)}
                      className="shrink-0"
                      style={{
                        fontFamily: T.sans, height: 36, padding: '0 16px', borderRadius: 10,
                        fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap',
                        transition: 'all .18s',
                        color: on ? '#fff' : T.text2,
                        background: on
                          ? `linear-gradient(180deg, ${ACT.from}, ${ACT.to})`
                          : 'rgba(255,255,255,0.03)',
                        boxShadow: on
                          ? `inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 20px -10px rgba(${ACT.rgb},0.9)`
                          : `inset 0 0 0 1px ${T.line}`,
                      }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    >
                      {x.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 22 }} />

            {visible.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-24 text-center">
                <div
                  className="mb-6 grid h-16 w-16 place-items-center rounded-2xl"
                  style={{ border: `1px dashed ${T.lineHi}`, color: T.text3 }}
                >
                  <FlaskConical size={24} strokeWidth={1.7} />
                </div>
                <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
                  {sessions.length === 0 ? 'Ще немає бектестів' : 'Нічого не знайшлось'}
                </div>
                <p className="mb-7 max-w-[440px] text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
                  {sessions.length === 0
                    ? 'Створи бектест під конкретну гіпотезу — і прожени по ній 50–100 угод. Статистика покаже, чи варта вона реальних грошей.'
                    : 'Спробуй інші слова в пошуку.'}
                </p>
                <button
                  onClick={() => (sessions.length === 0 ? setCreating(true) : setSearch(''))}
                  className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-bold"
                  style={{
                    fontFamily: T.sans,
                    background: `linear-gradient(180deg, ${ACT.from}, ${ACT.to})`,
                    color: '#fff',
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 12px 30px -12px rgba(${ACT.rgb},0.9)`,
                  }}
                >
                  {sessions.length === 0 ? <><Plus size={15} strokeWidth={3} /> Створити перший</> : 'Скинути пошук'}
                </button>
              </div>
            ) : (
              <motion.div
                layout
                className="grid gap-[18px]"
                /* min(330px, 100%): на телефоні 320px колонка вужча за 330 — без
                   min() картка вилазила за екран і з'являвся горизонтальний скрол. */
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(330px, 100%), 1fr))' }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {visible.map((s) => (
                    <BacktestCard
                      key={s.id}
                      session={s}
                      onOpen={(x) => navigate(`/backtest/${x.id}`)}
                      onDelete={(x) => setConfirm(x)}
                      onShare={shareSession}
                      sharing={sharingId === s.id}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {usingDemo && visible.length > 0 && (
              <div
                className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3.5"
                style={{ background: `rgba(${T.warnRgb},0.05)`, border: `1px solid rgba(${T.warnRgb},0.18)` }}
              >
                <Layers size={16} strokeWidth={2.2} style={{ color: T.warn }} />
                <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                  Демо-бектести показані для прикладу. У них можна клікати й навіть додавати угоди — але після перезавантаження вони повернуться як були.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {creating && (
          <NewBacktestModal
            key="new"
            saving={saving}
            onClose={() => setCreating(false)}
            onCreate={createSession}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setConfirm(null)}
            className="fixed inset-0 z-[300] grid place-items-center p-4"
            style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-2xl p-7 text-center"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}` }}
            >
              <div
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.badRgb},0.10)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
              >
                <Trash2 size={22} strokeWidth={1.9} style={{ color: T.bad }} />
              </div>
              <div
                className="mb-2.5 text-[19px] font-bold"
                style={{
                  fontFamily: T.display, color: T.text,
                  overflowWrap: 'anywhere',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                Видалити «{confirm.name}»?
              </div>
              <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                {confirm.demo
                  ? 'Це приклад, не твої дані — просто сховається з цього перегляду. Онови сторінку, і він зʼявиться знову, поки не створиш свій перший бектест.'
                  : `Разом із бектестом зникнуть усі ${confirm.trades?.length || 0} угод у ньому.`}
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirm(null)}
                  className="h-11 flex-1 rounded-xl text-[14px] font-semibold"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                >
                  Залишити
                </button>
                <button
                  onClick={() => removeSession(confirm)}
                  className="h-11 flex-1 rounded-xl text-[14px] font-bold"
                  style={{ background: T.bad, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
                >
                  Видалити
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
