import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, RotateCcw, Eye, EyeOff, Moon, Sun, ZapOff,
  User, Target, BookOpen, Palette, Sparkles, LayoutGrid,
  MailCheck, MailWarning, KeyRound, Loader2, Check,
} from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { notify } from '../../utils/notify';
import { supabase, hadAuthTokenInUrl, endRecoveryFlow } from '../../lib/supabase';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { openVerifyEmail } from '../../lib/emailGate';
import { NAV, MOTION, FX, PSY, HIDEABLE, GOALS, goalById, OPEN_EVENT } from '../../lib/settings';
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
