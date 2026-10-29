import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban, BellRing, BookOpen, Check, Gauge, MessageCircleQuestion, Newspaper, Scale, ShieldAlert, Sparkles, TrendingDown, History,
} from 'lucide-react';
import { T } from '../../lib/theme';
import Button from '../ui/Button';
import { openSettings } from '../../lib/settings';
import { BROKERS } from '../../lib/brokers';
import BrokerMark from '../ui/BrokerMark';

/* ==================================================================
   «Правила мого пропа» для Free / Lite — вітрина Pro.

   Зліва — що всередині, справа — живий макет: вкладки самі
   перемикаються кожні кілька секунд і показують, як це працює
   (новина з вікном заборони і зворотним відліком, смужки лімітів,
   відповідь на питання, що «друкується»). Дані в макеті — приклад,
   так і підписано.
================================================================== */

const ACC = T.accRgb;
const SCENES = ['news', 'limits', 'ask', 'compare'];
const LABEL = { news: 'Новини', limits: 'Мій рахунок', ask: 'Спитай', compare: 'Порівняти' };
const FEATURES = [
  [Newspaper, 'Заборонені новини твого пропа', 'Календар як на FF, де видно, на яких подіях саме твій проп забороняє торгувати, і точне вікно заборони.'],
  [BellRing, 'Нагадування на будь-якій сторінці', 'За 15 хв до вікна — плашка і сповіщення браузера. У самому вікні — «зараз не торгуй».'],
  [Gauge, 'Ліміти наживо з MT5', 'Скільки ще можна втратити сьогодні, скільки до просадки й до цілі — у доларах, а не у відсотках.'],
  [ShieldAlert, 'Перевірка угод на порушення', 'Угоди у вікні новини чи день понад ліміт — підсвітимо, поки проп не підсвітив сам.'],
  [BookOpen, 'Правила простою мовою', 'Шість пропів: FTMO, The5ers, FundingPips, Alpha Capital, Blue Guardian, CryptoFundTrader.'],
  [MessageCircleQuestion, 'Спитай про правила', '«Чи можна тримати угоду на вихідних на 2-Step?» — відповідь лише з правил пропа.'],
  [Scale, 'Порівняння пропів', 'Усі програми в одній таблиці: денний ліміт, просадка, ціль, новинне вікно.'],
  [History, 'Зміни правил', 'Щодня звіряємо з сайтами пропів. Змінилось — віконце з поясненням, що це значить для тебе.'],
];

function Lamp({ id }) {
  return <motion.span layoutId={id} className="pointer-events-none absolute inset-0 rounded-[10px]" style={{ background: `linear-gradient(100deg, rgba(${ACC},0.2), rgba(${ACC},0.05) 70%)`, boxShadow: `inset 0 0 0 1px rgba(${ACC},0.25)` }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />;
}

function NewsScene() {
  const [s, setS] = useState(272); // секунди до вікна
  useEffect(() => { const t = setInterval(() => setS((v) => (v <= 0 ? 272 : v - 1)), 1000); return () => clearInterval(t); }, []);
  const rows = [
    ['14:30', 'USD', '#f87171', 'Non-Farm Payrolls', true],
    ['14:30', 'USD', '#f87171', 'Unemployment Rate', true],
    ['16:00', 'USD', '#fbbf24', 'ISM Services PMI', false],
    ['20:00', 'USD', '#f87171', 'FOMC Minutes', true],
  ];
  return (
    <div className="grid gap-2.5">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: `rgba(${T.warnRgb},0.1)`, border: `1px solid rgba(${T.warnRgb},0.4)` }}>
        <BellRing size={16} style={{ color: T.warn }} />
        <span className="text-[12.5px] font-bold" style={{ color: T.text, fontFamily: T.sans }}>Через <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span> заборона на FTMO</span>
      </motion.div>
      <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--edge-line)' }}>
        <div className="px-3 py-1.5 text-[10.5px] font-bold uppercase" style={{ background: 'var(--edge-sunken)', color: T.acc, fontFamily: T.mono, letterSpacing: '0.06em' }}>пʼятниця · сьогодні</div>
        {rows.map(([t, c, dot, title, bad], i) => (
          <motion.div key={title} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
            className="relative grid grid-cols-[42px_44px_minmax(0,1fr)_auto] items-center gap-2 border-t px-3 py-2" style={{ borderColor: 'var(--edge-line)' }}>
            {bad && i === 0 && <motion.span className="absolute inset-0" animate={{ opacity: [0.04, 0.14, 0.04] }} transition={{ duration: 2, repeat: Infinity }} style={{ background: `rgb(${T.badRgb})` }} />}
            <span className="relative text-[12px] font-bold tabular-nums" style={{ color: T.text, fontFamily: T.mono }}>{t}</span>
            <span className="relative flex items-center gap-1 text-[11.5px] font-bold" style={{ color: T.text2, fontFamily: T.mono }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />{c}</span>
            <span className="relative truncate text-[12.5px]" style={{ color: T.text, fontFamily: T.sans }}>{title}</span>
            {bad ? <span className="relative text-[11px] font-semibold" style={{ color: T.bad, fontFamily: T.sans }}>±2 хв</span> : <span />}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Bar({ label, value, part, tone, delay }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
      <div className="text-[11px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>{label}</div>
      <div className="mt-1 text-[20px] font-bold tabular-nums" style={{ color: T.text, fontFamily: T.display }}>{value}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--edge-line)' }}>
        <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${part * 100}%` }} transition={{ delay, duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }} style={{ background: tone }} />
      </div>
    </div>
  );
}

function LimitsScene() {
  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-3 gap-2">
        <Bar label="Можна втратити сьогодні" value="$312" part={0.38} tone={T.ok} delay={0.1} />
        <Bar label="До просадки" value="$740" part={0.26} tone={T.warn} delay={0.25} />
        <Bar label="До цілі" value="$415" part={0.58} tone={T.acc} delay={0.4} />
      </div>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-[1.5]"
        style={{ background: `rgba(${T.badRgb},0.07)`, border: `1px solid rgba(${T.badRgb},0.28)`, fontFamily: T.sans, color: T.text2 }}>
        <Ban size={14} className="mt-[2px] shrink-0" style={{ color: T.bad }} />
        <span><b style={{ color: T.text }}>XAUUSD</b> — угода відкрита о 14:31, у вікні новини USD «Non-Farm Payrolls».</span>
      </motion.div>
    </div>
  );
}

function AskScene() {
  const full = 'На етапі оцінювання (Challenge і Verification) тримати позиції через вихідні можна. На funded Standard-рахунку — ні: закрий до початку перерви. На Swing-рахунку дозволено завжди.';
  const [n, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((v) => (v >= full.length ? v : v + 2)), 30); return () => clearInterval(t); }, []);
  return (
    <div className="grid gap-2.5">
      <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-[12.5px]" style={{ background: `rgba(${ACC},0.16)`, color: T.text, fontFamily: T.sans }}>Чи можна тримати угоду на вихідних на 2-Step?</div>
      <div className="max-w-[92%] rounded-xl rounded-bl-sm px-3 py-2.5 text-[12.5px] leading-[1.55]" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)', color: T.text, fontFamily: T.sans }}>
        <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold" style={{ color: T.acc }}><Sparkles size={12} />з правил FTMO</span>
        {full.slice(0, n)}{n < full.length && <span className="inline-block h-3 w-[2px] translate-y-[2px]" style={{ background: T.acc }} />}
      </div>
    </div>
  );
}

function CompareScene() {
  const rows = [['ftmo', '2-Step', '5%', '10%'], ['fundingpips', '2 Step Standard', '5%', '10%'], ['the5ers', 'High Stakes', '5%', '10%'], ['alphacapital', 'Alpha Pro 8%', '4%', '8%']];
  return (
    <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--edge-line)' }}>
      <div className="grid grid-cols-[minmax(0,1fr)_54px_54px] gap-2 px-3 py-1.5 text-[10.5px] font-bold uppercase" style={{ background: 'var(--edge-sunken)', color: T.text3, fontFamily: T.mono }}>
        <span>Проп · програма</span><span className="text-right">День</span><span className="text-right">Макс.</span>
      </div>
      {rows.map(([id, p, d, m], i) => (
        <motion.div key={id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.09 }} className="grid grid-cols-[minmax(0,1fr)_54px_54px] items-center gap-2 border-t px-3 py-2" style={{ borderColor: 'var(--edge-line)' }}>
          <span className="flex min-w-0 items-center gap-2 text-[12.5px]" style={{ color: T.text, fontFamily: T.sans }}><BrokerMark broker={BROKERS.find((b) => b.id === id)} size={20} /><span className="truncate">{p}</span></span>
          <span className="text-right text-[12.5px] font-bold tabular-nums" style={{ color: T.text, fontFamily: T.mono }}>{d}</span>
          <span className="text-right text-[12.5px] tabular-nums" style={{ color: T.text2, fontFamily: T.mono }}>{m}</span>
        </motion.div>
      ))}
    </div>
  );
}

const SCENE = { news: NewsScene, limits: LimitsScene, ask: AskScene, compare: CompareScene };

export default function PropRulesPro({ lite = false }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => { if (hold) return undefined; const t = setInterval(() => setI((v) => (v + 1) % SCENES.length), 5200); return () => clearInterval(t); }, [hold]);
  const scene = SCENES[i];
  const Scene = SCENE[scene];

  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden p-5 sm:p-8" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 24 }}>
        <motion.div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full" animate={{ scale: [1, 1.12, 1], opacity: [0.35, 0.55, 0.35] }} transition={{ duration: 6, repeat: Infinity }}
          style={{ background: `radial-gradient(circle, rgba(${ACC},0.28), transparent 65%)` }} />
        <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div className="min-w-0">
            <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase"
              style={{ background: `rgba(${ACC},0.14)`, color: T.acc, fontFamily: T.mono, letterSpacing: '0.08em' }}><Sparkles size={12} />Pro</motion.span>
            <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="m-0 mt-3 text-[28px] font-bold leading-[1.1] sm:text-[36px]" style={{ color: T.text, fontFamily: T.display, letterSpacing: '-0.03em', textWrap: 'balance' }}>
              Не злий рахунок на правилі, про яке не знав
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="m-0 mt-3 max-w-[520px] text-[15px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>
              Новини, на яких проп забороняє торгувати, ліміти рахунку наживо і перевірка угод — в одному місці. Ми щодня звіряємо правила з сайтами пропів.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={() => openSettings('billing', { plan: 'pro' })}>{lite ? 'Перейти на Pro' : 'Спробувати Pro'}</Button>
              <span className="text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>{lite ? 'У Lite цього розділу нема' : 'Входить у Pro разом з автоімпортом MT5'}</span>
            </motion.div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {BROKERS.map((b, k) => (
                <motion.span key={b.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 + k * 0.06 }} title={b.name}><BrokerMark broker={b} size={30} /></motion.span>
              ))}
            </div>
          </div>

          {/* Живий макет */}
          <div className="min-w-0 rounded-[18px] p-3" style={{ background: 'var(--edge-bg, var(--edge-sunken))', border: '1px solid var(--edge-line)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
            onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
            <div className="mb-3 flex gap-1 rounded-xl p-1" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>
              {SCENES.map((id, k) => (
                <button key={id} type="button" onClick={() => setI(k)} className="relative h-8 flex-1 rounded-[10px] text-[12px] font-semibold" style={{ color: scene === id ? T.text : T.text3, fontFamily: T.sans }}>
                  {scene === id && <Lamp id="pro-preview-lamp" />}
                  <span className="relative">{LABEL[id]}</span>
                </button>
              ))}
            </div>
            <div className="relative min-h-[236px]">
              <AnimatePresence mode="wait">
                <motion.div key={scene} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }}>
                  <Scene />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-[10.5px]" style={{ color: T.text3, fontFamily: T.sans }}>приклад, не твої дані</span>
              <span className="flex gap-1">{SCENES.map((id, k) => <span key={id} className="h-1 rounded-full transition-all duration-300" style={{ width: k === i ? 16 : 6, background: k === i ? T.acc : 'var(--edge-line)' }} />)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([Icon, title, text], k) => (
          <motion.div key={title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: (k % 4) * 0.06, duration: 0.3 }}
            className="rounded-2xl p-4" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>
            <motion.span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `rgba(${ACC},0.12)` }}
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08, transition: { duration: 0.5 } }}><Icon size={17} style={{ color: T.acc }} /></motion.span>
            <div className="mt-3 text-[14.5px] font-bold" style={{ color: T.text, fontFamily: T.display }}>{title}</div>
            <p className="m-0 mt-1 text-[13px] leading-[1.55]" style={{ color: T.text2, fontFamily: T.sans }}>{text}</p>
          </motion.div>
        ))}
      </div>

      <section className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6" style={{ background: 'var(--edge-surface)', border: `1px solid rgba(${ACC},0.3)`, borderRadius: 20 }}>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold" style={{ color: T.text, fontFamily: T.display }}>Один зірваний челендж коштує більше, ніж рік Pro</div>
          <div className="mt-1 grid gap-1 text-[13px] sm:grid-flow-col sm:gap-5" style={{ color: T.text2, fontFamily: T.sans }}>
            {['Автоімпорт угод з MT5', 'Правила й новини пропа', 'Ліміти наживо'].map((x) => <span key={x} className="inline-flex items-center gap-1.5"><Check size={14} style={{ color: T.ok }} />{x}</span>)}
          </div>
        </div>
        <Button className="shrink-0" onClick={() => openSettings('billing', { plan: 'pro' })}>{lite ? 'Перейти на Pro' : 'Спробувати Pro'}</Button>
      </section>
    </div>
  );
}
