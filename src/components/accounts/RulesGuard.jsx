import { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, Send, Lock } from 'lucide-react';
import { T } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { openSettings } from '../../lib/settings';
import useSubscription from '../../hooks/useSubscription';
import { getTradeProfit } from '../../utils/journalUtils';

/* ==================================================================
   Контроль правил пропфірми.

   Дві смуги, які людина має бачити перед кожною угодою: скільки
   денного ліміту вже з'їдено сьогодні і скільки лишилось до загальної
   межі. Відсотки — як у FTMO і більшості
   пропів, від розміру рахунку (а не від піку: це інша метрика, вона нижче, у «Просадці»).

   Денний збиток тут — сума закритих сьогодні угод. Відкриті позиції й
   точний старт дня за часом пропу бачить лише сервер (знімки MT5), тому
   Telegram-алерти рахує він (netlify/functions/_prop.mjs), а тут —
   швидка підказка без зайвих запитів.
================================================================== */

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const num = (v) => {
  const x = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : 0;
};

const toneOf = (share) => (share >= 90 ? 'bad' : share >= 70 ? 'warn' : 'ok');
const fmt = (v) => `$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

function Bar({ label, share, used, limit, note }) {
  const tone = toneOf(share);
  const color = T[tone];
  return (
    <div className="min-w-0 rounded-xl p-3.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>{label}</span>
        <span className="text-[13px] font-bold tabular-nums" style={{ fontFamily: T.mono, color }}>{Math.min(999, Math.round(share))}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: T.line }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, share)}%`, background: color }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
        <span>{fmt(used)}</span>
        <span>{tx('ліміт', 'limit')} {fmt(limit)}</span>
      </div>
      {note && <div className="mt-1.5 text-[12px] leading-[1.45]" style={{ fontFamily: T.sans, color: share >= 70 ? color : T.text2 }}>{note}</div>}
    </div>
  );
}

export default function RulesGuard({ account, phase, trades, balance, initial }) {
  const sub = useSubscription();
  /* Від розміру рахунку, як у FTMO і більшості пропів (на 2-му етапі
     баланс стартує з того ж розміру). */
  const base = num(initial) || num(phase?.starting_balance);
  const dailyPct = num(phase?.daily_loss_pct ?? account.max_daily_loss_pct);
  const totalPct = num(phase?.max_drawdown_pct ?? account.max_total_loss_pct);

  const today = useMemo(() => {
    const d = todayLocal();
    /* Відкриті, пропущені й без результату — не рахуються: грошей ще
       немає (відкриту позицію для Pro враховує сервер через equity). */
    const rows = (trades || []).filter((t) => String(t.plan_date || '').slice(0, 10) === d
      && !/progress|missed|not selected/i.test(String(t.result || 'not selected')));
    /* Гроші угоди — як у журналі: profit_money з MT5, а для ручних —
       R × ризик (% від розміру рахунку або $). */
    const map = { [account.firm_name]: num(initial) };
    const vals = rows.map((t) => getTradeProfit({ ...t, account_name: account.firm_name }, map)).filter((v) => v != null && Number.isFinite(v));
    const pnl = vals.reduce((s, v) => s + v, 0);
    const known = vals.length;
    return { pnl, count: rows.length, unknown: rows.length - known };
  }, [trades, account.firm_name, initial]);

  if (!base) return null;

  if (!dailyPct && !totalPct) {
    return (
      <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: T.surface, border: `1px dashed ${T.lineHi || T.line}` }}>
        <ShieldCheck size={18} style={{ color: T.text3, flexShrink: 0, marginTop: 2 }} />
        <div className="text-[13px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {tx('Вкажи денний ліміт і максимальну просадку свого пропу в блоці нижче — і тут зʼявиться контроль правил: скільки ще можна втратити сьогодні і до зливу рахунку.', 'Set your prop firm\'s daily limit and max drawdown below, and this block will show how much you can still lose today and before the account is breached.')}
        </div>
      </div>
    );
  }

  const dayLimit = (dailyPct / 100) * base;
  const dayLost = Math.max(0, -today.pnl);
  const dayShare = dayLimit ? (dayLost / dayLimit) * 100 : 0;

  const totLimit = (totalPct / 100) * base;
  const totLost = Math.max(0, base - balance);
  const totShare = totLimit ? (totLost / totLimit) * 100 : 0;

  const worst = Math.max(dailyPct ? dayShare : 0, totalPct ? totShare : 0);
  const Icon = worst >= 70 ? ShieldAlert : ShieldCheck;
  const headTone = T[toneOf(worst)];

  const dayNote = dailyPct
    ? dayShare >= 100
      ? tx('Денний ліміт перевищено. На сьогодні все.', 'Daily limit breached. Done for today.')
      : tx(`Сьогодні можна втратити ще ${fmt(dayLimit - dayLost)}.`, `You can lose ${fmt(dayLimit - dayLost)} more today.`)
    : null;
  const totNote = totalPct
    ? totShare >= 100
      ? tx('Загальну межу перетнуто.', 'Max drawdown breached.')
      : tx(`До зливу рахунку ${fmt(totLimit - totLost)}.`, `${fmt(totLimit - totLost)} until the account is breached.`)
    : null;

  const mt5 = !!account.mt5_account_id;

  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: T.surface, border: `1px solid ${worst >= 70 ? headTone : T.line}` }}>
      <div className="mb-3 flex items-center gap-2.5">
        <Icon size={18} style={{ color: headTone }} />
        <div className="text-[15px] font-bold" style={{ fontFamily: T.display || T.sans, color: T.text }}>
          {tx('Контроль правил', 'Rule guard')}
        </div>
        <span className="ml-auto text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {tx(`від розміру рахунку ${fmt(base)}`, `of account size ${fmt(base)}`)}
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {!!dailyPct && <Bar label={tx(`Денний ліміт · ${dailyPct}%`, `Daily limit · ${dailyPct}%`)} share={dayShare} used={dayLost} limit={dayLimit} note={dayNote} />}
        {!!totalPct && <Bar label={tx(`Макс. просадка · ${totalPct}%`, `Max drawdown · ${totalPct}%`)} share={totShare} used={totLost} limit={totLimit} note={totNote} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
        {sub.isPro && mt5 ? (
          <>
            <Send size={13} style={{ color: T.acc }} />
            {tx('Pro: на 70% і 90% ліміту бот напише в Telegram (equity з MT5, день за часом пропу).', 'Pro: the bot pings you in Telegram at 70% and 90% of a limit (MT5 equity, prop-firm day).')}
            <button type="button" onClick={() => openSettings('telegram')} className="font-semibold underline underline-offset-4" style={{ color: T.text2 }}>
              {tx('Бот', 'Bot')}
            </button>
          </>
        ) : sub.isPro ? (
          <>
            <Send size={13} style={{ color: T.acc }} />
            {tx('Алерти в Telegram працюють для рахунків з підключеним MT5.', 'Telegram alerts work for accounts with MT5 connected.')}
          </>
        ) : (
          <>
            <Lock size={13} />
            {tx('Попередження в Telegram на 70% і 90% ліміту — у Pro.', 'Telegram warnings at 70% and 90% of a limit are in Pro.')}
            <button type="button" onClick={() => openSettings('billing', { plan: 'pro' })} className="font-semibold underline underline-offset-4" style={{ color: T.acc }}>
              {tx('Спробувати Pro', 'Try Pro')}
            </button>
          </>
        )}
      </div>
      {today.unknown > 0 && (
        <div className="mt-1.5 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {tx(`Сьогоднішніх угод без R чи ризику: ${today.unknown} — у денний ліміт вони не потрапили.`, `Today's trades without R or risk: ${today.unknown} — not counted in the daily limit.`)}
        </div>
      )}
    </div>
  );
}
