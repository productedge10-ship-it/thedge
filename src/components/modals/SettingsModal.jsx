import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion, AnimatePresence, useMotionValue, useSpring,
} from 'framer-motion';
import {
  X, RotateCcw, Eye, EyeOff, Moon, Sun, ZapOff,
  User, Target, BookOpen, Palette, Sparkles, LayoutGrid,
  MailCheck, MailWarning, KeyRound, Loader2, Check, Send,
  Plug, HelpCircle, ArrowRight, ChevronDown,
} from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { notify } from '../../utils/notify';
import { supabase, hadAuthTokenInUrl, endRecoveryFlow } from '../../lib/supabase';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { openVerifyEmail } from '../../lib/emailGate';
import { NAV, MOTION, FX, PSY, HIDEABLE, GOALS, goalById, OPEN_EVENT } from '../../lib/settings';
import { connectMt5, watchMt5Account, readMt5Status, listMt5Accounts } from '../../lib/mt5Store';
import { THEMES } from '../../lib/themes';

/* ==================================================================
   Налаштування.

   Зліва рейка розділів, справа один блок. Довгий сувій із семи
   секцій читався як анкета: щоб дійти до розділів меню, треба було
   проїхати повз усе інше.

   Ніякої кнопки «Зберегти». Кожен перемикач діє одразу й одразу
   їде в базу — стан, який треба підтверджувати, породжує питання
   «а воно збереглось?» і жодної користі не дає.

   Геометрія (розміри, відступи, радіуси) взята з макета редизайну;
   кольори й шрифти лишаються проєктні — через токени, інакше вікно
   не пережило б перемикання теми.
================================================================== */

/* Надпис над заголовком. Він групує розділи за змістом: видно, що
   «Тема» і «Рух» — про одне й те саме, хоч і лежать окремо. */
const TABS = [
  { id: 'profile', label: 'Profile', icon: User, eyebrow: 'PERSONAL', hint: 'What we should call you' },
  { id: 'goal', label: 'Weekly goal', icon: Target, eyebrow: 'RHYTHM', hint: 'What the “Week” tile on the Launchpad shows' },
  { id: 'journal', label: 'Journal', icon: BookOpen, eyebrow: 'PRACTICE', hint: 'How many questions to ask after every trade' },
  { id: 'connect', label: 'Connections', icon: Plug, eyebrow: 'SYNC', hint: 'Connect your trading account — the trades will sync automatically' },
  { id: 'look', label: 'Theme', icon: Palette, eyebrow: 'APPEARANCE', hint: 'Light or dark — with a diagonal sweep' },
  { id: 'motion', label: 'Motion & glow', icon: Sparkles, eyebrow: 'APPEARANCE', hint: 'How much movement you can stand over six hours at a screen' },
  { id: 'menu', label: 'Sections', icon: LayoutGrid, eyebrow: 'NAVIGATION', hint: 'Hide what you don’t use — the data stays' },
];

/* ------------------------------------------------------------------
   Англійські підписи варіантів.

   Самі списки (MOTION, FX, PSY, GOALS, THEMES) лишаються українськими:
   їхні поля читає ще й Лаунчпад, і переклад у спільному місці зробив
   би там мішанину на кшталт «3 з 7 days». Тому переклад живе тут — у
   єдиному вікні, яке його показує, а зіставлення йде за id.

   Якщо в списку зʼявиться новий варіант і його забудуть додати сюди,
   впаде назад рідний підпис, а не порожнє місце.
------------------------------------------------------------------ */
const EN = {
  motion: {
    full: ['Full', 'everything moves the way it was designed'],
    calm: ['Calm', 'no background, no entrance effects'],
    off: ['Off', 'nothing moves at all'],
  },
  fx: {
    off: ['No glow', 'no halo under the cursor at all'],
    soft: ['Barely there', 'a hint you only notice if you look for it'],
    medium: ['Moderate', 'visible, but it doesn’t pull your eye'],
    full: ['Bright', 'the way it was meant to look'],
  },
  psy: {
    short: ['Short', 'the three questions the stats are built from'],
    full: ['Full', 'all seven — more material to work with'],
  },
  goal: {
    clean: ['Clean days', 'days when every trade followed the plan, with no mistakes'],
    trades: ['Trade count', 'plain volume of work for the week'],
    r: ['Result in R', 'handle with care: a profit goal nudges you into extra trades'],
    none: ['No goal', 'the tile just sums up the week'],
  },
  theme: {
    dark: ['Dark', 'the native one, for long sessions'],
    light: ['Light', 'for working in daylight'],
  },
  unit: { clean: 'days', trades: 'trades', r: 'R', none: '' },
};

/* Підпис варіанта: англійський, якщо є; інакше той, що в списку. */
const label = (group, item) => EN[group]?.[item.id]?.[0] ?? item.label;
const hintOf = (group, item) => EN[group]?.[item.id]?.[1] ?? item.hint;

/* Картка-варіант. Один опис на всі списки вибору, щоб «Ціль», «Журнал»,
   «Рух» і «Світло» не розʼїжджались на піксель. */
const cardStyle = (on) => ({
  padding: '18px 20px',
  borderRadius: 15,
  cursor: 'pointer',
  transition: 'border-color .2s ease, background .2s ease',
  border: `1px solid ${on ? `rgba(${T.accRgb},0.6)` : T.line}`,
  background: on ? `rgba(${T.accRgb},0.10)` : T.surfaceHi,
  boxShadow: on
    ? `0 0 0 1px rgba(${T.accRgb},0.12), 0 8px 24px -14px rgba(${T.accRgb},0.5)`
    : 'none',
});

const cardTitle = (on) => ({
  fontFamily: T.sans,
  fontSize: 14.5,
  fontWeight: 600,
  letterSpacing: '.1px',
  color: on ? T.acc : T.text,
});

const cardHint = {
  fontFamily: T.sans,
  marginTop: 7,
  fontSize: 13,
  lineHeight: '19px',
  color: T.text3,
};

/* Ховер лише на неактивних: підсвічувати вже обране — обіцяти дію,
   якої не станеться. */
const hoverLine = (on) => ({
  onMouseEnter: (e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; },
  onMouseLeave: (e) => { if (!on) e.currentTarget.style.borderColor = T.line; },
});

/* Чи прийшла людина сюди з листа про зміну пароля.
   Двох умов замало по одній:

   • ?newpass=1 сам по собі нічого не доводить — його дописує будь-хто
     в адресному рядку;
   • сам токен доводить, але його читає й одразу прибирає з адреси
     клієнт Supabase, тому питаємо hadAuthTokenInUrl() — воно
     запамʼятовує адресу входу ще до створення клієнта.

   Разом це те саме правило, що вже стоїть на /auth: форма зміни
   зʼявляється тільки після справжнього переходу з пошти. Рахуємо один
   раз на завантаження модуля — пізніше в адресі вже нічого не буде. */
const ARRIVED_FOR_PASSWORD = typeof window !== 'undefined'
  && hadAuthTokenInUrl()
  && new URLSearchParams(window.location.search).get('newpass') === '1';

export default function SettingsModal() {
  const s = useSettings();
  const { user, emailVerified } = useAuth();
  const navigate = useNavigate();
  /* Відкрито одразу, якщо прийшли з листа: інакше людина повернулась би
     в застосунок і не зрозуміла, куди подівся новий пароль. */
  const [open, setOpen] = useState(ARRIVED_FOR_PASSWORD);
  const [tab, setTab] = useState('profile');
  const [armed, setArmed] = useState(ARRIVED_FOR_PASSWORD);

  /* Мітку з адреси прибираємо: перезавантаження сторінки не має вдруге
     відкривати форму, а токена в сесії вже може не бути. */
  useEffect(() => {
    if (!ARRIVED_FOR_PASSWORD) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('newpass');
    const rest = params.toString();
    navigate({ pathname: window.location.pathname, search: rest ? `?${rest}` : '' }, { replace: true });
  }, [navigate]);
  const [nick, setNick] = useState(s.nickname);

  useEffect(() => { setNick(s.nickname); }, [s.nickname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hiddenCount = s.hiddenNav.length;
  const head = TABS.find((t) => t.id === tab);

  const goalType = s.goal?.type || 'clean';
  const goalMax = goalById(goalType).max;
  const goalValue = s.goal?.value ?? goalById(goalType).def;
  /* Заповнення доріжки рахуємо тут, а не в CSS: браузер не знає ні
     мінімуму, ні максимуму повзунка у відсотках. */
  const goalPct = goalMax > 1 ? ((goalValue - 1) / (goalMax - 1)) * 100 : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          className="fixed inset-0 z-[95] flex items-stretch justify-center p-0 sm:items-center sm:p-8"
          style={{ background: 'rgba(6,6,8,0.72)', backdropFilter: 'blur(14px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.995 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex w-full max-w-[1180px] overflow-hidden sm:h-[740px] sm:max-h-full"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              borderRadius: 22,
              boxShadow: '0 40px 100px -20px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(255,255,255,0.02)',
            }}
          >
            {/* ---------- рейка розділів ---------- */}
            <div
              className="hidden w-[296px] shrink-0 flex-col sm:flex"
              style={{
                padding: '34px 20px 22px 26px',
                background: T.sunken,
                borderRight: `1px solid ${T.line}`,
              }}
            >
              <div style={{ padding: '0 4px 26px 4px' }}>
                <div
                  style={{
                    fontFamily: T.display,
                    fontSize: 23,
                    fontWeight: 600,
                    letterSpacing: '-0.3px',
                    color: T.text,
                  }}
                >
                  Settings
                </div>
                <div
                  style={{
                    fontFamily: T.sans,
                    marginTop: 8,
                    fontSize: 13.5,
                    lineHeight: '20px',
                    color: T.text3,
                  }}
                >
                  Changes apply at once and follow you across devices
                </div>
              </div>

              <div className="flex flex-col" style={{ gap: 3 }}>
                {TABS.map((t) => {
                  const on = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="relative flex items-center text-left"
                      style={{
                        gap: 13,
                        height: 48,
                        padding: '0 16px',
                        borderRadius: 13,
                        transition: 'color .2s ease',
                        color: on ? T.text : T.text3,
                      }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                    >
                      {on && (
                        <motion.span
                          layoutId="set-lamp"
                          className="absolute inset-0"
                          style={{
                            borderRadius: 13,
                            background: `rgba(${T.accRgb},0.13)`,
                            boxShadow: `inset 0 0 0 1px rgba(${T.accRgb},0.28)`,
                          }}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                      <t.icon
                        size={16}
                        strokeWidth={2.2}
                        className="relative shrink-0"
                        style={{ width: 18, color: on ? T.acc : 'currentColor' }}
                      />
                      <span
                        className="relative"
                        style={{ fontFamily: T.sans, fontSize: 14.5, fontWeight: 500 }}
                      >
                        {t.label}
                      </span>
                      {t.id === 'menu' && hiddenCount > 0 && (
                        <span
                          className="relative ml-auto tabular-nums"
                          style={{
                            fontFamily: T.mono,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 6,
                            background: T.surfaceHi,
                            color: T.text3,
                          }}
                        >
                          {hiddenCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex-1" />

              {/* Той самий контакт, що на /faq: щось не працює — пиши
                  в Telegram. */}
              <a
                href="https://t.me/h1f3stt"
                target="_blank"
                rel="noreferrer"
                className="group mb-2.5 flex items-center justify-center"
                style={{
                  fontFamily: T.sans,
                  gap: 9,
                  height: 48,
                  borderRadius: 13,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: T.text2,
                  background: T.sunken,
                  border: `1px solid ${T.line}`,
                  transition: 'background .18s, border-color .18s, color .18s, transform .18s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.surfaceHi;
                  e.currentTarget.style.borderColor = T.lineHi;
                  e.currentTarget.style.color = T.text;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = T.sunken;
                  e.currentTarget.style.borderColor = T.line;
                  e.currentTarget.style.color = T.text2;
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <Send size={14} strokeWidth={2.2} style={{ color: T.acc }} />
                Message on Telegram
              </a>

              <button
                onClick={s.reset}
                className="flex items-center justify-center"
                style={{
                  fontFamily: T.sans,
                  gap: 9,
                  height: 48,
                  borderRadius: 13,
                  border: `1px solid ${T.line}`,
                  color: T.text3,
                  fontSize: 14,
                  transition: 'all .18s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = T.lineHi;
                  e.currentTarget.style.color = T.text2;
                  e.currentTarget.style.background = T.surfaceHi;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = T.line;
                  e.currentTarget.style.color = T.text3;
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <RotateCcw size={15} strokeWidth={2.2} style={{ opacity: 0.85 }} />
                Reset everything
              </button>
            </div>

            {/* ---------- вміст ---------- */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div
                className="flex shrink-0 items-start justify-between"
                style={{
                  gap: 24,
                  padding: '32px 36px 24px 40px',
                  borderBottom: `1px solid ${T.line}`,
                }}
              >
                <div className="min-w-0">
                  <div
                    style={{
                      fontFamily: T.mono,
                      fontSize: 10.5,
                      letterSpacing: '2.4px',
                      color: T.acc,
                      textTransform: 'uppercase',
                    }}
                  >
                    {head?.eyebrow}
                  </div>
                  <div
                    style={{
                      fontFamily: T.display,
                      marginTop: 11,
                      fontSize: 20,
                      fontWeight: 600,
                      letterSpacing: '-0.2px',
                      color: T.text,
                    }}
                  >
                    {head?.label}
                  </div>
                  <div style={{ fontFamily: T.sans, marginTop: 6, fontSize: 14, color: T.text3 }}>
                    {head?.hint}
                  </div>
                </div>

                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid shrink-0 place-items-center"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 11,
                    border: `1px solid ${T.line}`,
                    color: T.text3,
                    transition: 'all .18s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = T.surfaceHi;
                    e.currentTarget.style.color = T.text;
                    e.currentTarget.style.borderColor = T.lineHi;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = T.text3;
                    e.currentTarget.style.borderColor = T.line;
                  }}
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              </div>

              {/* Мобільна рейка — горизонтальним рядком, бо збоку її нема куди подіти */}
              <div
                className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-2.5 sm:hidden"
                style={{ borderBottom: `1px solid ${T.line}` }}
              >
                {TABS.map((t) => {
                  const on = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                        border: `1px solid ${on ? T.accLine : T.line}`,
                        color: on ? T.acc : T.text3,
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div
                className="custom-scrollbar min-h-0 flex-1 overflow-y-auto"
                style={{ padding: '32px 40px 40px 40px' }}
              >
                {/* ================= Профіль ================= */}
                {tab === 'profile' && (
                  <div className="flex flex-col" style={{ gap: 30, maxWidth: 760 }}>
                    <div>
                      <Label>What we should call you</Label>
                      <input
                        value={nick}
                        onChange={(e) => setNick(e.target.value)}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = T.line;
                          s.set({ nickname: nick.trim() });
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        maxLength={32}
                        placeholder="A nickname — otherwise we’ll use the start of your email"
                        className="w-full outline-none"
                        style={{
                          fontFamily: T.sans,
                          marginTop: 12,
                          height: 54,
                          padding: '0 18px',
                          borderRadius: 14,
                          border: `1px solid ${T.line}`,
                          background: T.surfaceHi,
                          color: T.text,
                          fontSize: 16,
                          transition: 'all .18s',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = T.acc; }}
                      />
                    </div>

                    {/* Місце для тих, хто закрив модалку підтвердження й
                        повернувся до неї пізніше. Без цієї секції єдиним
                        способом підтвердитись лишалось би натиснути
                        заблоковану кнопку — незрозуміло й нелогічно. */}
                    <div>
                      <Label>Email</Label>
                      <div
                        className="flex items-center"
                        style={{
                          marginTop: 12,
                          gap: 16,
                          padding: '16px 18px',
                          borderRadius: 14,
                          border: `1px solid ${T.line}`,
                          background: T.surfaceHi,
                        }}
                      >
                        <span
                          className="grid shrink-0 place-items-center"
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 12,
                            background: emailVerified === false
                              ? `rgba(${T.warnRgb},0.10)`
                              : `rgba(${T.okRgb},0.10)`,
                            border: `1px solid ${emailVerified === false
                              ? `rgba(${T.warnRgb},0.22)`
                              : `rgba(${T.okRgb},0.22)`}`,
                          }}
                        >
                          {emailVerified === false
                            ? <MailWarning size={17} strokeWidth={2.2} style={{ color: T.warn }} />
                            : <MailCheck size={17} strokeWidth={2.2} style={{ color: T.ok }} />}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div
                            className="truncate"
                            style={{ fontFamily: T.sans, fontSize: 15.5, fontWeight: 600, color: T.text }}
                          >
                            {user?.email}
                          </div>
                          <div
                            style={{
                              fontFamily: T.sans,
                              marginTop: 3,
                              fontSize: 13,
                              color: emailVerified === false ? T.warn : T.ok,
                            }}
                          >
                            {emailVerified === false ? 'Not verified' : 'Verified'}
                          </div>
                        </div>

                        {emailVerified === false && (
                          <button
                            onClick={openVerifyEmail}
                            className="shrink-0"
                            style={{
                              fontFamily: T.sans,
                              padding: '9px 14px',
                              borderRadius: 11,
                              fontSize: 13,
                              fontWeight: 600,
                              background: `rgba(${T.accRgb},0.14)`,
                              border: `1px solid ${T.lineAcc}`,
                              color: T.acc,
                              transition: 'all .18s',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.accRgb},0.22)`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = `rgba(${T.accRgb},0.14)`; }}
                          >
                            Verify
                          </button>
                        )}
                      </div>

                      {emailVerified === false && (
                        <Note>Until your email is verified you can’t create accounts or log trades.</Note>
                      )}
                    </div>

                    <PasswordBlock armed={armed} onDone={() => setArmed(false)} />
                  </div>
                )}

                {/* ================= Ціль тижня ================= */}
                {tab === 'goal' && (
                  <div style={{ maxWidth: 900 }}>
                    <Head
                      title="Goal for the week"
                      hint="What the “Week” tile on the Launchpad shows"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2" style={{ marginTop: 20, gap: 12 }}>
                      {GOALS.map((g) => {
                        const on = goalType === g.id;
                        return (
                          <button
                            key={g.id}
                            onClick={() => s.set({ goal: { type: g.id, value: on ? s.goal.value : g.def } })}
                            className="text-left"
                            style={cardStyle(on)}
                            {...hoverLine(on)}
                          >
                            <div style={cardTitle(on)}>{label('goal', g)}</div>
                            <div style={cardHint}>{hintOf('goal', g)}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Повзунок замість поля вводу: ціль на тиждень — це
                        вибір з десятка розумних значень, а не довільне
                        число, і клавіатура тут тільки заважає. */}
                    {goalType !== 'none' && (
                      <div
                        className="flex items-center"
                        style={{
                          marginTop: 14,
                          gap: 24,
                          padding: '20px 24px',
                          borderRadius: 16,
                          border: `1px solid ${T.line}`,
                          background: T.surfaceHi,
                        }}
                      >
                        <span
                          className="shrink-0"
                          style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 500, color: T.text2 }}
                        >
                          How many
                        </span>
                        <input
                          type="range"
                          min={1}
                          max={goalMax}
                          step={1}
                          value={goalValue}
                          onChange={(e) => s.set({ goal: { type: goalType, value: Number(e.target.value) } })}
                          className="edge-range min-w-0 flex-1"
                          style={{ '--p': `${goalPct}%` }}
                        />
                        <span
                          className="shrink-0 text-right tabular-nums"
                          style={{
                            fontFamily: T.mono,
                            minWidth: 78,
                            fontSize: 15,
                            letterSpacing: '.5px',
                            color: T.acc,
                          }}
                        >
                          {goalValue} {EN.unit[goalType] ?? goalById(goalType).unit}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ================= Журнал ================= */}
                {tab === 'journal' && (
                  <div style={{ maxWidth: 900 }}>
                    <Head
                      title="Trade review"
                      hint="How many questions to ask yourself after every trade"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2" style={{ marginTop: 20, gap: 12 }}>
                      {PSY.map((p) => {
                        const on = (s.psyMode || 'full') === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => s.set({ psyMode: p.id })}
                            className="text-left"
                            style={cardStyle(on)}
                            {...hoverLine(on)}
                          >
                            <div style={cardTitle(on)}>{label('psy', p)}</div>
                            <div style={cardHint}>{hintOf('psy', p)}</div>
                          </button>
                        );
                      })}
                    </div>
                    <div
                      style={{
                        fontFamily: T.sans,
                        marginTop: 18,
                        paddingLeft: 14,
                        borderLeft: `2px solid ${T.line}`,
                        fontSize: 13.5,
                        lineHeight: '21px',
                        color: T.text3,
                      }}
                    >
                      In short mode the rest of the questions stay in the trade behind a toggle — they simply stop being required.
                    </div>
                  </div>
                )}

                {/* ================= Підключення ================= */}
                {tab === 'connect' && <ConnectTab />}

                {/* ================= Тема ================= */}
                {tab === 'look' && (
                  <div style={{ maxWidth: 900 }}>
                    <Head
                      title="Theme"
                      hint="Switches with a diagonal sweep — so it doesn’t hit your eyes"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2" style={{ marginTop: 20, gap: 12 }}>
                      {THEMES.map((th) => {
                        const on = s.theme === th.id;
                        const Ico = th.id === 'light' ? Sun : Moon;
                        return (
                          <button
                            key={th.id}
                            onClick={() => !on && s.setTheme(th.id)}
                            className="flex items-center text-left"
                            style={{ ...cardStyle(on), gap: 16 }}
                            {...hoverLine(on)}
                          >
                            <span
                              className="grid shrink-0 place-items-center"
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                background: on ? `rgba(${T.accRgb},0.16)` : T.sunken,
                                color: on ? T.acc : T.text3,
                              }}
                            >
                              <Ico size={17} strokeWidth={2.2} />
                            </span>
                            <span className="min-w-0">
                              <span className="block" style={cardTitle(on)}>{label('theme', th)}</span>
                              <span
                                className="block"
                                style={{ fontFamily: T.sans, marginTop: 5, fontSize: 13, color: T.text3 }}
                              >
                                {hintOf('theme', th)}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ================= Рух і світло ================= */}
                {tab === 'motion' && (
                  <div className="flex flex-col" style={{ maxWidth: 900, gap: 34 }}>
                    <div>
                      <Head
                        title="Animation"
                        hint="How much movement you can stand over six hours at a screen"
                      />

                      {/* Окремий рубильник понад трьома режимами: коли людина
                          хоче тиші, вона хоче її одразу, а не збирати з частин */}
                      <button
                        onClick={s.killMotion}
                        className="flex w-full items-center"
                        style={{
                          fontFamily: T.sans,
                          marginTop: 20,
                          gap: 11,
                          height: 52,
                          padding: '0 20px',
                          borderRadius: 14,
                          border: `1px dashed ${T.lineHi}`,
                          background: T.sunken,
                          color: T.text2,
                          fontSize: 14.5,
                          fontWeight: 500,
                          transition: 'all .18s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = T.acc;
                          e.currentTarget.style.color = T.text;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = T.lineHi;
                          e.currentTarget.style.color = T.text2;
                        }}
                      >
                        <ZapOff size={15} strokeWidth={2.2} style={{ opacity: 0.7 }} />
                        Turn off all animation
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ marginTop: 12, gap: 12 }}>
                        {MOTION.map((m) => {
                          const on = s.motion === m.id;
                          return (
                            <button
                              key={m.id}
                              onClick={() => s.set({ motion: m.id })}
                              className="text-left"
                              style={cardStyle(on)}
                              {...hoverLine(on)}
                            >
                              <div style={cardTitle(on)}>{label('motion', m)}</div>
                              <div style={cardHint}>{hintOf('motion', m)}</div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Перемикач гасне не тільки на «вимкнених», а й на
                          «спокійних»: той режим сам по собі прибирає фон, і
                          активний тумблер поруч обіцяв би те, чого не буде. */}
                      <Toggle
                        label="Live background"
                        hint={s.motion === 'calm'
                          ? 'Calm animation already removes the background'
                          : 'Drifting dots that scatter away from the cursor'}
                        on={s.liveBg && s.motion === 'full'}
                        disabled={s.motion !== 'full'}
                        onClick={() => s.set({ liveBg: !s.liveBg })}
                      />
                    </div>

                    <div>
                      <Head
                        title="Glow under the cursor"
                        hint="A halo that follows the mouse across cards. Separate from animation — you can keep the motion and drop the glow"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ marginTop: 20, gap: 12 }}>
                        {FX.map((f) => {
                          const dead = s.motion === 'off';
                          const on = !dead && s.fx === f.id;
                          return (
                            <button
                              key={f.id}
                              onClick={() => s.set({ fx: f.id })}
                              disabled={dead}
                              className="text-left"
                              style={{
                                ...cardStyle(on),
                                opacity: dead ? 0.45 : 1,
                                cursor: dead ? 'not-allowed' : 'pointer',
                              }}
                              {...hoverLine(on || dead)}
                            >
                              <div className="flex items-center" style={{ gap: 11 }}>
                                {/* Крапка яскравості замість опису словами:
                                    різницю між «ледь помітно» і «помірно»
                                    простіше побачити, ніж прочитати. */}
                                <span
                                  className="shrink-0"
                                  style={{
                                    width: 11,
                                    height: 11,
                                    borderRadius: 99,
                                    background: f.value ? T.acc : 'transparent',
                                    border: `1px solid ${f.value ? 'transparent' : T.lineHi}`,
                                    opacity: f.value || 1,
                                    boxShadow: f.value >= 1 ? `0 0 10px rgba(${T.accRgb},0.7)` : 'none',
                                  }}
                                />
                                <div style={cardTitle(on)}>{label('fx', f)}</div>
                              </div>
                              <div style={{ ...cardHint, paddingLeft: 22 }}>{hintOf('fx', f)}</div>
                            </button>
                          );
                        })}
                      </div>

                      {s.motion === 'off' && (
                        <Note>Animation is off, so the glow stays off too. Turn motion back on to set its brightness.</Note>
                      )}
                    </div>
                  </div>
                )}

                {/* ================= Розділи ================= */}
                {tab === 'menu' && (
                  <div style={{ maxWidth: 940 }}>
                    <Head
                      title="Sections in the menu"
                      hint={hiddenCount
                        ? `${hiddenCount} hidden. Hiding deletes nothing — the data stays, only the menu item goes.`
                        : 'Hide what you don’t use. The data stays, only the menu item goes.'}
                    />

                    <div className="flex flex-col" style={{ marginTop: 28, gap: 26 }}>
                      {NAV.map((g) => (
                        <div key={g.group}>
                          <div
                            style={{
                              fontFamily: T.mono,
                              fontSize: 10.5,
                              letterSpacing: '2.4px',
                              color: T.text3,
                              textTransform: 'uppercase',
                            }}
                          >
                            {g.group}
                          </div>

                          <div className="flex flex-wrap" style={{ marginTop: 14, gap: 10 }}>
                            {g.items.map((it) => {
                              const canHide = HIDEABLE.some((h) => h.to === it.to);
                              const off = s.hiddenNav.includes(it.to);

                              return (
                                <button
                                  key={it.to}
                                  disabled={!canHide}
                                  onClick={() => s.toggleNav(it.to)}
                                  className="flex items-center"
                                  style={{
                                    fontFamily: T.sans,
                                    gap: 9,
                                    height: 44,
                                    padding: '0 16px',
                                    borderRadius: 12,
                                    fontSize: 13.5,
                                    fontWeight: 500,
                                    transition: 'all .2s ease',
                                    border: `1px solid ${T.line}`,
                                    background: off ? T.sunken : T.surfaceHi,
                                    color: off ? T.text4 : T.text,
                                    textDecoration: off ? 'line-through' : 'none',
                                    textDecorationColor: T.lineHi,
                                    cursor: canHide ? 'pointer' : 'default',
                                    opacity: canHide ? 1 : 0.55,
                                  }}
                                  onMouseEnter={(e) => { if (canHide) e.currentTarget.style.borderColor = T.lineHi; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
                                >
                                  <span style={{ display: 'grid', color: off ? T.text4 : T.acc }}>
                                    {off
                                      ? <EyeOff size={13} strokeWidth={2.3} />
                                      : <Eye size={13} strokeWidth={2.3} />}
                                  </span>
                                  {it.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------
   Зміна пароля — два кроки в одному блоці.

   Крок 1: кнопка просить лист.
   Крок 2: людина повернулась за посиланням — тут же зʼявляються два
           поля й «Зберегти».

   Поля «старий пароль» немає, і замінити ним лист не можна: рядок
   міг лишитись у чужому незакритому браузері разом із сесією, а лист
   доводить володіння скринькою. Саме тому крок 2 показується лише
   після справжнього переходу з пошти (див. ARRIVED_FOR_PASSWORD) —
   форма, доступна просто так, зводила б перевірку нанівець.

   Мінімум 6 символів — не наша вигадка, а поріг Supabase; перевіряємо
   до запиту, щоб людина не чекала відповідь заради помилки.
------------------------------------------------------------------ */
const PASS_COOLDOWN = 60;
const PASS_MIN = 6;

function PasswordBlock({ armed, onDone }) {
  const { user, sendPasswordReset } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [left, setLeft] = useState(0);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const startCooldown = (from = PASS_COOLDOWN) => {
    setLeft(from);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) { clearInterval(timer.current); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  const send = async () => {
    setSending(true);
    try {
      const { error } = await sendPasswordReset();
      if (error) throw error;
      setSent(true);
      startCooldown();
      notify.success('Email sent', `A password change link is on its way to ${user?.email}.`);
    } catch (e) {
      /* Найчастіша помилка тут — серверний ліміт Supabase на частоту
         листів. Сирий англійський текст лякає без потреби, тому
         показуємо власний відлік із числом із відповіді. */
      const raw = String(e?.message || '');
      const seconds = raw.match(/after (\d+) seconds?/i)?.[1];
      if (seconds) {
        startCooldown(Number(seconds));
        notify.error('Hold on a moment', `The next email can be sent in ${seconds} s.`);
      } else {
        notify.error('Couldn’t send it', raw || 'Try again in a minute.');
      }
    } finally {
      setSending(false);
    }
  };

  const busy = sending || left > 0;

  if (armed) return <NewPasswordForm onDone={onDone} />;

  return (
    <div>
      <Label>Password</Label>
      <div
        className="flex items-center"
        style={{
          marginTop: 12,
          gap: 16,
          padding: '16px 18px',
          borderRadius: 14,
          border: `1px solid ${T.line}`,
          background: T.surfaceHi,
        }}
      >
        <span
          className="grid shrink-0 place-items-center"
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: sent ? `rgba(${T.okRgb},0.10)` : `rgba(${T.accRgb},0.10)`,
            border: `1px solid ${sent ? `rgba(${T.okRgb},0.22)` : `rgba(${T.accRgb},0.22)`}`,
          }}
        >
          {sent
            ? <Check size={17} strokeWidth={2.4} style={{ color: T.ok }} />
            : <KeyRound size={17} strokeWidth={2.2} style={{ color: T.acc }} />}
        </span>

        <div className="min-w-0 flex-1">
          <div style={{ fontFamily: T.sans, fontSize: 15.5, fontWeight: 600, color: T.text }}>
            {sent ? 'Email sent' : 'Change password'}
          </div>
          <div style={{ fontFamily: T.sans, marginTop: 3, fontSize: 13, color: T.text3 }}>
            {sent
              ? 'Open the link from the email and set a new password'
              : 'We’ll send a link to your email'}
          </div>
        </div>

        <button
          onClick={send}
          disabled={busy}
          className="flex shrink-0 items-center"
          style={{
            fontFamily: T.sans,
            gap: 7,
            padding: '9px 14px',
            borderRadius: 11,
            fontSize: 13,
            fontWeight: 600,
            background: busy ? 'transparent' : `rgba(${T.accRgb},0.14)`,
            border: `1px solid ${busy ? T.line : T.lineAcc}`,
            color: busy ? T.text3 : T.acc,
            cursor: busy ? 'default' : 'pointer',
            transition: 'all .18s',
          }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = `rgba(${T.accRgb},0.22)`; }}
          onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = `rgba(${T.accRgb},0.14)`; }}
        >
          {sending && <Loader2 size={13} className="animate-spin" />}
          {left > 0
            ? `Again in ${left} s`
            : sending
              ? 'Sending…'
              : sent ? 'Send again' : 'Send the link'}
        </button>
      </div>

      {sent && (
        <Note>
          No email? Check the Spam folder. Your current password keeps working
          until a new one is set.
        </Note>
      )}
    </div>
  );
}

/* Крок 2: власне форма. Два поля й кнопка — рівно те, заради чого
   людина клікнула посилання. */
function NewPasswordForm({ onDone }) {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  /* Про розбіжність мовчимо, доки друге поле не почали заповнювати:
     підпис «не збігаються» на порожньому полі — докір ні за що. */
  const mismatch = pass2.length > 0 && pass !== pass2;
  const tooShort = pass.length > 0 && pass.length < PASS_MIN;
  const ready = pass.length >= PASS_MIN && pass === pass2 && !saving;

  const save = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setErr('');
    try {
      /* Сесію сюди приніс токен із листа — окремо нічого підставляти
         не треба, updateUser працює з поточною. */
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) throw error;
      endRecoveryFlow();
      notify.success('Password changed', 'Use the new one next time you sign in.');
      onDone();
    } catch (e2) {
      const raw = String(e2?.message || '');
      /* Supabase відмовляє, якщо новий пароль дорівнює старому. Сирий
         англійський текст тут нічого не пояснює. */
      setErr(/should be different/i.test(raw)
        ? 'That’s the password you already have. Pick a different one.'
        : raw || 'Couldn’t save it. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (invalid) => ({
    fontFamily: T.sans,
    height: 54,
    padding: '0 46px 0 18px',
    borderRadius: 14,
    border: `1px solid ${invalid ? `rgba(${T.badRgb},0.55)` : T.line}`,
    background: T.surfaceHi,
    color: T.text,
    fontSize: 16,
    transition: 'border-color .18s',
  });

  return (
    <form onSubmit={save}>
      <Label>New password</Label>

      <div
        style={{
          marginTop: 12,
          padding: '18px 20px 20px',
          borderRadius: 16,
          border: `1px solid ${T.lineAcc}`,
          background: `rgba(${T.accRgb},0.06)`,
        }}
      >
        <div className="flex items-center" style={{ gap: 11 }}>
          <KeyRound size={15} strokeWidth={2.2} style={{ color: T.acc, flex: 'none' }} />
          <span style={{ fontFamily: T.sans, fontSize: 13.5, color: T.text2, lineHeight: '20px' }}>
            Link confirmed — set your new password
          </span>
        </div>

        <div className="relative" style={{ marginTop: 16 }}>
          <input
            type={show ? 'text' : 'password'}
            value={pass}
            autoFocus
            autoComplete="new-password"
            onChange={(e) => { setPass(e.target.value); setErr(''); }}
            placeholder={`New password — ${PASS_MIN} characters or more`}
            className="w-full outline-none"
            style={field(tooShort)}
            onFocus={(e) => { if (!tooShort) e.currentTarget.style.borderColor = T.acc; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = tooShort ? `rgba(${T.badRgb},0.55)` : T.line; }}
          />
          {/* Око одне на обидва поля: вони мають збігатись, і ховати
              одне, показуючи інше, сенсу не має. */}
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute grid place-items-center"
            style={{
              right: 8, top: 8, width: 38, height: 38,
              borderRadius: 10, color: T.text3, transition: 'color .18s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
          >
            {show ? <EyeOff size={16} strokeWidth={2.2} /> : <Eye size={16} strokeWidth={2.2} />}
          </button>
        </div>

        <input
          type={show ? 'text' : 'password'}
          value={pass2}
          autoComplete="new-password"
          onChange={(e) => { setPass2(e.target.value); setErr(''); }}
          placeholder="Once more, to be sure"
          className="w-full outline-none"
          style={{ ...field(mismatch), marginTop: 10, paddingRight: 18 }}
          onFocus={(e) => { if (!mismatch) e.currentTarget.style.borderColor = T.acc; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = mismatch ? `rgba(${T.badRgb},0.55)` : T.line; }}
        />

        {(mismatch || tooShort || err) && (
          <div style={{ fontFamily: T.sans, marginTop: 10, fontSize: 13, color: T.bad, lineHeight: '19px' }}>
            {err || (tooShort ? `Too short — ${PASS_MIN} characters minimum.` : 'The passwords don’t match.')}
          </div>
        )}

        <button
          type="submit"
          disabled={!ready}
          className="flex w-full items-center justify-center"
          style={{
            fontFamily: T.sans,
            marginTop: 14,
            gap: 8,
            height: 48,
            borderRadius: 13,
            fontSize: 14.5,
            fontWeight: 600,
            background: ready ? T.acc : T.surfaceHi,
            border: `1px solid ${ready ? T.acc : T.line}`,
            color: ready ? 'var(--edge-on-acc, #0A0A0C)' : T.text4,
            cursor: ready ? 'pointer' : 'default',
            transition: 'all .18s',
          }}
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {saving ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </form>
  );
}

/* Заголовок секції всередині вкладки. */
function Head({ title, hint }) {
  return (
    <>
      <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 600, color: T.text }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontFamily: T.sans, marginTop: 6, fontSize: 14, lineHeight: '21px', color: T.text3 }}>
          {hint}
        </div>
      )}
    </>
  );
}

/* Підпис над полем — дрібніший за заголовок секції, бо стосується
   одного елемента, а не блоку. */
function Label({ children }) {
  return (
    <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, letterSpacing: '.2px', color: T.text2 }}>
      {children}
    </div>
  );
}

function Note({ children }) {
  return (
    <p style={{ fontFamily: T.sans, marginTop: 10, fontSize: 13, lineHeight: '20px', color: T.text3 }}>
      {children}
    </p>
  );
}

function Toggle({ label, hint, on, disabled, onClick }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      className="flex items-center"
      style={{
        marginTop: 12,
        gap: 24,
        padding: '18px 22px',
        borderRadius: 14,
        border: `1px solid ${T.line}`,
        background: T.surfaceHi,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <div className="min-w-0 flex-1">
        <div style={{ fontFamily: T.sans, fontSize: 14.5, fontWeight: 600, color: T.text }}>
          {label}
        </div>
        <div style={{ fontFamily: T.sans, marginTop: 4, fontSize: 13, color: T.text3 }}>
          {hint}
        </div>
      </div>

      <div
        className="flex shrink-0"
        style={{
          width: 52,
          height: 30,
          borderRadius: 99,
          padding: 3,
          background: on ? T.acc : T.lineHi,
          justifyContent: on ? 'flex-end' : 'flex-start',
          transition: 'background .22s ease',
        }}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 99,
            background: on ? '#fff' : T.text3,
          }}
        />
      </div>
    </div>
  );
}

/* ==================================================================
   Підключення торгового рахунку.

   Платформи дві, робоча поки одна. cTrader лишили на видноті
   навмисно: якщо прибрати картку зовсім, перше питання в підтримку
   буде саме про нього — а так видно, що про нього памʼятають.

   Картка MT5 не відкриває вікно поверх вікна, а розгортається на
   місці. Три поля не варті окремої модалки, а коли вони виростають
   із самої картки, видно, що це те саме, на що щойно натиснув.

   Сцена зібрана в логіці сторінки 404: прожектор за курсором, сітка
   з крапок під ним і нахил картки в бік миші. Це єдине місце в
   налаштуваннях, де людина буває раз — тут видовище доречне, на
   відміну від списків, куди заходять щодня.

   Картка при цьому лишається на місці: нахил іде навколо її власного
   центру, без зсуву й без стрибка сусідів. Рухома під мишею верстка
   втомлює, нахил — ні.

   Усе святкове живе під прапорцем «повний рух» із налаштувань. У
   режимах calm/off лишаються тільки статичні кольори.
================================================================== */

/* Висота картки задана числом, а не вмістом.

   Через вміст вона рахувалась по-різному: у MT5 знизу таблетка,
   у cTrader — рядок тексту, і картки виходили різної висоти. Гірше
   те, що при закритті форми MT5 на мить лишався без нижнього блока,
   просідав і відростав назад — саме це й читалось як стрибок. Число
   знімає обидва випадки разом. */
const CARD_H = 260;

const TILT_SPRING = { stiffness: 170, damping: 15, mass: 0.5 };
const HOVER_SPRING = { type: 'spring', stiffness: 260, damping: 24, mass: 0.6 };

/* Знак платформи.

   Файли лежать у public/platforms і підключаються адресою, а не
   import'ом: якщо котрогось немає, збірка не падає — просто
   вмикається запасна геометрія нижче. Це важливо, бо логотипи
   докладає людина, а не репозиторій.

   Тільки svg: png-версії логотипів ідуть із білою підкладкою, і на
   темній плитці це читається як білий квадрат, а не як знак. */
const MARK_SRC = {
  mt5: '/platforms/mt5.svg',
  ctrader: '/platforms/ctrader.svg',
};

function PlatformMark({ kind, hot, big }) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : MARK_SRC[kind];
  const size = big ? 64 : 56;

  return (
    <motion.span
      className="relative grid shrink-0 place-items-center overflow-hidden"
      animate={{ scale: hot ? 1.07 : 1, rotate: hot ? -3 : 0 }}
      transition={HOVER_SPRING}
      style={{
        width: size,
        height: size,
        borderRadius: 18,
        background: T.sunken,
        border: `1px solid ${hot ? T.lineHi : T.line}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: 'border-color .25s ease',
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: size - 22, height: size - 22, display: 'block', objectFit: 'contain' }}
        />
      ) : (
        /* Запасний знак: узагальнена графіка ринку, поки файл не
           поклали в public/platforms. */
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ color: T.text3 }}>
          <rect x="4" y="15" width="4.6" height="8" rx="1.6" fill="currentColor" opacity="0.45" />
          <rect x="11.7" y="10" width="4.6" height="13" rx="1.6" fill="currentColor" opacity="0.72" />
          <rect x="19.4" y="5" width="4.6" height="18" rx="1.6" fill="currentColor" />
        </svg>
      )}
    </motion.span>
  );
}

/* Рамка, що обертається. Живе тільки поки курсор на картці — інакше
   у вікні налаштувань постійно крутився б requestAnimationFrame. */
function GlowRing({ rgb }) {
  return (
    <motion.span
      className="pointer-events-none absolute"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{ inset: -1, borderRadius: 19, overflow: 'hidden' }}
    >
      <motion.span
        className="absolute"
        animate={{ rotate: 360 }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
        style={{
          left: '50%',
          top: '50%',
          width: '190%',
          aspectRatio: '1 / 1',
          translateX: '-50%',
          translateY: '-50%',
          background: `conic-gradient(from 0deg, transparent 0deg, rgba(${rgb},0.85) 40deg, rgba(${T.accRgb},0.55) 80deg, transparent 150deg, transparent 360deg)`,
        }}
      />
    </motion.span>
  );
}

/* Поле форми.

   Підпис стоїть над рамкою, а не плейсхолдером усередині:
   плейсхолдер зникає з першим символом, і людина, яка відволіклась
   на кабінет пропа, повертається до трьох однакових рядків і не
   памʼятає, який з них який. */
const FIELD = {
  fontFamily: T.sans,
  height: 50,
  width: '100%',
  borderRadius: 14,
  border: `1px solid ${T.line}`,
  background: T.sunken,
  color: T.text,
  fontSize: 14.5,
  transition: 'border-color .18s, box-shadow .18s',
};

const fieldOn = (e) => {
  e.currentTarget.style.borderColor = T.acc;
  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(${T.accRgb},0.12)`;
};

const fieldOff = (e) => {
  e.currentTarget.style.borderColor = T.line;
  e.currentTarget.style.boxShadow = 'none';
};

/* Автозаповнення тут шкідливе: браузер пхає пошту й пароль від
   самого застосунку в поля, куди треба чужі дані від терміналу.
   Одного autoComplete="off" мало — Chrome його ігнорує на полях,
   схожих на логін, тому глушимо ще й менеджери паролів. */
const NO_FILL = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': '',
  'data-form-type': 'other',
};

/* Кнопка в Telegram.

   У спокої це кружечок з літачком — синій знак месенджера впізнають
   без підпису, а капсом набраний рядок «MESSAGE ON TELEGRAM» ламав
   типографіку всієї форми. Підпис виїжджає на ховері: хто не впізнав
   іконку — прочитає, хто впізнав — не бачить зайвого тексту. */
/* Напис завжди на місці, а не зʼявляється на ховері.

   Це кнопка всередині вже розкритої панелі допомоги — людина розкрила
   її саме тому, що застрягла, і читати намір з наведення миші тут
   зайве: на телефоні наведення взагалі не існує, і напис мав би не
   зʼявитися ніколи. Тому це звичайна кнопка з текстом, а жвавість —
   у легкому підйомі й тіні на ховері, не в тому, що ховається текст.

   Колір — темний, на токенах картки, а не фірмовий синій Telegram:
   яскрава пляма посеред приглушеної форми зчитувалась як реклама,
   а не як спокійний вихід «написати нам». Впізнати дію можна і без
   бренд-кольору — іконка літака вже все каже. */
function TelegramButton({ label = 'Message us on Telegram' }) {
  const [hot, setHot] = useState(false);

  return (
    <a
      href="https://t.me/h1f3stt"
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      className="inline-flex items-center"
      style={{
        gap: 10,
        height: 42,
        padding: '0 18px 0 8px',
        borderRadius: 999,
        background: hot ? T.surfaceHi : T.sunken,
        border: `1px solid ${hot ? T.lineHi : T.line}`,
        color: hot ? T.text : T.text2,
        transform: hot ? 'translateY(-1px)' : 'none',
        transition: 'background .25s ease, border-color .25s ease, color .25s ease, transform .25s ease',
      }}
    >
      <span
        className="grid shrink-0 place-items-center"
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          background: `rgba(${T.accRgb},0.14)`,
          color: T.acc,
        }}
      >
        <Send size={14} strokeWidth={2.3} />
      </span>
      <span
        className="whitespace-nowrap"
        style={{ fontFamily: T.sans, fontSize: 13.5, fontWeight: 700, letterSpacing: '-.01em' }}
      >
        {label}
      </span>
    </a>
  );
}

/* Результат перевірки підключення.

   Весь сенс цієї панелі — не змушувати людину гадати. Рядок у базі
   перевіряє VPS, і поки він мовчить, у формі має бути видно, що
   процес іде; коли відповів — що саме сталось, людською мовою, а не
   «status: error». Текст помилки приходить з термінала як є: «invalid
   account», «no connection» — це найкорисніше, що можна показати. */
const SYNC_STATE = {
  checking: {
    rgb: () => T.accRgb,
    title: 'Checking the connection…',
    text: 'Logging into the terminal. Usually a few seconds.',
  },
  slow: {
    rgb: () => T.warnRgb,
    title: 'Still checking',
    text: 'Taking longer than usual. You can close this — the result will be here when you come back.',
  },
  ok: {
    rgb: () => T.okRgb,
    title: 'Connected',
    text: 'Your trades will start arriving with the next sync.',
  },
  fail: {
    rgb: () => T.badRgb,
    title: 'Couldn’t connect',
    text: null,
  },
};

function SyncStatus({ phase, msg, onRetry, onDone }) {
  const v = SYNC_STATE[phase] || SYNC_STATE.checking;
  const rgb = v.rgb();
  const waiting = phase === 'checking' || phase === 'slow';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="flex items-start"
      style={{
        gap: 13,
        marginTop: 4,
        padding: 18,
        borderRadius: 16,
        border: `1px solid rgba(${rgb},0.28)`,
        background: `rgba(${rgb},0.07)`,
      }}
    >
      <span
        className="grid shrink-0 place-items-center"
        style={{ width: 34, height: 34, borderRadius: 11, background: `rgba(${rgb},0.14)`, color: `rgb(${rgb})` }}
      >
        {waiting && <Loader2 size={16} className="animate-spin" />}
        {phase === 'ok' && <Check size={16} strokeWidth={2.6} />}
        {phase === 'fail' && <X size={16} strokeWidth={2.6} />}
      </span>

      <div className="min-w-0 flex-1">
        <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 700, color: T.text }}>
          {v.title}
        </div>
        <p
          style={{
            fontFamily: T.sans,
            marginTop: 5,
            fontSize: 13,
            lineHeight: '19px',
            color: T.text3,
            wordBreak: 'break-word',
          }}
        >
          {v.text || msg}
        </p>

        {(phase === 'fail' || phase === 'ok') && (
          <button
            type="button"
            onClick={phase === 'fail' ? onRetry : onDone}
            style={{
              marginTop: 12,
              height: 36,
              padding: '0 16px',
              borderRadius: 11,
              fontFamily: T.sans,
              fontSize: 13,
              fontWeight: 600,
              border: `1px solid ${T.line}`,
              background: T.sunken,
              color: T.text2,
              transition: 'all .18s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
          >
            {phase === 'fail' ? 'Try again' : 'Done'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function FormField({ label, hint, children }) {
  return (
    <label className="relative block">
      <span
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 8,
          fontFamily: T.sans,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.09em',
          textTransform: 'uppercase',
          color: T.text4,
        }}
      >
        {label}
        {hint && (
          <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: T.text4 }}>
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

/* Проп-фірми.

   Список потрібен не для краси: у кожного пропа своя збірка терміналу,
   і тільки вона знає адреси його серверів. Загальний MetaTrader 5 з
   сайту розробника про «FTMO-Server5» не чув узагалі. Тому вибір пропа
   тут — це насправді вибір терміналу, який воркер підніме на VPS.

   `tint` — не фірмовий колір, а наша підкладка під монограму, поки
   логотип не поклали у public/props. Самі логотипи докладає людина:
   лежать вони як /props/<id>.svg і підтягуються адресою, тож брак
   файлу нічого не ламає — вмикається монограма. */
const BROKERS = [
  { id: 'ftmo',        name: 'FTMO',             tint: '#2f6fdb' },
  { id: 'fundingpips', name: 'FundingPips',      tint: '#1f9d6b' },
  { id: 'fundednext',  name: 'FundedNext',       tint: '#e0803a' },
  { id: 'the5ers',     name: 'The5ers',          tint: '#4a7de0' },
  { id: 'e8',          name: 'E8 Markets',       tint: '#c9a23f' },
  { id: 'goat',        name: 'Goat Funded Trader', tint: '#8f5ad6' },
  { id: 'brightfunded', name: 'BrightFunded',    tint: '#3fb9a8' },
  { id: 'alphacapital', name: 'Alpha Capital',   tint: '#c2504e' },
  { id: 'fxify',       name: 'FXIFY',            tint: '#5b73e8' },
  { id: 'dnafunded',   name: 'DNA Funded',       tint: '#3f9dc9' },
  { id: 'aquafunded',  name: 'AquaFunded',       tint: '#2f97c4' },
  { id: 'atlasfunded', name: 'Atlas Funded',     tint: '#b98a4a' },
  { id: 'other',       name: 'Another firm',     tint: '#6b6b78' },
];

const brokerById = (id) => BROKERS.find((b) => b.id === id) || BROKERS[BROKERS.length - 1];

/* Знак пропа. Файл або монограма — третього не дано, і саме тому
   картинка ніколи не залишає порожню дірку в рядку списку. */
function BrokerMark({ broker, size = 26 }) {
  const [broken, setBroken] = useState(false);

  /* Скидаємо помилку при зміні пропа: інакше один відсутній логотип
     назавжди вимикав би картинку для всіх наступних. */
  useEffect(() => setBroken(false), [broker.id]);

  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: broken ? `${broker.tint}22` : T.sunken,
        border: `1px solid ${broken ? `${broker.tint}55` : T.line}`,
      }}
    >
      {broken ? (
        <span
          style={{
            fontFamily: T.sans,
            fontSize: size * 0.42,
            fontWeight: 800,
            letterSpacing: '-.02em',
            color: broker.tint,
          }}
        >
          {broker.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <img
          src={`/props/${broker.id}.svg`}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: size - 8, height: size - 8, objectFit: 'contain', display: 'block' }}
        />
      )}
    </span>
  );
}

/* Вибір пропа.

   Свій список, а не <select>: нативний випадний список у Windows
   малює сама система, темну тему ігнорує і картинки в рядках не
   вміє — а тут вони половина сенсу. */
function BrokerPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const current = brokerById(value);

  /* Клік повз список має його закривати. Слухаємо документ, а не
     onBlur кнопки: onBlur спрацьовує раніше за клік по рядку, і вибір
     не встигав би зареєструватись. */
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center outline-none"
        style={{
          ...FIELD,
          gap: 11,
          padding: '0 14px',
          borderColor: open ? T.acc : T.line,
          boxShadow: open ? `0 0 0 3px rgba(${T.accRgb},0.12)` : 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <BrokerMark broker={current} />
        <span className="min-w-0 flex-1 truncate" style={{ color: T.text }}>
          {current.name}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          style={{ color: T.text4, display: 'grid' }}
        >
          <ChevronDown size={16} strokeWidth={2.4} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute left-0 right-0 z-30 overflow-y-auto"
            style={{
              top: 'calc(100% + 8px)',
              maxHeight: 244,
              padding: 6,
              borderRadius: 16,
              border: `1px solid ${T.lineHi}`,
              background: T.surfaceHi,
              boxShadow: '0 24px 60px -20px rgba(0,0,0,0.75)',
              transformOrigin: 'top',
            }}
          >
            {BROKERS.map((b) => {
              const on = b.id === value;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { onChange(b.id); setOpen(false); }}
                  className="flex w-full items-center"
                  style={{
                    gap: 11,
                    padding: '9px 10px',
                    borderRadius: 11,
                    fontFamily: T.sans,
                    fontSize: 14,
                    color: on ? T.text : T.text2,
                    background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                    textAlign: 'left',
                    transition: 'background .15s, color .15s',
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.sunken; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <BrokerMark broker={b} size={24} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {on && <Check size={15} strokeWidth={2.6} style={{ color: T.acc, flexShrink: 0 }} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Уже підключені рахунки.

   Вузький рядок під карткою, а не окремий розділ зі списком: людині
   треба знати, що рахунок на місці й котрий саме, і на цьому все.
   Керування підключенням живе у формі вище. */
const LINK_STATE = {
  active:  { c: T.ok,   label: 'connected' },
  pending: { c: T.warn, label: 'checking' },
  error:   { c: T.bad,  label: 'failed' },
};

function LinkedAccounts({ tick }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    listMt5Accounts()
      .then((data) => { if (alive) setRows(data.filter((r) => r.platform === 'mt5')); })
      /* Мовчки: це довідкова смужка, і якщо база не відповіла, краще
         її не показати, ніж лякати людину помилкою в налаштуваннях. */
      .catch(() => {});
    return () => { alive = false; };
  }, [tick]);

  if (!rows.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex flex-col"
      style={{ gap: 6 }}
    >
      {rows.map((r) => <LinkedRow key={r.id} row={r} />)}
    </motion.div>
  );
}

function LinkedRow({ row }) {
  const [hot, setHot] = useState(false);
  const ref = useRef(null);
  const st = LINK_STATE[row.status] || LINK_STATE.pending;
  const broker = brokerById(row.broker);

  /* Світло йде за курсором, сам рядок лишається на місці. Рух дрібного
     елемента у списку читається як збій верстки, а не як відповідь на
     наведення — тому реагує тільки підсвітка. */
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - b.left}px`);
    el.style.setProperty('--my', `${e.clientY - b.top}px`);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      className="relative flex items-center overflow-hidden"
      style={{
        gap: 9,
        padding: '9px 13px',
        borderRadius: 12,
        border: `1px solid ${hot ? T.lineHi : T.line}`,
        background: T.sunken,
        transition: 'border-color .25s ease',
      }}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(190px circle at var(--mx, 50%) var(--my, 50%), rgba(${T.accRgb},0.10), transparent 68%)`,
          opacity: hot ? 1 : 0,
          transition: 'opacity .3s ease',
        }}
      />

      <BrokerMark broker={broker} size={20} />

      <span
        className="relative shrink-0 tabular-nums"
        style={{ fontFamily: T.mono, fontSize: 12.5, color: hot ? T.text : T.text2, transition: 'color .25s' }}
      >
        {row.login}
      </span>
      <span className="relative" style={{ color: T.text4, fontSize: 12 }}>·</span>
      <span
        className="relative min-w-0 flex-1 truncate"
        style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text3 }}
      >
        {row.server}
      </span>

      <span
        className="relative flex shrink-0 items-center"
        style={{ gap: 6 }}
      >
        <motion.span
          className="rounded-full"
          style={{ width: 6, height: 6, background: st.c }}
          /* Пульс лише поки триває перевірка: анімація, що не
             закінчується, перестає щось означати. */
          animate={row.status === 'pending'
            ? { opacity: [1, 0.35, 1], scale: [1, 0.82, 1] }
            : { opacity: 1, scale: 1 }}
          transition={row.status === 'pending'
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }}
        />
        <span
          style={{
            fontFamily: T.sans,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: st.c,
          }}
        >
          {st.label}
        </span>
      </span>
    </div>
  );
}

function ConnectTab() {
  const s = useSettings();
  const fancy = (s.motion || 'full') === 'full';
  const [open, setOpen] = useState(false);

  /* Ховер тримаємо тут, а не в картці: сусідка має відступити на
     задній план, а для цього їй треба знати, що наведено не на неї. */
  const [hover, setHover] = useState(null);

  /* Лічильник перечитування списку. Смужка під карткою має оновитись
     рівно тоді, коли воркер підтвердив рахунок, — не раніше. */
  const [tick, setTick] = useState(0);

  /* alignItems: start, а не розтягування на висоту рядка.

     Інакше при закритті форми виходить таке: MT5 ще згортається і
     рядок сітки поки високий, cTrader у цю мить монтується назад і
     слухняно тягнеться на всю його висоту — а через мить падає до
     своєї. Збоку це читається як стрибок. Коли кожна картка тримає
     власну висоту, стрибати нема чому. */
  return (
    <div
      className={`grid grid-cols-1 ${open ? '' : 'sm:grid-cols-2'}`}
      style={{ gap: 18, alignItems: 'start' }}
    >
      <div className="flex flex-col" style={{ gap: 10 }}>
        <Mt5Card
          fancy={fancy}
          open={open}
          faded={hover === 'ct'}
          onHover={setHover}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          onSaved={() => setTick((n) => n + 1)}
        />
        <LinkedAccounts tick={tick} />
      </div>
      <AnimatePresence initial={false}>
        {!open && (
          <SoonCard key="ctrader" faded={hover === 'mt5'} onHover={setHover} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Mt5Card({ fancy, open, faded, onHover, onOpen, onClose, onSaved }) {
  const [broker, setBroker] = useState('ftmo');
  const [server, setServer] = useState('');
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);

  /* form → checking → ok | fail | slow.

     «slow» — це не помилка, а чесне «ще перевіряємо». Воно зʼявляється,
     коли за 45 секунд відповіді немає: краще сказати людині, що можна
     піти, ніж крутити спінер, який нічого не означає. */
  const [phase, setPhase] = useState('form');
  const [failMsg, setFailMsg] = useState('');

  const watchRef = useRef(null);
  const timerRef = useRef(null);

  const stopWatch = () => {
    if (watchRef.current) { watchRef.current(); watchRef.current = null; }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  /* Закрили вікно посеред перевірки — канал і таймер мають піти
     разом з ним. */
  useEffect(() => stopWatch, []);

  /* Нахил рахуємо від локальних координат курсора в картці. Кут
     навмисно маленький: на 9° картка читається як предмет, на 20° —
     як атракціон. */
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, TILT_SPRING);
  const sry = useSpring(ry, TILT_SPRING);

  const onMove = (e) => {
    if (!fancy || open) return;
    const r = e.currentTarget.getBoundingClientRect();
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 9);
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 12);
  };

  const enter = () => { if (!open) { setHot(true); onHover('mt5'); } };
  const rest = () => { rx.set(0); ry.set(0); setHot(false); onHover(null); };

  /* Розкрили форму — нахил зняти. Інакше кут, у якому курсор застав
     картку на кліку, лишається назавжди, і поля вводу стоять косо.

     Згорнули — прибрати за собою: канал Realtime закрити, а форму
     повернути в початковий стан, щоб наступного разу вона не
     відкрилась зі старим «Connected» чи чужою помилкою. */
  useEffect(() => {
    if (open) {
      rx.set(0);
      ry.set(0);
      setHot(false);
    } else {
      stopWatch();
      setPhase('form');
      setFailMsg('');
    }
  }, [open, rx, ry]);

  const ready = server.trim().length > 1 && login.trim().length > 2 && pass.length > 3;

  /* Прийшла відповідь від воркера. */
  const settle = (row) => {
    if (row.status === 'active') {
      /* Пароль більше не потрібен — прибираємо зі стану. Раніше він
         чистився одразу після збереження, але тоді людина з невірною
         назвою сервера мусила передруковувати його при кожній спробі. */
      setPass('');
      setPhase('ok');
      stopWatch();
      onSaved?.();
    } else if (row.status === 'error') {
      setFailMsg(row.last_error || 'Couldn’t log in with these details.');
      setPhase('fail');
      stopWatch();
    }
  };

  /* Пароль шифрується публічним ключем ще в браузері — у базу йде
     тільки шифротекст. Далі чекаємо на вердикт VPS. */
  const connect = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setFailMsg('');

    try {
      const id = await connectMt5({ broker, server, login, password: pass });
      setPhase('checking');
      stopWatch();
      watchRef.current = watchMt5Account(id, settle);

      timerRef.current = setTimeout(async () => {
        try {
          const row = await readMt5Status(id);
          if (row.status === 'pending') setPhase('slow');
          else settle(row);
        } catch {
          setPhase('slow');
        }
      }, 45000);
    } catch (e) {
      setFailMsg(e?.message || 'Couldn’t save it.');
      setPhase('fail');
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    stopWatch();
    setFailMsg('');
    setPhase('form');
  };

  return (
    <motion.div
      layout
      transition={{ duration: 0.42, ease: EASE }}
      style={{ borderRadius: 20 }}
    >
      {/* Зовнішній шар відповідає тільки за розкладку, внутрішній —
          за ховер. Якби layout і scale жили на одному елементі, вони
          билися б за transform, і картка сіпалась би при відкритті. */}
      <motion.div
        onClick={open ? undefined : onOpen}
        onMouseMove={onMove}
        onMouseEnter={enter}
        onMouseLeave={rest}
        className="group relative"
        animate={{
          scale: hot ? 1.025 : faded ? 0.975 : 1,
          opacity: faded ? 0.5 : 1,
        }}
        transition={HOVER_SPRING}
        style={{
          borderRadius: 20,
          cursor: open ? 'default' : 'pointer',
          rotateX: srx,
          rotateY: sry,
          transformPerspective: 1100,
          transformStyle: 'preserve-3d',
        }}
      >
        <AnimatePresence>{hot && fancy && <GlowRing key="ring" rgb={T.infoRgb} />}</AnimatePresence>

      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          borderRadius: 20,
          border: `1px solid ${open || hot ? T.lineHi : T.line}`,
          background: `linear-gradient(165deg, ${T.surfaceHi} 0%, ${T.surface} 100%)`,
          padding: 26,
          height: open ? 'auto' : CARD_H,
          transition: 'border-color .25s ease',
          transformStyle: 'preserve-3d',
        }}
      >
        <motion.div layout="position" className="relative" style={{ transform: 'translateZ(26px)' }}>
          <div className="flex items-start justify-between" style={{ gap: 14 }}>
            <PlatformMark kind="mt5" hot={hot} big />

            {open && (
              <button
                onClick={onClose}
                className="grid shrink-0 place-items-center"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: `1px solid ${T.line}`,
                  color: T.text3,
                  transition: 'all .18s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>

          <motion.div
            animate={{ x: hot ? 4 : 0 }}
            transition={HOVER_SPRING}
            style={{ marginTop: 22 }}
          >
            <div
              style={{
                fontFamily: T.display,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-.02em',
                color: T.text,
              }}
            >
              MetaTrader 5
            </div>
            <div style={{ fontFamily: T.sans, marginTop: 5, fontSize: 13.5, color: T.text3 }}>
              Login, password and server
            </div>
          </motion.div>
        </motion.div>

      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE, delay: 0.06 }}
            className="relative flex flex-col"
            style={{ gap: 14, marginTop: 22 }}
          >
            {/* Знак терміналу великим планом у кутку форми: видно, до
                чого саме підключаєшся, навіть коли шапка з логотипом
                вже поїхала вгору під час прокрутки. */}
            <img
              src="/platforms/mt5.svg"
              alt=""
              aria-hidden
              className="pointer-events-none absolute"
              style={{ right: -24, bottom: -26, width: 170, opacity: 0.05 }}
            />

            <span style={{ height: 1, background: T.line, marginBottom: 2 }} />

            {/* Проп стоїть найпершим, бо від нього залежить усе інше:
                кожна фірма має власну збірку терміналу, і сервери вона
                знає тільки свої. Помилитись тут — значить отримати
                «сервер не знайдено» з правильно введеною назвою. */}
            <FormField label="Prop firm">
              <BrokerPicker value={broker} onChange={setBroker} />
            </FormField>

            <FormField label="Server">
              <input
                {...NO_FILL}
                name="edge-mt5-server"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                className="edge-field outline-none"
                style={{ ...FIELD, padding: '0 16px' }}
                onFocus={fieldOn}
                onBlur={fieldOff}
              />
            </FormField>

            {/* Знак питання — окремим рядком під полями, а не всередині
                інпута: там він читався як частина поля вводу, а не як
                питання про форму в цілому. Одна кнопка на всі три
                причини застрягти, бо людина в цей момент ще не знає,
                котра саме її причина. */}
            <button
              type="button"
              onClick={() => setHelp((v) => !v)}
              className="flex items-center self-start"
              style={{
                gap: 7,
                marginTop: -2,
                fontFamily: T.sans,
                fontSize: 12.5,
                fontWeight: 600,
                color: help ? T.acc : T.text4,
                transition: 'color .18s',
              }}
            >
              <HelpCircle size={14} strokeWidth={2.3} />
              Something not working?
            </button>

            <AnimatePresence initial={false}>
              {help && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    className="flex items-start"
                    style={{
                      gap: 13,
                      padding: 18,
                      borderRadius: 16,
                      border: `1px solid ${T.line}`,
                      background: T.sunken,
                    }}
                  >
                    <span
                      className="grid shrink-0 place-items-center"
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        background: `rgba(${T.accRgb},0.12)`,
                        border: `1px solid ${T.accLine}`,
                        color: T.acc,
                      }}
                    >
                      <HelpCircle size={16} strokeWidth={2.3} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 700, color: T.text }}>
                        Need a hand?
                      </div>
                      <p
                        style={{
                          fontFamily: T.sans,
                          marginTop: 6,
                          fontSize: 13,
                          lineHeight: '20px',
                          color: T.text3,
                        }}
                      >
                        Don’t see your prop firm, the connection won’t go through, or the server
                        isn’t found — message us and we’ll sort it out, usually the same day.
                      </p>

                      <div className="mt-3.5">
                        <TelegramButton />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <FormField label="Login" hint="account number">
              <input
                {...NO_FILL}
                name="edge-mt5-login"
                inputMode="numeric"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="edge-field outline-none"
                style={{ ...FIELD, padding: '0 16px' }}
                onFocus={fieldOn}
                onBlur={fieldOff}
              />
            </FormField>

            <FormField label="Investor password" hint="read-only">
              <input
                {...NO_FILL}
                autoComplete="new-password"
                name="edge-mt5-secret"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="edge-field outline-none"
                style={{ ...FIELD, padding: '0 16px' }}
                onFocus={fieldOn}
                onBlur={fieldOff}
              />
            </FormField>

            {/* Саме інвесторський, а не основний: він лише читає. Це
                варто сказати до того, як людина введе не той. */}
            <div className="flex items-start" style={{ gap: 10 }}>
              <KeyRound size={14} strokeWidth={2.2} style={{ color: T.text4, marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontFamily: T.sans, fontSize: 12.5, lineHeight: '19px', color: T.text4 }}>
                The investor password is read-only — nobody can place a trade with it, us included.
              </p>
            </div>

            {phase === 'form' ? (
              <button
                type="button"
                onClick={connect}
                disabled={!ready || busy}
                className="flex items-center justify-center"
                style={{
                  marginTop: 4,
                  gap: 9,
                  height: 50,
                  borderRadius: 14,
                  fontFamily: T.sans,
                  fontSize: 14.5,
                  fontWeight: 700,
                  background: ready
                    ? `linear-gradient(135deg, rgba(${T.accRgb},1) 0%, rgba(${T.accRgb},0.78) 100%)`
                    : T.sunken,
                  border: `1px solid ${ready ? 'transparent' : T.line}`,
                  color: ready ? 'var(--edge-on-acc, #0A0A0C)' : T.text4,
                  boxShadow: ready ? `0 16px 34px -18px rgba(${T.accRgb},0.9)` : 'none',
                  cursor: ready && !busy ? 'pointer' : 'default',
                  transition: 'all .22s',
                }}
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy ? 'Saving…' : 'Connect account'}
              </button>
            ) : (
              <SyncStatus phase={phase} msg={failMsg} onRetry={retry} onDone={onClose} />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="cta"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
            style={{ marginTop: 'auto', paddingTop: 22, transform: 'translateZ(18px)' }}
          >
            {/* Не гола стрілка з підписом, а таблетка: видно межі
                дії ще до наведення, і стан «наведено» показує сама
                кнопка, а не текст, що зʼявляється нізвідки. */}
            <span
              className="inline-flex items-center"
              style={{
                gap: 10,
                height: 40,
                padding: '0 7px 0 17px',
                borderRadius: 999,
                fontFamily: T.sans,
                fontSize: 13.5,
                fontWeight: 600,
                color: hot ? T.text : T.text2,
                background: hot ? `rgba(${T.infoRgb},0.12)` : T.sunken,
                border: `1px solid ${hot ? `rgba(${T.infoRgb},0.42)` : T.line}`,
                transition: 'background .28s ease, border-color .28s ease, color .28s ease',
              }}
            >
              Set it up
              <motion.span
                className="grid place-items-center"
                animate={{ x: hot ? 2 : 0 }}
                transition={HOVER_SPRING}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: hot ? T.info : T.line,
                  color: hot ? '#08080c' : T.text3,
                  transition: 'background .28s ease, color .28s ease',
                }}
              >
                <ArrowRight size={14} strokeWidth={2.6} />
              </motion.span>
            </span>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
      </motion.div>
    </motion.div>
  );
}

/* cTrader. Картка навмисно неклікабельна й пунктирна: вимкнений
   елемент, який виглядає як робочий, — це обіцянка, якої інтерфейс
   не виконає. Нічого періодичного тут не блимає: смуга світла, що
   сама собою пробігає раз на кілька секунд, у вікні налаштувань
   читається як дефект, а не як прикраса. */
function SoonCard({ faded, onHover }) {
  const [hot, setHot] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{
        opacity: faded ? 0.45 : 1,
        scale: hot ? 1.015 : faded ? 0.975 : 1,
      }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={HOVER_SPRING}
      onMouseEnter={() => { setHot(true); onHover('ct'); }}
      onMouseLeave={() => { setHot(false); onHover(null); }}
      className="relative flex flex-col overflow-hidden"
      style={{
        borderRadius: 20,
        border: `1px dashed ${hot ? T.lineHi : T.line}`,
        background: `linear-gradient(165deg, ${T.surface} 0%, ${T.bg} 100%)`,
        padding: 26,
        height: CARD_H,
        cursor: 'default',
        transition: 'border-color .25s ease',
      }}
    >
      <span
        className="pointer-events-none absolute"
        style={{
          inset: 0,
          opacity: 0.3,
          background: `repeating-linear-gradient(135deg, transparent 0 9px, ${T.line} 9px 10px)`,
        }}
      />

      <span
        className="absolute"
        style={{
          top: 18,
          right: 18,
          fontFamily: T.sans,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '1.8px',
          textTransform: 'uppercase',
          padding: '5px 11px',
          borderRadius: 999,
          background: `rgba(${T.accRgb},0.12)`,
          border: `1px solid ${T.accLine}`,
          color: T.acc,
        }}
      >
        Soon
      </span>

      <div className="relative">
        <span style={{ display: 'block', opacity: 0.72 }}>
          <PlatformMark kind="ctrader" hot={hot} big />
        </span>

        <div style={{ marginTop: 22, opacity: 0.5 }}>
          <div
            style={{
              fontFamily: T.display,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-.02em',
              color: T.text,
            }}
          >
            cTrader
          </div>
          <div style={{ fontFamily: T.sans, marginTop: 5, fontSize: 13.5, color: T.text3 }}>
            Sign in with your cTrader ID
          </div>
        </div>
      </div>

      <div
        className="relative"
        style={{
          marginTop: 'auto',
          paddingTop: 22,
          fontFamily: T.sans,
          fontSize: 12.5,
          color: T.text4,
        }}
      >
        Next in line after MT5
      </div>
    </motion.div>
  );
}
