import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { T } from '../../lib/theme';
import { money2 } from '../../lib/accountsStore';

/* ==================================================================
   Крива балансу рахунку.

   Та сама recharts-площина, що й крива R у журналі: сітка лише
   горизонтальна, осі без ліній, заливка градієнтом від кольору лінії
   в прозорість. Один графік на два розділи — людина вчиться читати
   його один раз.

   Раніше тут був власний SVG зі ступінчастою лінією й вузлами. Він
   малювався по подіях, де кожна точка — стрибок балансу в день
   виплати, і ступінька мала сенс. Але для підключеного терміналу
   точки приходять щогодини, і сходинки перетворювались на частокіл.

   Колір лінії — від напрямку: вище старту зелена, нижче червона.
   Це те саме правило, що в журналі, і його не треба пояснювати.
================================================================== */

const fmtDay = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        background: T.surfaceHi,
        border: `1px solid ${T.lineHi}`,
        boxShadow: '0 20px 44px -18px rgba(0,0,0,0.8)',
      }}
    >
      <div className="text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {fmtDay(p.date)}
      </div>
      <div className="mt-0.5 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
        {money2(p.value)}
      </div>
      {!!p.amount && (
        <div
          className="mt-0.5 text-[12px] font-semibold tabular-nums"
          style={{ fontFamily: T.mono, color: p.amount >= 0 ? T.ok : T.bad }}
        >
          {p.amount > 0 ? '+' : '−'}{money2(Math.abs(p.amount))}
        </div>
      )}
    </div>
  );
}

export default function BalanceChart({ events, initial }) {
  const data = useMemo(() => (events || []).map((e) => ({
    date: e.happened_at,
    name: fmtDay(e.happened_at),
    value: Number(e.balance_after) || 0,
    amount: Number(e.amount) || 0,
  })), [events]);

  if (data.length < 2) {
    return (
      <div className="flex h-[264px] flex-col items-center justify-center gap-2">
        <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          Ще замало точок для кривої
        </span>
        <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4, opacity: 0.7 }}>
          Вона зʼявиться, щойно баланс зрушить
        </span>
      </div>
    );
  }

  const start = initial || data[0].value;
  const up = data[data.length - 1].value >= start;
  const tone = up ? T.ok : T.bad;

  return (
    <div className="h-[264px] w-full px-2 pb-2 pt-4" style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 16, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="accBalance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity={0.2} />
              <stop offset="100%" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={T.line} strokeDasharray="0" vertical={false} />

          <XAxis
            dataKey="name"
            stroke="transparent"
            tick={{ fill: T.text3, fontSize: 12, fontFamily: T.sans }}
            tickLine={false}
            axisLine={false}
            dy={8}
            minTickGap={28}
          />
          <YAxis
            stroke="transparent"
            tick={{ fill: T.text3, fontSize: 12, fontFamily: T.sans }}
            tickLine={false}
            axisLine={false}
            width={56}
            /* Баланс живе далеко від нуля, тож шкала від нуля
               перетворила б будь-який рух на пряму лінію. */
            domain={['dataMin - dataMin * 0.002', 'dataMax + dataMax * 0.002']}
            tickFormatter={(v) => `$${Math.round(v).toLocaleString('en-US')}`}
          />

          <Tooltip
            cursor={{ stroke: T.lineHi, strokeWidth: 1, strokeDasharray: '4 4' }}
            content={<ChartTip />}
          />

          <Area
            type="monotone"
            dataKey="value"
            stroke={tone}
            strokeWidth={2}
            fill="url(#accBalance)"
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
            dot={false}
            activeDot={{ r: 4, fill: tone, stroke: T.surface, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
