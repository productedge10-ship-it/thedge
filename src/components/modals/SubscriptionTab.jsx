import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Check, Eye, Loader2, Send, TerminalSquare, X,
} from 'lucide-react';
import { T } from '../trading/planTheme';
import { EdgeMonogram, EdgeWordmark } from '../core/Layout';
import {
  PLANS, PRO_FEATURES, TRIAL_DAYS, fmtMoney, startCheckout, cancelSubscription,
  useUahRate, toUah, fmtUah,
} from '../../lib/billing';
import SubscriptionScene from './SubscriptionScene';

/* ==================================================================
   Підписка.

   Одна річ, яку тут легко зробити неправильно, — намалювати
   «преміальність» блиском. Золоті градієнти, зорі й прожектор за
   курсором читаються не як дорого, а як заставка: чим голосніше
   інтерфейс кричить про статус, тим дешевшим він здається. Перша
   версія цього екрана саме цим і хворіла.

   Тому тут рівно одне джерело світла — сцена еквіті вгорі, — і воно
   замкнене в межах самої сцени. Нижче карта пласка.

   Це не лише про смак. Заграви на blur-шарах, накладені поверх
   прозорого тла з mix-blend-mode, Chrome рахує плитками, і на
   великій карті між плитками лишається видимий вертикальний шов —
   той самий, що було видно на скріні. Немає шарів — немає шва.

   Світло, яке лишилось, згасає всередині сцени: її нижні 64px
   зводяться до кольору карти. Нижче за цю лінію фон плаский і
   збігається з нею точно, тож жодного стику не видно в принципі.
================================================================== */

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
};

const daysLeft = (iso) => {
  if (!iso) return null;
  const ms = new Date(iso) - new Date();
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
};

const plural = (n) => (
  n % 10 === 1 && n % 100 !== 11 ? 'день'
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дні'
      : 'днів'
);

/* Довжина оплаченого періоду — щоб було від чого рахувати смугу.
   Точну дату початку сервер не віддає, та вона тут і не потрібна:
   смуга показує «скільки ще лишилось», а не бухгалтерію. */
const periodDays = (plan) => (String(plan).includes('year') ? 365 : 30);

const FEATURE_ICON = { mt5: TerminalSquare, telegram: Send };

/* Текст на акцентній кнопці.

   Хардкод, а не токен теми, і це навмисно. Раніше тут стояв
   var(--edge-on-acc); змінна є в :root, але варто їй не долізти в
   будь-якому з майбутніх контекстів — і колір тихо успадковується
   білим. Білий по #8b7bff дає контраст 3.3:1, тобто кнопку видно, а
   напис на ній — ні. Найважливіший напис на екрані не має залежати
   від того, чи доїхала змінна. */
const ON_ACC = '#0B0B12';

/* ------------------------------------------------------------------
   Карта.

   Пласка, з чіткою межею й одним світловим швом по верхньому краю.
   Усередині — жодних blur-шарів і жодного mix-blend-mode.
------------------------------------------------------------------ */
function Stage({ children, tone = 'acc' }) {
  const rgb = tone === 'ok' ? T.okRgb : T.accRgb;

  return (
    <div className="relative">
      {/* Заграва живе ЗА картою, а не в ній: карта від цього
          виглядає підсвіченою ззаду, а всередині лишається чистою. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-[26px]"
        style={{
          background: `radial-gradient(90% 60% at 50% 0%, rgba(${rgb},0.16), transparent 70%)`,
          filter: 'blur(16px)',
        }}
      />

      <div
        className="relative overflow-hidden rounded-[22px]"
        style={{
          background: T.surface,
          border: `1px solid rgba(${rgb},0.2)`,
          boxShadow: '0 30px 70px -45px rgba(0,0,0,0.9)',
        }}
      >
        {children}

        {/* Кант. Одна лінія, яка гасне до країв, — те, що відрізняє
            скло від прямокутника з рамкою.

            Малюється ПІСЛЯ вмісту навмисно: сцена зводить свій верх
            у колір карти, і кант, намальований до неї, просто зникав
            би під цим згасанням. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${rgb},0.7), transparent)` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Шапка: знак застосунку над сценою.

   Той самий кіт і той самий словесний знак, що в бічній панелі.
   Свій окремий значок для платного розділу означав би другий бренд
   усередині одного продукту — і саме так виглядають екрани, зроблені
   різними людьми в різний час.

   «PRO» набране Space Grotesk, як і сам знак, а не дисплейним
   шрифтом: поруч зі словесним знаком це має читатись як його
   продовження, а не як заголовок.
------------------------------------------------------------------ */
function Brand({ tone = 'acc', badge }) {
  const rgb = tone === 'ok' ? T.okRgb : T.accRgb;

  return (
    <div className="absolute inset-x-6 bottom-0 flex items-end gap-3.5">
      <span className="shrink-0">
        <EdgeMonogram />
      </span>

      <span className="min-w-0 pb-1">
        <EdgeWordmark size={12} tracking={3.2} />

        <span className="mt-1 flex items-center gap-2.5">
          <span
            className="leading-[0.85]"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 800,
              fontSize: 38,
              letterSpacing: '0.04em',
              color: `rgb(${rgb})`,
              textShadow: `0 0 18px rgba(${rgb},0.3)`,
            }}
          >
            PRO
          </span>

          {badge && (
            <span
              className="mb-0.5 rounded-full px-2 py-[3px] text-[10px] font-bold uppercase"
              style={{
                fontFamily: T.mono,
                letterSpacing: '0.16em',
                color: `rgb(${rgb})`,
                background: `rgba(${rgb},0.12)`,
                border: `1px solid rgba(${rgb},0.3)`,
              }}
            >
              {badge}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

/* Рядок переваги. Іконка в скляному квадраті, а не гола галочка:
   галочка каже «є в списку», іконка каже «ось що саме». */
function Feature({ k, title, hint, tone = 'acc' }) {
  const rgb = tone === 'ok' ? T.okRgb : T.accRgb;
  const Icon = FEATURE_ICON[k] || Check;

  return (
    <div className="group flex gap-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] transition-transform duration-300 group-hover:scale-[1.06]"
        style={{
          background: `rgba(${rgb},0.12)`,
          border: `1px solid rgba(${rgb},0.24)`,
        }}
      >
        <Icon size={15} strokeWidth={1.9} style={{ color: `rgb(${rgb})` }} />
      </span>

      <span className="min-w-0 pt-[3px]">
        <span className="block text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
          {title}
        </span>
        <span className="mt-1 block text-[12.5px] leading-[18px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {hint}
        </span>
      </span>
    </div>
  );
}

/* Смуга залишку.

   Головка сидить усередині заливки, а не їде окремо. Окремо вона
   означала б анімацію `left` між нулем і відсотками — різні
   одиниці, які framer не змішує, і на практиці це стрибок замість
   руху. */
function Runway({ left, total, rgb }) {
  const done = Math.max(0.05, Math.min(1, (total - left) / total));

  return (
    <div className="relative mt-5 h-[3px] w-full rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <motion.span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: `linear-gradient(90deg, rgba(${rgb},0.25), rgb(${rgb}))` }}
        initial={{ width: '0%' }}
        animate={{ width: `${(done * 100).toFixed(2)}%` }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        <span
          className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full"
          style={{ background: `rgb(${rgb})`, boxShadow: `0 0 10px 1px rgba(${rgb},0.7)` }}
        />
      </motion.span>
    </div>
  );
}

/* Ціна, що перекочується при зміні періоду.

   Стара цифра йде вгору й розмивається, нова приходить знизу. Саме
   розмиття й робить рух дорогим: без нього це підміна тексту, з
   ним — рух фізичного барабана. */
function Price({ plan }) {
  /* Гривня поруч дрібніше: тариф живе в доларах, а гривня — довідка
     за курсом НБУ на сьогодні. */
  const rate = useUahRate();
  const perMonthUsd = plan.period === 'yearly' ? plan.amount / 12 : plan.amount;
  const uah = toUah(perMonthUsd, rate);
  return (
    <div className="relative flex h-[52px] items-baseline gap-2 overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={plan.id}
          className="text-[44px] font-bold leading-none"
          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.04em' }}
          initial={{ y: 26, opacity: 0, filter: 'blur(7px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -26, opacity: 0, filter: 'blur(7px)', position: 'absolute' }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Велика цифра — завжди ціна за місяць, і для річного теж.

              Так $12 стоїть поруч із $15 в одних одиницях, і вигоду
              видно без калькулятора. Повну річну суму не ховаємо —
              вона в примітці одразу під ціною, бо рахунок прийде
              саме на неї. */}
          {plan.perMonth}
        </motion.span>
      </AnimatePresence>

      <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
        / місяць{uah ? <span style={{ color: T.text4 }}> · ≈ {fmtUah(uah)}</span> : null}
      </span>
    </div>
  );
}

/* Вигаданий стан для перегляду.

   Дивитись на екран активної підписки інакше можна тільки одним
   способом — оплативши її, і так щоразу, коли в ньому треба щось
   поправити. Тому режим перегляду: справжній стан не чіпається,
   дії вимкнені, і згори висить смуга, яку неможливо переплутати з
   реальністю.

   Відкривається в дев-режимі або через ?preview у адресі — щоб
   випадковий користувач не побачив «PRO активний» і не вирішив, що
   йому щось уже дали. */
const FAKE = {
  plan: 'pro_monthly',
  status: 'active',
  validUntil: new Date(Date.now() + 22 * 86400000).toISOString(),
  trialUsed: true,
  isPro: true,
  ready: true,

  /* Режим перегляду має показувати ВСІ блоки, інакше він не показує
     того, що ми перевіряємо. Без цих полів список платежів у ньому
     просто не малювався, і перевірити його можна було лише реальною
     оплатою. */
  card: '44****4242',
  cardType: 'Visa',
  lastPaidAt: new Date(Date.now() - 8 * 86400000).toISOString(),
  lastAmount: 15,
  orders: [
    { ref: 'EJ-DEMO-000003', plan: 'pro_monthly', amount: 15, currency: 'USD', status: 'approved', at: new Date(Date.now() - 8 * 86400000).toISOString() },
    { ref: 'EJ-DEMO-000002', plan: 'pro_monthly', amount: 15, currency: 'USD', status: 'declined', at: new Date(Date.now() - 38 * 86400000).toISOString() },
    { ref: 'EJ-DEMO-000001', plan: 'pro_monthly', amount: 1, currency: 'USD', status: 'refunded', at: new Date(Date.now() - 52 * 86400000).toISOString() },
  ],
};

const previewAllowed = () => {
  try {
    return import.meta.env.DEV || new URLSearchParams(window.location.search).has('preview');
  } catch {
    return false;
  }
};

export default function SubscriptionTab({ sub, onChanged }) {
  const [period, setPeriod] = useState('pro_monthly');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(false);

  const canPreview = useMemo(previewAllowed, []);
  const view = preview ? FAKE : sub;

  /* Скасування питається двома кроками, і це не церемонія.

     Один клік тут коштує людині доступу, який вона оплатила, а нам —
     клієнта. Друга кнопка перетворює випадковий клік на рішення, і
     заразом дає місце сказати найважливіше: доступ не зникає зараз. */
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);

  /* Вийшли з перегляду — згорнули й підтвердження. Інакше після
     повернення в реальний стан на екрані висить «Скасувати
     підписку?» для підписки, якої немає. */
  useEffect(() => { setConfirming(false); }, [preview]);

  const doCancel = async () => {
    if (preview) return;
    setErr('');
    setCanceling(true);
    try {
      await cancelSubscription();
      setConfirming(false);
      await onChanged?.();
    } catch (e) {
      setErr(e.message || 'Не вдалось скасувати');
    } finally {
      setCanceling(false);
    }
  };

  const plan = PLANS[period];
  /* Рахуємо до дня списання, а не до кінця доступу: у mono доступ
     живе на добу довше (запас на затримку банку). */
  const chargeAt = view.nextChargeAt || view.validUntil;
  const left = daysLeft(chargeAt);

  const go = async ({ trial }) => {
    if (preview) return;
    setErr('');
    setBusy(true);
    try {
      await startCheckout(period, { trial });
    } catch (e) {
      setErr(e.message || 'Не вдалось відкрити оплату');
      setBusy(false);
    }
  };

  /* Кнопка перегляду. Внизу, тьмяна, моноширинним: це інструмент для
     того, хто цей екран малює, а не частина екрана. */
  const previewBar = canPreview && (
    <button
      type="button"
      onClick={() => setPreview((v) => !v)}
      className="mt-1 flex items-center gap-1.5 self-start text-[12px] font-medium transition-colors duration-200"
      style={{ fontFamily: T.mono, letterSpacing: '0.04em', color: preview ? T.acc : T.text3 }}
    >
      <Eye size={12} strokeWidth={2.2} />
      {preview ? 'вийти з перегляду' : 'подивитись вигляд активної підписки'}
    </button>
  );

  const previewNote = preview && (
    <div
      className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
      style={{ background: `rgba(${T.warnRgb},0.09)`, border: `1px solid rgba(${T.warnRgb},0.26)` }}
    >
      <Eye size={13} strokeWidth={2.2} style={{ color: T.warn }} />
      <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.warn }}>
        Режим перегляду — дані вигадані, кнопки вимкнені
      </span>
    </div>
  );

  /* ---------- уже підписаний ---------- */
  if (view.isPro) {
    const trialing = view.status === 'trialing';
    const tone = trialing ? 'acc' : 'ok';
    const rgb = trialing ? T.accRgb : T.okRgb;
    const total = trialing ? TRIAL_DAYS : periodDays(view.planId || view.plan);
    const subPlan = PLANS[view.planId || view.plan] || plan;

    return (
      <div className="flex flex-col gap-4">
        {previewNote}

        <Stage tone={tone}>
          <div className="relative">
            <SubscriptionScene height={168} tone={tone} />
            <Brand tone={tone} badge={
              /* Статуси англійською — як Take/Stop у журналі й
                 Daily/Weekly у плані. Це службові мітки стану, а не
                 текст для читання, і в застосунку вони скрізь такі. */
              view.status === 'canceled' ? 'Canceled'
                : view.status === 'past_due' ? 'Past due'
                  : trialing ? 'Trial' : 'Active'
            } />
          </div>

          <div className="px-6 pb-7 pt-5">
            <div className="flex items-baseline gap-2.5">
              <span
                className="text-[50px] font-bold leading-[0.9]"
                style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.045em' }}
              >
                {left != null ? left : '∞'}
              </span>
              <span className="text-[15px] font-medium" style={{ fontFamily: T.sans, color: T.text2 }}>
                {left != null ? `${plural(left)} до списання` : 'активна'}
              </span>
            </div>

            {left != null && <Runway left={left} total={total} rgb={rgb} />}

            {/* Дату списання кажемо прямо, а не ховаємо в дрібний шрифт.
                Людина, яку списання заскочило зненацька, не продовжує
                підписку — вона йде в підтримку й лишає одну зірку. */}
            <div className="mt-4 text-[13px] leading-[19px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {trialing
                ? <>Далі {subPlan.label.toLowerCase()} — перше списання <span style={{ color: T.text, fontWeight: 600 }}>{fmtDate(chargeAt)}</span></>
                : <>Наступне списання <span style={{ color: T.text, fontWeight: 600 }}>{fmtDate(chargeAt)}</span></>}
            </div>
          </div>
        </Stage>

        {view.status === 'past_due' && (
          <div
            className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: `rgba(${T.warnRgb},0.09)`, border: `1px solid rgba(${T.warnRgb},0.26)` }}
          >
            <AlertTriangle size={15} strokeWidth={2.2} style={{ color: T.warn, marginTop: 1 }} />
            <span className="text-[13px] leading-[19px]" style={{ fontFamily: T.sans, color: T.warn }}>
              Останнє списання не пройшло. Доступ працює до {fmtDate(view.validUntil)}, наступна спроба — через добу. Перевір, чи на картці є кошти.
            </span>
          </div>
        )}

        <div
          className="flex flex-col gap-4 rounded-2xl p-5"
          style={{ background: T.sunken, border: `1px solid ${T.line}` }}
        >
          <div
            className="text-[10px] font-bold uppercase"
            style={{ fontFamily: T.mono, letterSpacing: '0.24em', color: T.text3 }}
          >
            Відкрито
          </div>
          {Object.entries(PRO_FEATURES).map(([k, f]) => (
            <Feature key={k} k={k} title={f.title} hint={f.hint} tone={tone} />
          ))}
        </div>

        {/* Факти про підписку.

            Дата наступного списання сама по собі не відповідає на
            питання, які людина ставить, коли відкриває цей екран:
            «чим це списується», «скільки вже заплачено» і «чи взагалі
            пройшов останній платіж». Поки відповідей немає, вона йде
            з ними в підтримку — і це найдорожчий спосіб їх отримати.

            Маску картки не зберігаємо своєю колонкою: навіть чотири
            цифри — дані картки, і брати на себе їх зберігання там, де
            можна не брати, не варто. Вони лежать у збереженій
            відповіді банку, яку ми й так тримаємо для розборів. */}
        {(view.card || view.orders?.length > 0) && (
          <div className="rounded-2xl p-5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
            <div
              className="mb-3.5 text-[10px] font-bold uppercase"
              style={{ fontFamily: T.mono, letterSpacing: '0.2em', color: T.text4 }}
            >
              Платежі
            </div>

            {view.card && (
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  Картка
                </span>
                <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
                  {view.cardType ? `${view.cardType} · ` : ''}{view.card}
                </span>
              </div>
            )}

            {view.orders?.length > 0 && (
              <div className="flex flex-col">
                {view.orders.map((o, i) => (
                  <div
                    key={o.ref}
                    className="flex items-center justify-between gap-3 py-2"
                    style={{ borderTop: i ? `1px solid ${T.line}` : 'none' }}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px]" style={{ fontFamily: T.sans, color: T.text }}>
                        {fmtDate(o.at)}
                      </span>
                      {/* Номер платежу дрібним: він не потрібен щодня,
                          але саме його просять у підтримці, і шукати
                          його в листах — зайвий крок. */}
                      <span className="mt-0.5 block truncate text-[11px]" style={{ fontFamily: T.mono, color: T.text4 }}>
                        {o.ref}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
                        {/* Валюта — з самого платежу, а не з поточних
                            цін: старі оплати були в гривні, і показати
                            їх доларами означало б переписати історію. */}
                        {fmtMoney(o.amount, o.currency)}
                      </span>
                      <span
                        className="rounded-md px-2 py-[3px] text-[10px] font-bold uppercase"
                        style={{
                          fontFamily: T.mono,
                          letterSpacing: '0.1em',
                          color: o.status === 'approved' ? T.ok : o.status === 'declined' ? T.bad : T.text4,
                          background: o.status === 'approved'
                            ? `rgba(${T.okRgb},0.12)`
                            : o.status === 'declined' ? `rgba(${T.badRgb},0.12)` : 'transparent',
                          border: `1px solid ${o.status === 'approved'
                            ? `rgba(${T.okRgb},0.28)`
                            : o.status === 'declined' ? `rgba(${T.badRgb},0.28)` : T.line}`,
                        }}
                      >
                        {o.status === 'approved' && !o.amount ? 'картка'
                          : o.status === 'approved' ? 'сплачено'
                          : o.status === 'declined' ? 'відхилено'
                            : o.status === 'refunded' ? 'повернено'
                            : o.status === 'trial' ? 'тріал' : 'очікує'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Вихід не ховаємо.

            Схована кнопка скасування не утримує нікого — вона лише
            перетворює звичайне «поки що досить» на злість і пошук
            способу відписатись через банк. А чарджбек коштує дорожче
            за підписку, яку так «врятували».

            Скасовано — показуємо стан чесно, разом із датою, до якої
            доступ ще працює. */}
        {view.status === 'canceled' ? (
          <div className="rounded-xl px-3.5 py-3" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
            <span className="text-[13px] leading-[19px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Підписку скасовано. Доступ працює до {fmtDate(view.validUntil)} — далі розділи
              MetaTrader і Telegram закриються, але журнал, аналітика й калькулятор лишаться.
            </span>
          </div>
        ) : !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="self-start text-[12.5px] font-medium underline underline-offset-4 transition-colors duration-200"
            style={{ fontFamily: T.sans, color: T.text3, textDecorationColor: 'rgba(255,255,255,0.2)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
          >
            Скасувати підписку
          </button>
        ) : (
          <div className="rounded-xl p-4" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
            <div className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
              Скасувати підписку?
            </div>

            {/* Головне — першим рядком. Людина, яка боїться втратити
                доступ прямо зараз, не дочитає до другого. */}
            <div className="mt-1.5 text-[12.5px] leading-[18px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Доступ працюватиме до {fmtDate(view.validUntil)} — гроші за цей період уже сплачені,
              і забирати його ми не будемо. Далі списань не буде.
            </div>

            <div className="mt-3.5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={canceling || preview}
                onClick={doCancel}
                className="flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]"
                style={{
                  fontFamily: T.sans,
                  background: `rgba(${T.badRgb},0.12)`,
                  border: `1px solid rgba(${T.badRgb},0.3)`,
                  color: T.bad,
                  opacity: canceling || preview ? 0.5 : 1,
                }}
              >
                {canceling ? <Loader2 size={13} strokeWidth={3} className="animate-spin" /> : <X size={13} strokeWidth={2.6} />}
                Так, скасувати
              </button>

              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold transition-colors duration-200"
                style={{ fontFamily: T.sans, background: 'transparent', border: `1px solid ${T.line}`, color: T.text2 }}
              >
                Лишити
              </button>
            </div>

            {err && (
              <p className="mt-2.5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.bad }}>{err}</p>
            )}
          </div>
        )}

        {previewBar}
      </div>
    );
  }

  /* ---------- ще не підписаний ---------- */
  const trialAvailable = !view.trialUsed;

  return (
    <div className="flex flex-col gap-4">
      <Stage tone="acc">
        <div className="relative">
          <SubscriptionScene height={168} tone="acc" />
          <Brand tone="acc" />
        </div>

        <div className="px-6 pb-7 pt-5">
          {/* Перемикач періоду. Річний першим не ставимо: спершу
              людина має зрозуміти місячну ціну, і тільки маючи її в
              голові — оцінити знижку. */}
          <div
            className="flex w-fit rounded-xl p-1"
            style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${T.line}` }}
          >
            {Object.values(PLANS).map((p) => {
              const on = p.id === period;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className="relative rounded-lg px-4 py-1.5 text-[12.5px] font-bold transition-colors duration-200"
                  style={{ fontFamily: T.sans, color: on ? T.text : T.text3 }}
                >
                  {on && (
                    <motion.span
                      layoutId="sub-period"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: `rgba(${T.accRgb},0.2)`,
                        border: `1px solid rgba(${T.accRgb},0.34)`,
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{p.period === 'yearly' ? 'Рік' : 'Місяць'}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <Price plan={plan} />
          </div>

          {/* Висота зарезервована під підпис, навіть коли його немає.
              Інакше при перемиканні на місяць уся карта підстрибує на
              22 пікселі — і рух ціни, заради якого все й робилось,
              тоне в цьому стрибку. */}
          <div className="h-[22px]">
            <AnimatePresence mode="wait" initial={false}>
              {plan.note && (
                <motion.div
                  key={plan.id}
                  className="text-[13px] font-semibold"
                  style={{ fontFamily: T.sans, color: T.ok }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {plan.note}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="my-5 h-px w-full" style={{ background: T.line }} />

          <div className="flex flex-col gap-4">
            {Object.entries(PRO_FEATURES).map(([k, f]) => (
              <Feature key={k} k={k} title={f.title} hint={f.hint} />
            ))}
          </div>

          {/* Та сама родина, що «Add Trade» у журналі й «New plan» у
              плані: темна плита, акцентна рамка, а під курсором напис
              гасне й усередині малюється те, про що кнопка.

              Тут це чотирнадцять днів, які заповнюються зліва
              направо. Останній лишається порожнім, у пунктирі: саме
              на ньому підписка стає платною. Найважливіше про цю
              кнопку сказано не текстом, а тим, що людина бачить.

              Подробиці — у `.sub-cta` в index.css. */}
          <button
            type="button"
            disabled={busy || preview}
            onClick={() => go({ trial: trialAvailable })}
            className="sub-cta group mt-6 inline-flex h-[54px] w-full items-center justify-center rounded-2xl px-6 text-[14.5px] font-bold"
            style={{
              background: 'linear-gradient(180deg, var(--edge-surface-hi, #18181C), var(--edge-sunken, #0D0D10))',
              border: `1px solid ${T.lineAcc}`,
              color: T.text,
              fontFamily: T.sans,
              boxShadow: `0 10px 28px -12px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`,
              opacity: busy || preview ? 0.55 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = `0 16px 40px -12px rgba(${T.accRgb},0.85), inset 0 1px 0 rgba(255,255,255,0.07)`;
              e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.6)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = `0 10px 28px -12px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`;
              e.currentTarget.style.borderColor = T.lineAcc;
            }}
          >
            {/* Чотирнадцять стовпчиків: тринадцять безкоштовних і
                один, на якому почнеться списання. */}
            {trialAvailable && !busy && (
              <span className="sub-cta-days" aria-hidden>
                {Array.from({ length: TRIAL_DAYS }, (_, i) => (
                  <span
                    key={i}
                    className={`sub-cta-day${i === TRIAL_DAYS - 1 ? ' is-charge' : ''}`}
                  />
                ))}
              </span>
            )}

            <span className="sub-cta-label inline-flex items-center gap-2">
              {busy && <Loader2 size={15} strokeWidth={3} className="animate-spin" style={{ color: T.acc }} />}
              {/* Без тріалу це кнопка оплати — підпис за брендбуком
                  plata by mono: назва способу оплати, без логотипів
                  платіжних систем. */}
              {trialAvailable ? `${TRIAL_DAYS} днів безкоштовно` : 'Онлайн-оплата карткою'}
            </span>

          </button>

          {/* Умови списання — не дрібний сірий шрифт.

              Саме цей рядок вирішує, чи буде повернення й чарджбек, і
              ховати його в text4 на темному (контраст 2.3:1) — це не
              делікатність, а пастка. */}
          <p className="mt-3 text-center text-[12.5px] leading-[18px]" style={{ fontFamily: T.sans, color: T.text2 }}>
            {trialAvailable
              ? `Для перевірки картки спишемо 1 ₴ і одразу повернемо. Перше списання за підписку — через ${TRIAL_DAYS} днів, скасувати можна раніше.`
              : 'Пробний період уже використано на цьому акаунті.'}
          </p>
          {/* Брендбук mono дозволяє текстом уточнити способи оплати —
              це знімає питання «а якщо в мене не моно». */}
          <p className="mt-1 text-center text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            Картка будь-якого банку, Apple Pay або Google Pay
          </p>

          {err && (
            <p className="mt-2 text-center text-[12.5px]" style={{ fontFamily: T.sans, color: T.bad }}>
              {err}
            </p>
          )}
        </div>
      </Stage>

      <p className="text-[12.5px] leading-[18px]" style={{ fontFamily: T.sans, color: T.text3 }}>
        Журнал, аналітика й калькулятор лишаються безкоштовними назавжди, без обмежень
        на кількість угод. Платне — те, що працює, поки ти спиш.
      </p>

      {previewBar}
    </div>
  );
}
