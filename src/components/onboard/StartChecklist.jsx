import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, Plug, PenLine, Eye, Send, ShieldCheck, Lock, FlaskConical, CalendarCheck, Gift, X } from 'lucide-react';
import useSubscription from '../../hooks/useSubscription';
import { TRIAL_DAYS } from '../../lib/billing';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import useCloudState from '../../hooks/useCloudState';
import useOnboardAnswers from '../../hooks/useOnboardAnswers';
import { openSettings } from '../../lib/settings';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/analytics';
import {
  LIST_KEY, LIST_EMPTY, normalizeList, CHECKLIST_DAYS, noAutoImport, platformName,
  demoUrl, markDemoSeen, demoSeen, isWarmingUp,
} from '../../lib/onboard';

/* ==================================================================
   Чекліст першого запуску на Лаунчпаді.

   Основні кроки — лише безкоштовні: план, перша угода, приклад
   статистики. За них — +1 бектест (claim_checklist_bonus у базі сама
   перевіряє план і угоду). Платне — окремим блоком під замочком, з
   тарифом і умовами тріалу: воно не блокує завершення чекліста.

   Чотири пункти, кожен відмічається сам за фактом у базі: є угода чи
   MT5, відкривали демо, підключений бот. Без перезавантаження —
   перевіряємо при поверненні на вкладку й раз на 10 секунд, поки
   чекліст на екрані.

   Зникає, коли зроблено 3 з 4 або минуло 7 днів від реєстрації.
   Згорнути можна, закрити назавжди — ні, поки ці 7 днів не минули.
================================================================== */

async function loadFacts(uid) {
  const [tr, mt, tg, pl] = await Promise.all([
    supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('mt5_accounts').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('user_settings').select('tg_chat_id').eq('user_id', uid).maybeSingle(),
    supabase.from('trading_plans').select('id', { count: 'exact', head: true }).eq('user_id', uid),
  ]);
  return { trades: tr.count || 0, mt5: mt.count || 0, tg: !!tg.data?.tg_chat_id, plans: pl.count || 0 };
}

export default function StartChecklist() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const answers = useOnboardAnswers();
  const [list, setList, { ready }] = useCloudState(LIST_KEY, LIST_EMPTY, { normalize: normalizeList });
  const [facts, setFacts] = useState(null);
  const sub = useSubscription();
  const alive = useRef(true);

  const ageDays = user?.created_at ? (Date.now() - new Date(user.created_at).getTime()) / 86400000 : 0;
  const expired = ageDays > CHECKLIST_DAYS;

  const refresh = useCallback(() => {
    if (!user?.id) return;
    loadFacts(user.id).then((f) => { if (alive.current) setFacts(f); }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    alive.current = true;
    if (expired) return () => { alive.current = false; };
    refresh();
    const vis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', vis);
    const id = setInterval(refresh, 10000);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', vis);
      clearInterval(id);
    };
  }, [refresh, expired]);

  const steps = useMemo(() => {
    const f = facts || { trades: 0, mt5: 0, tg: false, plans: 0 };
    return [
      { id: 'account', done: true },
      { id: 'plan', done: f.plans > 0 },
      { id: 'first_trade', done: f.trades > 0 || f.mt5 > 0 },
      { id: 'demo', done: list.demo || demoSeen() },
    ];
  }, [facts, list.demo]);

  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const finished = doneCount >= total;

  /* Нагорода. Просимо базу один раз; вона сама перевіряє план і угоду
     й не видасть бонус удруге. */
  const [bonus, setBonus] = useState(null); // null | 'given' | 'already'
  const claiming = useRef(false);
  useEffect(() => {
    if (!ready || !finished || list.bonus || claiming.current) return;
    claiming.current = true;
    supabase.rpc('claim_checklist_bonus').then(({ data }) => {
      if (!alive.current) return;
      if (data?.ok) {
        setBonus(data.already ? 'already' : 'given');
        setList((cur) => ({ ...normalizeList(cur), bonus: true }));
        if (!data.already) track('checklist_bonus');
      }
    }).catch(() => {}).finally(() => { claiming.current = false; });
  }, [ready, finished, list.bonus, setList]);

  /* Події аналітики — один раз на кожен крок, а не на кожен рендер. */
  useEffect(() => {
    if (!ready || !facts) return;
    const fresh = steps.filter((s) => s.done && !list.steps.includes(s.id)).map((s) => s.id);
    const nowDone = finished && !list.done;
    if (!fresh.length && !nowDone && !(steps[3].done && !list.demo)) return;
    fresh.forEach((id) => track('checklist_step', { step: id }));
    if (nowDone) {
      track('checklist_done', { min: user?.created_at ? Math.round((Date.now() - new Date(user.created_at).getTime()) / 60000) : null });
    }
    setList({ ...list, steps: [...list.steps, ...fresh], done: list.done || finished, demo: list.demo || steps[3].done });
  }, [ready, facts, steps, finished, list, setList, user?.created_at]);

  /* Щойно завершили — показуємо нагороду, поки людина її не закриє. */
  if (ready && (bonus === 'given' || (list.bonus && list.done && !list.bonusSeen && bonus !== 'already'))) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 sm:p-5"
        style={{ background: `linear-gradient(130deg, rgba(${T.okRgb},0.12), ${T.surface} 60%)`, border: `1px solid rgba(${T.okRgb},0.35)` }}
      >
        <div className="flex items-start gap-3">
          <Gift size={22} style={{ color: T.ok, marginTop: 2 }} />
          <div>
            <div className="text-[17px] font-bold" style={{ fontFamily: T.display, color: T.text }}>{tx('Готово! +1 безкоштовний бектест', 'Done! +1 free backtest')}</div>
            <div className="mt-0.5 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{tx('Перевір стратегію на реальних хвилинках FTMO.', 'Test your strategy on real FTMO minute data.')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/backtest')} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13.5px] font-semibold" style={{ fontFamily: T.sans, background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)' }}>
            <FlaskConical size={14} strokeWidth={2.4} />{tx('Відкрити бектести', 'Open backtests')}
          </button>
          <button type="button" aria-label={tx('Закрити', 'Close')} onClick={() => { setBonus(null); setList({ ...list, bonusSeen: true }); }} className="grid h-9 w-9 place-items-center rounded-lg" style={{ color: T.text3, border: `1px solid ${T.line}` }}>
            <X size={15} />
          </button>
        </div>
      </motion.section>
    );
  }

  if (!ready || !facts || expired || finished || list.done) return null;

  const manualFirst = noAutoImport(answers);
  const openDemo = () => {
    markDemoSeen();
    setList({ ...list, demo: true });
    track('demo_opened', { from: 'checklist' });
    window.location.assign(demoUrl('analytics'));
  };
  const addManual = () => navigate('/journal?new=1');

  const left = total - doneCount;

  /* Платне — під замочком. Показуємо лише те, чого в людини ще немає. */
  const locked = [
    !sub.isPro && { id: 'mt5', tier: 'Pro', icon: Plug, title: tx('Автоімпорт з MT5', 'MT5 auto-import'), sub: tx('Угоди підтягуються самі, без ручного вводу.', 'Trades sync on their own, no manual entry.'), go: () => openSettings('connect') },
    !sub.hasLite && { id: 'bot', tier: 'Lite', icon: Send, title: tx('Telegram-бот', 'Telegram bot'), sub: tx('План, нагадування і підсумок дня в чат.', 'Plan, reminders and daily wrap in your chat.'), go: () => openSettings('telegram') },
    !sub.hasLite && { id: 'bt', tier: 'Lite', icon: FlaskConical, title: tx('Бектести без обмежень', 'Unlimited backtests'), sub: tx('Безкоштовно — 2, за цей чекліст ще +1.', 'Free plan — 2, plus 1 for this checklist.'), go: () => openSettings('billing', { plan: 'lite' }) },
  ].filter(Boolean);

  const Item = ({ step, title, sub, children }) => (
    <div className="flex items-start gap-3 rounded-xl px-3 py-3" style={{ background: step.done ? 'transparent' : T.sunken }}>
      <span
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full"
        style={{ background: step.done ? T.ok : 'transparent', border: step.done ? 'none' : `1.5px solid ${T.lineHi}`, color: '#0A0A0C' }}
      >
        {step.done && <Check size={14} strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold" style={{ fontFamily: T.sans, color: step.done ? T.text3 : T.text, textDecoration: step.done ? 'line-through' : 'none' }}>
          {title}
        </div>
        {!step.done && sub && (
          <div className="mt-0.5 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>{sub}</div>
        )}
        {!step.done && children && <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );

  const Btn = ({ primary, icon: Icon, onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13.5px] font-semibold"
      style={{
        fontFamily: T.sans,
        background: primary ? T.acc : 'transparent',
        color: primary ? 'var(--edge-on-acc, #0A0A0C)' : T.text,
        border: primary ? 'none' : `1px solid ${T.lineHi}`,
      }}
    >
      {Icon && <Icon size={14} strokeWidth={2.4} />}{children}
    </button>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="mb-7 rounded-2xl p-4 sm:p-5"
      style={{ background: `linear-gradient(130deg, rgba(${T.accRgb},0.10), ${T.surface} 60%)`, border: `1px solid rgba(${T.accRgb},0.32)` }}
    >
      <button type="button" onClick={() => setList({ ...list, collapsed: !list.collapsed })} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <div className="text-[18px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
            {tx(`Залишилось ${left} ${left === 1 ? 'крок' : 'кроки'}`, `${left} ${left === 1 ? 'step' : 'steps'} left`)}
          </div>
          <div className="mt-1 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {tx('і отримаєш +1 безкоштовний бектест', 'and get +1 free backtest')}
          </div>
        </div>
        <span className="flex items-center gap-2 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {doneCount}/{total} {list.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!list.collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-4 grid gap-1.5">
              <Item step={steps[0]} title={tx('Створити акаунт', 'Create an account')} />

              <Item step={steps[1]} title={tx('Заповнити план на сьогодні', 'Fill in today\'s plan')} sub={tx('Актив, напрямок і рівні — 2 хвилини перед сесією.', 'Asset, bias and levels — 2 minutes before the session.')}>
                <Btn primary icon={CalendarCheck} onClick={() => navigate('/plan')}>{tx('Відкрити план', 'Open the plan')}</Btn>
              </Item>

              <Item
                step={steps[2]}
                title={tx('Внести першу угоду', 'Log your first trade')}
                sub={manualFirst
                  ? tx(`Автоімпорту з ${platformName(answers.platform)} поки немає: внеси угоду вручну, це хвилина.`, `There is no auto-import from ${platformName(answers.platform)} yet: log a trade manually, it takes a minute.`)
                  : tx('Хвилина: інструмент, результат, причина входу.', 'A minute: instrument, result, reason for entry.')}
              >
                <Btn primary={steps[1].done} icon={PenLine} onClick={addManual}>{tx('Внести вручну', 'Log manually')}</Btn>
                {/* Ще не торгує регулярно — даємо потренуватись на історії. */}
                {isWarmingUp(answers) && (
                  <Btn icon={FlaskConical} onClick={() => navigate('/backtest')}>{tx('Спершу бектест', 'Backtest first')}</Btn>
                )}
              </Item>

              <Item step={steps[3]} title={tx('Подивитись приклад статистики', 'See an example of the stats')} sub={tx('Журнал на демо-угодах: крива в R, сесії, помилки.', 'The journal on demo trades: R curve, sessions, mistakes.')}>
                <Btn icon={Eye} onClick={openDemo}>{tx('Показати на прикладі', 'Show me an example')}</Btn>
              </Item>
            </div>

            {locked.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 px-1 text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.2em', color: T.text4 }}>
                  {tx('Ще більше — у Lite і Pro', 'Even more — in Lite and Pro')}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  {locked.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => { track('checklist_locked', { item: l.id }); l.go(); }}
                      className="flex flex-col items-start gap-1 rounded-xl px-3 py-3 text-left transition-colors"
                      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                          <Lock size={13} style={{ color: T.text4 }} />{l.title}
                        </span>
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.1em', color: T.acc, background: `rgba(${T.accRgb},0.12)` }}>{l.tier}</span>
                      </span>
                      <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{l.sub}</span>
                      <span className="text-[12px] font-semibold" style={{ fontFamily: T.sans, color: T.acc }}>
                        {tx(`${TRIAL_DAYS} днів безкоштовно · потрібна картка`, `${TRIAL_DAYS} days free · card required`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {answers.goal === 'challenge' && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-3" style={{ border: `1px dashed rgba(${T.accRgb},0.45)` }}>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={18} style={{ color: T.acc, marginTop: 2 }} />
                  <div>
                    <div className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>{tx('Правила пропу · скоро', 'Prop rules · soon')}</div>
                    <div className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {tx('Журнал рахуватиме денний ліміт і просадку твого челенджу.', 'The journal will track the daily limit and drawdown of your challenge.')}
                    </div>
                  </div>
                </div>
                {list.propInterest ? (
                  <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.ok }}>{tx('Повідомимо першим', 'You will be the first to know')}</span>
                ) : (
                  <Btn onClick={() => { setList({ ...list, propInterest: true }); track('prop_rules_interest'); }}>{tx('Хочу першим', 'Notify me')}</Btn>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
