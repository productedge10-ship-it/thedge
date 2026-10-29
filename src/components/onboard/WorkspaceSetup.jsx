import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  BookOpen, Target, CalendarClock, BrainCircuit, History, FileText, ShieldCheck, Newspaper, X,
  LayoutGrid, Activity, ClipboardCheck, CheckSquare, Calculator, NotebookPen, BarChart2, Users, AlertTriangle, FileCheck2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import useCloudState from '../../hooks/useCloudState';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { NAV, HIDEABLE } from '../../lib/settings';
import { KEY as SURVEY_KEY, EMPTY as SURVEY_EMPTY, normalize as surveyNorm, SAVED_EVENT } from '../../lib/onboard';
import { track } from '../../lib/pulse';

/* ==================================================================
   «Що тобі потрібно?» — збираємо меню під себе за хвилину.

   Скарга №1 від нових людей: «забагато кнопок». Розділи тут не по
   одному, а блоками за задачею трейдера (журнал, план, новини,
   самоаналіз…): людина думає «мені треба вести угоди й готуватись до
   дня», а не «мені треба /20-trades». Праворуч — живе меню, яке
   змінюється разом з вибором, щоб було видно результат до «Готово».

   Нічого не видаляється: вимкнений блок лише ховає пункти з меню
   (той самий hiddenNav, що й у налаштуваннях), сторінки лишаються на
   своїх адресах і повертаються в один клік.
================================================================== */

export const WS_KEY = 'workspace_v1';
export const WS_OPEN_EVENT = 'edge:workspace-open';
export const openWorkspaceSetup = () => window.dispatchEvent(new Event(WS_OPEN_EVENT));
export const WS_SAVED_EVENT = 'edge:workspace-saved';

/* Чи вже обрано меню. Поки ні — у сайдбарі є пункт «Меню»; після вибору
   він зникає (далі — лише налаштування). */
export function useWorkspaceDone() {
  const [ws, , { ready }] = useCloudState(WS_KEY, WS_EMPTY, { normalize: wsNorm });
  const [done, setDone] = useState(null);
  useEffect(() => {
    const on = (e) => setDone(e.detail === 'done');
    window.addEventListener(WS_SAVED_EVENT, on);
    return () => window.removeEventListener(WS_SAVED_EVENT, on);
  }, []);
  if (done !== null) return done;
  return ready ? ws.status === 'done' : true;
}
const WS_EMPTY = { status: 'new', modules: null, at: null };
const wsNorm = (v) => (v && typeof v === 'object' ? { ...WS_EMPTY, ...v } : { ...WS_EMPTY });

const MODULES = [
  {
    id: 'journal', icon: BookOpen, rgb: '139,123,255',
    title: tx('Журнал угод', 'Trade journal'),
    text: tx('Записуєш угоди вручну або з MT5 і бачиш, що реально працює: winrate, R, просадка.', 'Log trades manually or from MT5 and see what really works: winrate, R, drawdown.'),
    routes: ['/journal', '/analytics', '/accounts'],
  },
  {
    id: 'plan', icon: Target, rgb: '96,165,250',
    title: tx('План і рутина', 'Plan & routine'),
    text: tx('План на день, чекліст перед входом і список справ — щоб торгувати за правилами, а не на емоціях.', 'Daily plan, pre-entry checklist and to-dos — trade by rules, not by emotions.'),
    routes: ['/plan', '/checklist', '/todo'],
  },
  {
    id: 'news', icon: CalendarClock, rgb: '251,191,36',
    title: tx('Новини', 'News'),
    text: tx('Календар подій з важливістю й нагадуваннями, щоб NFP не застав тебе в позиції.', 'Economic calendar with impact and alerts, so NFP never catches you in a trade.'),
    routes: ['/news'],
  },
  {
    id: 'self', icon: BrainCircuit, rgb: '244,114,182',
    title: tx('Самоаналіз', 'Self-review'),
    text: tx('Розбори угод, журнал помилок і метод 20 угод — бачиш свої патерни й перестаєш повторювати одне й те саме.', 'Trade reviews, error log and the 20-trades method — spot your patterns and stop repeating them.'),
    routes: ['/reviews', '/error', '/20-trades'],
  },
  {
    id: 'backtest', icon: History, rgb: '52,211,153',
    title: tx('Бектест і система', 'Backtest & system'),
    text: tx('Перевіряєш сетап на історії з реплеєм, як у TradingView, і записуєш свою торгову систему.', 'Test setups on history with TradingView-like replay and write down your trading system.'),
    routes: ['/backtest', '/system'],
  },
  {
    id: 'notes', icon: FileText, rgb: '167,139,250',
    title: tx('Аналізи й нотатки', 'Analyses & notes'),
    text: tx('Архів твоїх аналізів ринку й нотатки — усе в одному місці замість скрінів по чатах.', 'Archive of your market analyses and notes — all in one place instead of screenshots in chats.'),
    routes: ['/analyses', '/notes'],
  },
  {
    id: 'prop', icon: ShieldCheck, rgb: '248,113,113',
    title: tx('Ризик і проп', 'Risk & prop'),
    text: tx('Калькулятор лота й правила пропфірм — щоб не злити челендж через одну помилку в розмірі.', 'Lot calculator and prop firm rules — so one sizing mistake does not blow a challenge.'),
    routes: ['/calculator', '/prop-rules'],
  },
  {
    id: 'blog', icon: Newspaper, rgb: '161,161,170',
    title: tx('Блог', 'Blog'),
    text: tx('Статті про психологію, ризик і роботу з журналом.', 'Articles on psychology, risk and journaling.'),
    routes: ['/blog'],
  },
];

const PRESETS = [
  { id: 'min', label: tx('Мінімум', 'Minimal'), hint: tx('тільки журнал', 'journal only'), mods: ['journal'] },
  { id: 'rec', label: tx('Рекомендовано', 'Recommended'), hint: tx('для щоденної торгівлі', 'for daily trading'), mods: ['journal', 'plan', 'news', 'self'] },
  { id: 'all', label: tx('Усе', 'Everything'), hint: tx('всі розділи', 'all sections'), mods: MODULES.map((m) => m.id) },
];

const NAV_ICONS = {
  LayoutGrid, Target, BookOpen, Activity, ClipboardCheck, CheckSquare, Calculator,
  FileText, BrainCircuit, History, NotebookPen, BarChart2, Users, AlertTriangle,
  CalendarClock, Newspaper, FileCheck2,
};
const navItem = (to) => NAV.flatMap((g) => g.items).find((i) => i.to === to);

/* З поточного меню — які блоки зараз увімкнені. */
function modsFromHidden(hidden) {
  if (!hidden?.length) return null;
  return MODULES.filter((m) => m.routes.some((r) => !hidden.includes(r))).map((m) => m.id);
}

function Toggle({ on }) {
  return (
    <span className="relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-200" style={{ background: on ? T.acc : 'rgba(255,255,255,0.12)' }}>
      <span className="block h-[14px] w-[14px] rounded-full bg-white transition-transform duration-200" style={{ transform: `translateX(${on ? 14 : 2}px)` }} />
    </span>
  );
}

export default function WorkspaceSetup() {
  const { user } = useAuth();
  const s = useSettings();
  const [ws, setWs, { ready }] = useCloudState(WS_KEY, WS_EMPTY, { normalize: wsNorm });
  const [survey, , { ready: sReady }] = useCloudState(SURVEY_KEY, SURVEY_EMPTY, { normalize: surveyNorm });
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [picked, setPicked] = useState(() => new Set(PRESETS[1].mods));

  const begin = (lock = false) => {
    setLocked(lock);
    const cur = modsFromHidden(s.hiddenNav);
    setPicked(new Set(cur || ws.modules || PRESETS[1].mods));
    setOpen(true);
  };

  /* Сам з'являється один раз — після анкети (щоб не дві модалки разом). */
  useEffect(() => {
    if (!ready || !sReady || !user?.id) return;
    if (ws.status === 'new' && survey.status !== 'new') begin(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sReady, user?.id, ws.status, survey.status]);

  /* Анкету пише інший екземпляр стану — слухаємо його подію, інакше меню
     з'явилось би лише після перезавантаження. */
  useEffect(() => {
    const on = (e) => {
      if (ws.status === 'new' && e.detail?.status && e.detail.status !== 'new') begin(true);
    };
    window.addEventListener(SAVED_EVENT, on);
    return () => window.removeEventListener(SAVED_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.status]);

  useEffect(() => {
    const on = () => begin(ws.status !== 'done');
    window.addEventListener(WS_OPEN_EVENT, on);
    return () => window.removeEventListener(WS_OPEN_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.hiddenNav, ws.modules]);

  const toggle = (id) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const visible = useMemo(() => {
    const routes = new Set(MODULES.filter((m) => picked.has(m.id)).flatMap((m) => m.routes));
    return NAV.map((g) => ({ group: g.group, items: g.items.filter((i) => i.fixed || routes.has(i.to)) })).filter((g) => g.items.length);
  }, [picked]);
  const count = visible.reduce((n, g) => n + g.items.length, 0);
  const preset = PRESETS.find((p) => p.mods.length === picked.size && p.mods.every((m) => picked.has(m)))?.id;

  const close = (status) => {
    if (locked && status === 'later') return;
    setWs({ ...ws, status, at: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent(WS_SAVED_EVENT, { detail: status }));
    setOpen(false);
  };
  const done = () => {
    const routes = new Set(MODULES.filter((m) => picked.has(m.id)).flatMap((m) => m.routes));
    s.set({ hiddenNav: HIDEABLE.filter((i) => !routes.has(i.to)).map((i) => i.to) });
    setWs({ status: 'done', modules: [...picked], at: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent(WS_SAVED_EVENT, { detail: 'done' }));
    track('workspace_setup', { modules: [...picked] });
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ws"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[520] flex items-center justify-center overflow-y-auto px-3 py-6"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) close('later'); }}
        >
          <motion.div
            role="dialog"
            aria-label={tx('Налаштуй меню під себе', 'Set up your menu')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="relative my-auto grid w-full max-w-[980px] overflow-hidden rounded-2xl md:grid-cols-[1fr_240px]"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
          >
            <div className="flex min-w-0 flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[19px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                    {tx('Що тобі потрібно?', 'What do you need?')}
                  </h2>
                  <p className="mt-1 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {tx('Увімкни лише те, чим будеш користуватись. Решта сховається з меню й повернеться в один клік у налаштуваннях.', 'Turn on only what you will use. The rest hides from the menu and comes back in one click in settings.')}
                  </p>
                </div>
                {!locked && <button type="button" onClick={() => close('later')} aria-label={tx('Закрити', 'Close')} className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/5" style={{ color: T.text3 }}>
                  <X size={16} />
                </button>}
              </div>

              <div className="mt-4 inline-flex self-start rounded-lg p-0.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                {PRESETS.map((p) => {
                  const on = preset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.hint}
                      onClick={() => setPicked(new Set(p.mods))}
                      className="relative rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                      style={{ fontFamily: T.sans, color: on ? T.text : T.text3 }}
                    >
                      {on && <motion.span layoutId="ws-preset" className="absolute inset-0 rounded-md" style={{ background: T.surface3 }} transition={{ duration: 0.2, ease: EASE }} />}
                      <span className="relative">{p.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {MODULES.map((m, i) => {
                  const on = picked.has(m.id);
                  const Icon = m.icon;
                  return (
                    <motion.button
                      key={m.id}
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 * i, duration: 0.25, ease: EASE }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => toggle(m.id)}
                      aria-pressed={on}
                      className="flex flex-col gap-2 rounded-xl p-3.5 text-left transition-[background,border-color] duration-200"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `rgba(${m.rgb},0.07)` : T.sunken,
                        border: `1px solid ${on ? `rgba(${m.rgb},0.5)` : T.line}`,
                      }}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-200"
                          style={{ background: on ? `rgba(${m.rgb},0.14)` : 'rgba(255,255,255,0.04)' }}
                        >
                          <Icon size={16} strokeWidth={2} style={{ color: on ? `rgb(${m.rgb})` : T.text4, transition: 'color .2s' }} />
                        </span>
                        <span className="min-w-0 flex-1 text-[14px] font-semibold" style={{ color: on ? T.text : T.text2 }}>{m.title}</span>
                        <Toggle on={on} />
                      </span>
                      <span className="text-[12.5px] leading-[18px]" style={{ color: T.text3 }}>{m.text}</span>
                      <span className="flex flex-wrap gap-1">
                        {m.routes.map((r) => (
                          <span key={r} className="rounded px-1.5 py-px text-[10.5px]" style={{ color: on ? T.text2 : T.text4, background: 'rgba(255,255,255,0.04)' }}>
                            {navItem(r)?.label || r}
                          </span>
                        ))}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" onClick={() => close('done')} className="h-9 rounded-lg px-3 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  {tx('Лишити все як є', 'Keep everything')}
                </button>
                <button
                  type="button"
                  disabled={!picked.size}
                  onClick={done}
                  className="h-9 rounded-lg px-4 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ fontFamily: T.sans, background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)' }}
                >
                  {tx('Готово', 'Done')}
                </button>
              </div>
            </div>

            {/* Живе меню: що лишиться в бічній панелі */}
            <div className="hidden p-5 md:block" style={{ borderLeft: `1px solid ${T.line}`, background: T.sunken }}>
              <div className="mb-3 flex items-baseline justify-between text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                <span>{tx('Твоє меню', 'Your menu')}</span>
                <span className="tabular-nums" style={{ color: T.text4 }}>{count}</span>
              </div>
              <LayoutGroup>
                <motion.div layout className="flex flex-col gap-2.5">
                  <AnimatePresence initial={false}>
                    {visible.map((g) => (
                      <motion.div key={g.group} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                        <motion.div layout="position" className="mb-0.5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>{g.group}</motion.div>
                        <AnimatePresence initial={false}>
                          {g.items.map((it) => {
                            const Icon = NAV_ICONS[it.icon] || FileText;
                            return (
                              <motion.div
                                key={it.to}
                                layout
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 28 }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: EASE }}
                                className="flex items-center gap-2 overflow-hidden px-1.5 text-[12.5px]"
                                style={{ fontFamily: T.sans, color: T.text2 }}
                              >
                                <Icon size={14} strokeWidth={1.8} style={{ color: T.text3 }} />
                                <span className="truncate">{it.label}</span>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
