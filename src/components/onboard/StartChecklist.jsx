import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, Plug, PenLine, Eye, Send, ShieldCheck } from 'lucide-react';
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
  demoUrl, markDemoSeen, demoSeen,
} from '../../lib/onboard';

/* ==================================================================
   Чекліст першого запуску на Лаунчпаді.

   Чотири пункти, кожен відмічається сам за фактом у базі: є угода чи
   MT5, відкривали демо, підключений бот. Без перезавантаження —
   перевіряємо при поверненні на вкладку й раз на 10 секунд, поки
   чекліст на екрані.

   Зникає, коли зроблено 3 з 4 або минуло 7 днів від реєстрації.
   Згорнути можна, закрити назавжди — ні, поки ці 7 днів не минули.
================================================================== */

async function loadFacts(uid) {
  const [tr, mt, tg] = await Promise.all([
    supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('mt5_accounts').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('user_settings').select('tg_chat_id').eq('user_id', uid).maybeSingle(),
  ]);
  return { trades: tr.count || 0, mt5: mt.count || 0, tg: !!tg.data?.tg_chat_id };
}

export default function StartChecklist() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const answers = useOnboardAnswers();
  const [list, setList, { ready }] = useCloudState(LIST_KEY, LIST_EMPTY, { normalize: normalizeList });
  const [facts, setFacts] = useState(null);
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
    const f = facts || { trades: 0, mt5: 0, tg: false };
    return [
      { id: 'account', done: true },
      { id: 'first_trade', done: f.trades > 0 || f.mt5 > 0 },
      { id: 'demo', done: list.demo || demoSeen() },
      { id: 'bot', done: f.tg },
    ];
  }, [facts, list.demo]);

  const doneCount = steps.filter((s) => s.done).length;
  const finished = doneCount >= 3;

  /* Події аналітики — один раз на кожен крок, а не на кожен рендер. */
  useEffect(() => {
    if (!ready || !facts) return;
    const fresh = steps.filter((s) => s.done && !list.steps.includes(s.id)).map((s) => s.id);
    const nowDone = finished && !list.done;
    if (!fresh.length && !nowDone && !(steps[2].done && !list.demo)) return;
    fresh.forEach((id) => track('checklist_step', { step: id }));
    if (nowDone) {
      track('checklist_done', { min: user?.created_at ? Math.round((Date.now() - new Date(user.created_at).getTime()) / 60000) : null });
    }
    setList({ ...list, steps: [...list.steps, ...fresh], done: list.done || finished, demo: list.demo || steps[2].done });
  }, [ready, facts, steps, finished, list, setList, user?.created_at]);

  if (!ready || !facts || expired || finished || list.done) return null;

  const manualFirst = noAutoImport(answers);
  const openDemo = () => {
    markDemoSeen();
    setList({ ...list, demo: true });
    track('demo_opened', { from: 'checklist' });
    navigate(demoUrl('journal'));
  };
  const addManual = () => navigate('/journal?new=1');

  const left = 4 - doneCount;

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
            {tx('і журнал покаже, де ти втрачаєш гроші', 'and the journal will show where you lose money')}
          </div>
        </div>
        <span className="flex items-center gap-2 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {doneCount}/4 {list.collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
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

              <Item
                step={steps[1]}
                title={manualFirst ? tx('Внести першу угоду', 'Log your first trade') : tx('Підключити MT5 або внести угоду', 'Connect MT5 or log a trade')}
                sub={manualFirst
                  ? tx(`Автоімпорту з ${platformName(answers.platform)} поки немає: внеси угоду вручну, це хвилина. Повідомимо, коли підключимо твою платформу.`, `There is no auto-import from ${platformName(answers.platform)} yet: log a trade manually, it takes a minute. We will let you know when we add your platform.`)
                  : tx('2 хвилини, доступ лише на читання. Угоди підтягнуться самі.', '2 minutes, read-only access. Trades will sync on their own.')}
              >
                {manualFirst ? (
                  <>
                    <Btn primary icon={PenLine} onClick={addManual}>{tx('Внести вручну', 'Log manually')}</Btn>
                    <Btn icon={Plug} onClick={() => openSettings('connect')}>{tx('Підключити MT5', 'Connect MT5')}</Btn>
                  </>
                ) : (
                  <>
                    <Btn primary icon={Plug} onClick={() => openSettings('connect')}>{tx('Підключити MT5', 'Connect MT5')}</Btn>
                    <Btn icon={PenLine} onClick={addManual}>{tx('Внести вручну', 'Log manually')}</Btn>
                  </>
                )}
              </Item>

              <Item step={steps[2]} title={tx('Подивитись приклад статистики', 'See an example of the stats')} sub={tx('Журнал на демо-угодах: крива в R, сесії, помилки.', 'The journal on demo trades: R curve, sessions, mistakes.')}>
                <Btn icon={Eye} onClick={openDemo}>{tx('Показати на прикладі', 'Show me an example')}</Btn>
              </Item>

              <Item step={steps[3]} title={tx('Підключити Telegram-бота', 'Connect the Telegram bot')} sub={tx('Нові угоди, нагадування і підсумок дня просто в чат.', 'New trades, reminders and the daily wrap right in your chat.')}>
                <Btn icon={Send} onClick={() => openSettings('telegram')}>{tx('Підключити бота', 'Connect the bot')}</Btn>
              </Item>
            </div>

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
