import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Info, Loader2, Check } from 'lucide-react';

import { T } from '../../lib/theme';
import { useAuth } from '../../context/AuthContext';
import { saveRules } from '../../lib/accountsStore';
import { simulate, verdict, tradesPerDay, MIN_TRADES } from '../../lib/monteCarlo';

/* ==================================================================
   Чи виживе рахунок.

   Три відповіді на щоденне питання проп-трейдера: дійду до цілі, зіллю
   на межі, чи просто далі торгуватиму. Рахується з реального
   розподілу R саме цього рахунку.

   Що тут свідомо зроблено «незручно»: правила не підставляються
   типовими 5/10/8. Підставлене число виглядає як перевірене, і
   людина не помітить, що воно чуже — а весь розрахунок стоїть саме
   на ньому. Краще один раз спитати.
================================================================== */

const FIELDS = [
  { id: 'daily_loss_pct', label: 'Денний ліміт', hint: '% від старту за добу', ph: '5' },
  { id: 'max_drawdown_pct', label: 'Макс. просадка', hint: 'загальна межа, %', ph: '10' },
  { id: 'profit_target_pct', label: 'Ціль етапу', hint: 'прибуток для проходу, %', ph: '8' },
];

function Num({ label, hint, value, ph, onChange }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </span>
      <div
        className="flex h-11 items-center gap-1.5 rounded-xl px-3"
        style={{ background: T.sunken, border: `1px solid ${T.line}` }}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder={ph}
          inputMode="decimal"
          className="w-full min-w-0 bg-transparent text-[14px] font-bold outline-none placeholder:opacity-40"
          style={{ fontFamily: T.mono, color: T.text }}
        />
        <span className="shrink-0 text-[12.5px] font-bold" style={{ fontFamily: T.mono, color: T.text4 }}>%</span>
      </div>
      <span className="mt-1 block text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>{hint}</span>
    </label>
  );
}

function Odds({ label, value, tone, hint }) {
  return (
    <div className="min-w-0 rounded-xl p-3.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </div>
      <div className="text-[23px] font-bold tabular-nums leading-none" style={{ fontFamily: T.mono, color: tone }}>
        {value}%
      </div>
      {hint && (
        <div className="mt-1.5 text-[11px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.45 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function Survival({ account, trades, loading, onUpdate }) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    daily_loss_pct: account.daily_loss_pct ?? '',
    max_drawdown_pct: account.max_drawdown_pct ?? '',
    profit_target_pct: account.profit_target_pct ?? '',
  });
  const [risk, setRisk] = useState('1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      daily_loss_pct: account.daily_loss_pct ?? '',
      max_drawdown_pct: account.max_drawdown_pct ?? '',
      profit_target_pct: account.profit_target_pct ?? '',
    });
  }, [account.id, account.daily_loss_pct, account.max_drawdown_pct, account.profit_target_pct]);

  const num = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const hasRules = num(form.daily_loss_pct) || num(form.max_drawdown_pct) || num(form.profit_target_pct);

  const sim = useMemo(() => {
    if (loading || !hasRules) return null;
    return simulate(trades, {
      riskPct: num(risk) || 1,
      dailyPct: num(form.daily_loss_pct),
      ddPct: num(form.max_drawdown_pct),
      targetPct: num(form.profit_target_pct),
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [trades, loading, form, risk, hasRules]);

  const v = verdict(sim);

  const save = async () => {
    setSaving(true);
    try {
      const row = await saveRules(user.id, account.id, form);
      onUpdate?.({ ...account, ...row });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      /* мовчки: правила лишаються у формі, порахувати можна й без збереження */
    } finally {
      setSaving(false);
    }
  };

  const perDay = useMemo(() => tradesPerDay(trades), [trades]);

  return (
    <div
      className="mb-4 overflow-hidden rounded-2xl"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        <ShieldAlert size={13} strokeWidth={2.4} style={{ color: T.warn }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
          Чи виживе рахунок
        </span>
        {sim?.ok && (
          <span className="ml-auto text-[11px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
            {sim.runs} прогонів · {sim.trades} угод
          </span>
        )}
      </div>

      <div className="p-4">
        {/* ---------- правила ---------- */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {FIELDS.map((f) => (
            <Num
              key={f.id}
              label={f.label}
              hint={f.hint}
              ph={f.ph}
              value={form[f.id]}
              onChange={(v2) => setForm((s) => ({ ...s, [f.id]: v2 }))}
            />
          ))}
          <Num label="Ризик на угоду" hint="скільки ставиш, %" ph="1" value={risk} onChange={setRisk} />
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-3 flex h-9 items-center gap-2 rounded-xl px-3.5 text-[12.5px] font-bold transition-colors"
          style={{
            fontFamily: T.sans,
            background: saved ? `rgba(${T.okRgb},0.12)` : T.sunken,
            border: `1px solid ${saved ? `rgba(${T.okRgb},0.35)` : T.line}`,
            color: saved ? T.ok : T.text3,
          }}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} strokeWidth={3} /> : null}
          {saved ? 'Збережено' : 'Запамʼятати правила'}
        </button>

        {/* ---------- результат ---------- */}
        {!hasRules && (
          <p className="mt-4 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
            Впиши межі свого пропа — і побачиш, які шанси дійти до цілі раніше, ніж до них.
            Без цих чисел рахувати нема від чого.
          </p>
        )}

        {hasRules && loading && (
          <div className="mt-4 flex items-center gap-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
            <Loader2 size={13} className="animate-spin" /> рахую…
          </div>
        )}

        {/* Замало угод — кажемо прямо, а не малюємо відсоток із трьох
            чисел. Ймовірність, виведена з десяти угод, точна рівно до
            одного трейду. */}
        {sim && !sim.ok && (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{ background: `rgba(${T.warnRgb},0.07)`, border: `1px solid rgba(${T.warnRgb},0.24)` }}
          >
            <Info size={14} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.warn }} />
            <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
              На цьому рахунку {sim.have} {sim.have === 1 ? 'угода' : 'угод'}, а треба щонайменше {sim.need}.
              На меншій вибірці розподіл R — це не розподіл, і будь-яка ймовірність з нього буде вигадкою.
            </span>
          </div>
        )}

        {sim?.ok && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="mt-4"
          >
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              <Odds
                label="Дійду до цілі"
                value={sim.target}
                tone={sim.target >= 50 ? T.ok : T.text}
                hint={sim.toTarget ? `зазвичай за ${sim.toTarget} угод` : null}
              />
              <Odds
                label="Зіллю"
                value={sim.bust}
                tone={sim.bust >= 25 ? T.bad : T.text}
                hint={`денний ${sim.daily}% · просадка ${sim.drawdown}%`}
              />
              <Odds
                label="Ще в роботі"
                value={sim.open}
                tone={T.text3}
                hint={`горизонт ${sim.horizon} угод`}
              />
            </div>

            {/* Найважливіше в усьому блоці. Більшість зривів стається
                не тоді, коли система зламалась, а тоді, коли звичайну
                серію мінусів приймають за поломку. */}
            <div
              className="mt-2.5 rounded-xl px-3.5 py-3"
              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            >
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Що для тебе нормально
              </div>
              <p className="text-[13px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.6 }}>
                Типова серія мінусів — <b style={{ fontFamily: T.mono, color: T.text }}>{sim.streakTypical}</b> поспіль,
                у важкому випадку <b style={{ fontFamily: T.mono, color: T.text }}>{sim.streakBad}</b>.
                Просадка зазвичай доходить до <b style={{ fontFamily: T.mono, color: T.text }}>{sim.ddTypical}%</b>,
                у важкому — до <b style={{ fontFamily: T.mono, color: T.text }}>{sim.ddBad}%</b>. Це не поломка системи, це її звичайна робота.
              </p>
            </div>

            {v && (
              <div
                className="mt-2.5 rounded-xl px-3.5 py-3 text-[12.5px]"
                style={{
                  fontFamily: T.sans,
                  lineHeight: 1.6,
                  color: T.text2,
                  background: v.tone === 'bad' ? `rgba(${T.badRgb},0.07)` : v.tone === 'warn' ? `rgba(${T.warnRgb},0.07)` : `rgba(${T.okRgb},0.06)`,
                  border: `1px solid ${v.tone === 'bad' ? `rgba(${T.badRgb},0.24)` : v.tone === 'warn' ? `rgba(${T.warnRgb},0.24)` : `rgba(${T.okRgb},0.2)`}`,
                }}
              >
                {v.text}
              </div>
            )}

            <p className="mt-3 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.55 }}>
              Симуляція перемішує твої ж угоди ({perDay} на день у середньому) і припускає, що далі
              торгуєш так само. Це припущення, а не передбачення: зміниш підхід — зміняться й цифри.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
