import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Check, Trophy, TrendingUp, ShieldCheck, GraduationCap, FlaskConical, Eye, PenLine, Plug, HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useCloudState from '../../hooks/useCloudState';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/pulse';
import { openSettings } from '../../lib/settings';
import {
  KEY, EMPTY, normalize, PLATFORMS, GOALS, TPW, SAVED_EVENT, isWarmingUp, platformName, demoUrl, markDemoSeen,
} from '../../lib/onboard';

/* ==================================================================
   Анкета з трьох питань після першого входу.

   Одне питання на екран, відповідь — клік по варіанту. Після третього —
   екран «з чого почати», підібраний під відповіді: тому, хто ще не
   торгує регулярно, — бектест і приклад, а не «внеси угоду», якої
   в нього ще немає.

   Платформи — з логотипами (лише щоб людина впізнала свою), «Інша» —
   нейтральний значок.
================================================================== */

/* Значки платформ: монограма + свій відтінок, щоб варіанти
   розрізнялись з першого погляду. */
const PLATFORM_BADGE = {
  mt5: { mark: 'MT5', rgb: '96,165,250', hint: tx('Автоімпорт', 'Auto-import') },
  ctrader: { mark: 'cT', rgb: '248,113,113', hint: tx('Вручну', 'Manual') },
  match: { mark: 'MT', rgb: '52,211,153', hint: tx('Вручну', 'Manual') },
  tradelocker: { mark: 'TL', rgb: '251,191,36', hint: tx('Вручну', 'Manual') },
  other: { mark: '…', rgb: '161,161,170', hint: tx('Вручну', 'Manual') },
};
const GOAL_ICON = { challenge: Trophy, steady: TrendingUp, discipline: ShieldCheck, learning: GraduationCap };
const TPW_HINT = {
  '1-5': tx('свінг, кілька угод', 'swing, a few trades'),
  '5-15': tx('інтрадей', 'intraday'),
  '15+': tx('активний скальпінг', 'active scalping'),
  unknown: tx('ще шукаю свій темп', 'still finding my pace'),
};

const QUESTIONS = [
  { id: 'platform', title: tx('На якій платформі ти торгуєш?', 'Which platform do you trade on?'), options: PLATFORMS },
  { id: 'goal', title: tx('Яка в тебе ціль?', 'What is your goal?'), options: GOALS },
  { id: 'tpw', title: tx('Скільки угод на тиждень?', 'How many trades per week?'), options: TPW },
];

/* Логотипи платформ — ті самі файли, що й у налаштуваннях підключення
   (public/platforms). Немає файлу — лишається монограма. */
const PLATFORM_LOGO = {
  mt5: '/platforms/mt5.svg',
  ctrader: '/platforms/ctrader.svg',
  match: '/platforms/match.svg',
  tradelocker: '/platforms/tradelocker.svg',
};

function Badge({ id }) {
  const b = PLATFORM_BADGE[id] || PLATFORM_BADGE.other;
  const [broken, setBroken] = useState(false);
  const logo = !broken && PLATFORM_LOGO[id];
  if (logo) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.line}` }}>
        <img src={logo} alt="" width={26} height={26} onError={() => setBroken(true)} style={{ width: 26, height: 26, objectFit: 'contain' }} />
      </span>
    );
  }
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[12.5px] font-extrabold"
      style={{ fontFamily: T.mono, color: `rgb(${b.rgb})`, background: `rgba(${b.rgb},0.12)`, border: `1px solid rgba(${b.rgb},0.3)` }}
    >
      {b.mark}
    </span>
  );
}

function IconTile({ icon: Icon, rgb = T.accRgb }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)` }}>
      <Icon size={18} strokeWidth={2.1} style={{ color: `rgb(${rgb})` }} />
    </span>
  );
}

/* Що показати після анкети. */
function nextStep(a) {
  if (isWarmingUp(a)) {
    return {
      title: tx('Почни з бектесту', 'Start with a backtest'),
      text: tx('Поки темп не склався, тренуйся на історії: 2 бектести на реальних хвилинках FTMO безкоштовно, а ручні без обмежень. Угоди в журнал додаси, коли почнеш торгувати.', 'Until you find your pace, practise on history: 2 free backtests on real FTMO minute data. Add trades to the journal once you start trading.'),
      primary: { icon: FlaskConical, label: tx('Спробувати бектест', 'Try a backtest'), go: 'backtest' },
      secondary: { icon: Eye, label: tx('Подивитись приклад', 'See an example'), go: 'demo' },
    };
  }
  if (a.platform && a.platform !== 'mt5') {
    return {
      title: tx('Внеси першу угоду', 'Log your first trade'),
      text: tx(`Автоімпорту з ${platformName(a.platform)} поки немає — угода вручну займає хвилину. Повідомимо, коли підключимо твою платформу.`, `There is no auto-import from ${platformName(a.platform)} yet — a manual trade takes a minute. We will let you know when we add your platform.`),
      primary: { icon: PenLine, label: tx('Внести угоду', 'Log a trade'), go: 'trade' },
      secondary: { icon: Eye, label: tx('Подивитись приклад', 'See an example'), go: 'demo' },
    };
  }
  return {
    title: a.goal === 'challenge' ? tx('Підключи MT5 до челенджу', 'Connect MT5 to your challenge') : tx('Підключи MT5', 'Connect MT5'),
    text: tx('2 хвилини, лише інвесторський пароль — угоди підтягнуться самі. Або внеси першу угоду вручну.', '2 minutes, investor password only — trades sync on their own. Or log your first trade manually.'),
    primary: { icon: Plug, label: tx('Підключити MT5', 'Connect MT5'), go: 'mt5' },
    secondary: { icon: PenLine, label: tx('Внести вручну', 'Log manually'), go: 'trade' },
  };
}

export default function OnboardSurvey() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState, { ready }] = useCloudState(KEY, EMPTY, { normalize });
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!ready || !user?.id) return;
    if (state.status === 'new') setOpen(true);
  }, [ready, user?.id, state.status]);

  const save = (v) => {
    setState(v);
    window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: v }));
  };

  const later = () => {
    if (!result) {
      save({ ...state, ...answers, status: 'later', at: new Date().toISOString() });
      track('onboarding_skipped', { step: i });
    }
    setOpen(false);
  };

  const pick = (id, value) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (i < QUESTIONS.length - 1) { setTimeout(() => setI(i + 1), 160); return; }
    save({ ...state, ...next, status: 'done', at: new Date().toISOString() });
    track('onboarding_answered', next);
    setTimeout(() => setResult(nextStep(next)), 160);
  };

  const act = (go) => {
    track('onboarding_next', { go });
    setOpen(false);
    if (go === 'backtest') navigate('/backtest');
    else if (go === 'trade') navigate('/journal?new=1');
    else if (go === 'mt5') openSettings('connect');
    /* Демо — повним переходом: клієнт бази підміняється лише при завантаженні. */
    else if (go === 'demo') { markDemoSeen(); window.location.assign(demoUrl('analytics')); }
  };

  const q = QUESTIONS[i];
  const cols = q.id === 'goal' || q.options.length > 3 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-3';

  const option = (value, label) => {
    const on = answers[q.id] === value;
    const lead = q.id === 'platform' ? <Badge id={value} />
      : q.id === 'goal' ? <IconTile icon={GOAL_ICON[value] || HelpCircle} />
        : value === 'unknown' ? <IconTile icon={HelpCircle} rgb="161,161,170" /> : null;
    const sub = q.id === 'platform' ? (PLATFORM_BADGE[value] || PLATFORM_BADGE.other).hint : q.id === 'tpw' ? TPW_HINT[value] : null;
    return (
      <motion.button
        key={value}
        type="button"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => pick(q.id, value)}
        className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors"
        style={{
          fontFamily: T.sans,
          background: on ? `rgba(${T.accRgb},0.16)` : T.sunken,
          border: `1px solid ${on ? T.acc : T.line}`,
        }}
      >
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold" style={{ color: T.text }}>{label}</span>
          {sub && <span className="mt-0.5 block text-[12px]" style={{ color: T.text3 }}>{sub}</span>}
        </span>
        {on && <Check size={16} strokeWidth={2.6} style={{ color: T.acc }} />}
      </motion.button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="onb"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[520] flex items-center justify-center px-4"
          style={{ background: 'rgba(6,6,10,0.74)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            role="dialog"
            aria-label={tx('Знайомство', 'Getting started')}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative w-full max-w-[520px] overflow-hidden rounded-3xl p-6 sm:p-7"
            style={{
              background: `radial-gradient(120% 70% at 0% 0%, rgba(${T.accRgb},0.16), transparent 55%), ${T.surface}`,
              border: `1px solid rgba(${T.accRgb},0.28)`,
              boxShadow: '0 50px 110px -35px rgba(0,0,0,0.95)',
            }}
          >
            {/* Прогрес — три сегменти замість «Крок 1 з 3»: читається
                миттю, і великими літерами «з» не плутається з «3». */}
            <div className="mb-6 flex items-center gap-3">
              {i > 0 && !result && (
                <button type="button" aria-label={tx('Назад', 'Back')} onClick={() => setI(i - 1)} className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: T.text3, border: `1px solid ${T.line}` }}>
                  <ArrowLeft size={14} />
                </button>
              )}
              <div className="flex flex-1 gap-1.5">
                {QUESTIONS.map((x, k) => (
                  <span key={x.id} className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: T.line }}>
                    <motion.span
                      className="block h-full rounded-full"
                      style={{ background: T.acc }}
                      initial={false}
                      animate={{ width: result || k < i ? '100%' : k === i ? '45%' : '0%' }}
                      transition={{ duration: 0.4, ease: EASE }}
                    />
                  </span>
                ))}
              </div>
              <span className="text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
                {result ? '3/3' : `${i + 1}/${QUESTIONS.length}`}
              </span>
              <button type="button" onClick={later} className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {result ? tx('Закрити', 'Close') : tx('Пізніше', 'Later')}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {result ? (
                <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.mono, color: T.acc }}>
                    {tx('З чого почати', 'Where to start')}
                  </span>
                  <h2 className="mt-2 text-[24px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>{result.title}</h2>
                  <p className="mt-2 text-[14.5px] leading-[22px]" style={{ fontFamily: T.sans, color: T.text2 }}>{result.text}</p>
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    {[result.primary, result.secondary].map((b, k) => (
                      <button
                        key={b.go}
                        type="button"
                        onClick={() => act(b.go)}
                        className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-bold"
                        style={k === 0
                          ? { fontFamily: T.sans, background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)' }
                          : { fontFamily: T.sans, background: 'transparent', color: T.text, border: `1px solid ${T.lineHi}` }}
                      >
                        <b.icon size={16} strokeWidth={2.3} />{b.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.22, ease: EASE }}
                >
                  <h2 className="mb-5 text-[23px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                    {q.title}
                  </h2>
                  <div className={`grid gap-2 ${cols}`}>
                    {q.options.map(([value, label]) => option(value, label))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!result && (
              <p className="mt-5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {tx('Три кліки. Під відповіді підлаштуємо перші кроки.', 'Three clicks. We tailor your first steps to the answers.')}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
