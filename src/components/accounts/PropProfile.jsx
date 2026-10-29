import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Pencil, UserCog, Newspaper, Moon, CalendarClock, Scale, Gauge, Cpu, CalendarDays } from 'lucide-react';
import { T } from '../../lib/theme';
import { optionsFor, policyFor, profileLabel, isInstant } from '../../lib/propPolicy';

/* ==================================================================
   «Мій тип рахунку»: програма, етап, варіант — і що на ньому можна.

   Від цього залежить усе: попередження про новини, перевірка вихідних,
   консистентність. Якщо профіль не вгадали з назви рахунку — питаємо
   одним рядком і запамʼятовуємо (user_state).
================================================================== */

function Seg({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl p-1" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
      {options.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)} className="h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors"
          style={{ fontFamily: T.sans, color: value === id ? T.text : T.text3, background: value === id ? 'var(--edge-surface)' : 'transparent', boxShadow: value === id ? '0 2px 8px rgba(0,0,0,0.25)' : 'none' }}>{label}</button>
      ))}
    </div>
  );
}

function Editor({ firmId, programs, value, onSave, onCancel }) {
  const [p, setP] = useState(() => value?.program ? value : { program: programs[0]?.program, stage: 'eval', variant: 'standard', swingAddon: false });
  const o = optionsFor(firmId, p.program);
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="text-[12px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>Програма</span>
        <div className="flex flex-wrap gap-1.5">
          {programs.map((x) => {
            const on = x.program === p.program;
            return (
              <button key={x.program} type="button" onClick={() => setP({ ...p, program: x.program, stage: isInstant(x.program) ? 'funded' : p.stage })}
                className="h-9 rounded-xl px-3 text-[13px] font-semibold transition-colors"
                style={{ fontFamily: T.sans, color: on ? T.text : T.text2, background: on ? `rgba(${T.accRgb},0.14)` : 'var(--edge-sunken)', border: `1px solid ${on ? `rgba(${T.accRgb},0.45)` : 'var(--edge-line)'}` }}>{x.program}</button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {o.stage && (
          <label className="grid gap-1.5"><span className="text-[12px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>Етап</span>
            <Seg value={p.stage} onChange={(stage) => setP({ ...p, stage })} options={[['eval', 'Оцінка (челендж)'], ['funded', 'Funded']]} /></label>
        )}
        {o.variant && (
          <label className="grid gap-1.5"><span className="text-[12px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>Тип рахунку</span>
            <Seg value={p.variant} onChange={(variant) => setP({ ...p, variant })} options={[['standard', 'Standard'], ['swing', 'Swing']]} /></label>
        )}
        {o.swingAddon && (
          <label className="grid gap-1.5"><span className="text-[12px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>Swing add-on</span>
            <Seg value={p.swingAddon ? 'y' : 'n'} onChange={(v) => setP({ ...p, swingAddon: v === 'y' })} options={[['n', 'Нема'], ['y', 'Є']]} /></label>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(p)} className="h-9 rounded-xl px-4 text-[13px] font-bold" style={{ background: T.acc, color: '#0b0b0f', fontFamily: T.sans }}>Зберегти</button>
        {onCancel && <button type="button" onClick={onCancel} className="h-9 rounded-xl px-3 text-[13px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>Скасувати</button>}
      </div>
    </div>
  );
}

/* Рядок «можна / не можна». */
function Rule({ icon: Icon, label, ok, value, note }) {
  const tone = ok === true ? T.ok : ok === false ? T.bad : T.text2;
  const rgb = ok === true ? T.okRgb : ok === false ? T.badRgb : T.accRgb;
  return (
    <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }} title={note || ''}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `rgba(${rgb},0.12)` }}><Icon size={15} style={{ color: tone }} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>
          {label}
          <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: tone }}>
            {ok === true && <Check size={13} />}{ok === false && <X size={13} />}{value}
          </span>
        </div>
        {note && <div className="mt-0.5 text-[12px] leading-[1.45]" style={{ color: T.text3, fontFamily: T.sans }}>{note}</div>}
      </div>
    </div>
  );
}

export function PolicyGrid({ policy }) {
  if (!policy) return null;
  const n = policy.news;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <Rule icon={Newspaper} label="Торгівля на новинах" ok={!n.restricted} value={n.restricted ? `−${n.window.before}/+${n.window.after} хв` : 'можна'} note={n.note} />
      <Rule icon={CalendarClock} label="Через вихідні" ok={policy.weekend.allowed} value={policy.weekend.allowed ? 'можна' : 'не можна'} note={policy.weekend.note} />
      <Rule icon={Moon} label="Через ніч" ok={policy.overnight.allowed} value={policy.overnight.allowed ? 'можна' : 'не можна'} note={policy.overnight.note} />
      <Rule icon={Scale} label="Консистентність" ok={policy.consistency ? null : true} value={policy.consistency ? `≤ ${policy.consistency.pct}%` : 'нема'} note={policy.consistency?.note || 'Правила найкращого дня на цьому рахунку нема.'} />
      {policy.maxRisk && <Rule icon={Gauge} label="Ризик на угоду" ok={null} value={`≤ ${policy.maxRisk.pct}%`} note={policy.maxRisk.note} />}
      {policy.autoClose?.pct && <Rule icon={Gauge} label="Автозакриття збитку" ok={null} value={`${policy.autoClose.pct}%`} note={policy.autoClose.note} />}
      {policy.minDays && <Rule icon={CalendarDays} label="Мін. торгових днів" ok={null} value={policy.minDays} note="На етапі оцінки." />}
      {policy.ea && <Rule icon={Cpu} label="Радники (EA)" ok={null} value="умовно" note={policy.ea} />}
    </div>
  );
}

/* Картка профілю. profile — збережений (або вгаданий), sure — чи впевнені. */
export default function PropProfile({ firmId, firm, data, profile, sure, onSave, compact = false }) {
  const programs = data?.structured?.programs || [];
  const [edit, setEdit] = useState(!profile?.program);
  const policy = profile?.program ? policyFor(firmId, data, profile) : null;

  return (
    <section className="p-5 sm:p-6" style={{ background: 'var(--edge-surface)', border: `1px solid ${!sure && !edit ? `rgba(${T.warnRgb},0.4)` : 'var(--edge-line)'}`, borderRadius: 20 }}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `rgba(${T.accRgb},0.12)` }}><UserCog size={18} style={{ color: T.acc }} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[17px] font-bold" style={{ color: T.text, fontFamily: T.display }}>{edit ? `Який у тебе рахунок на ${firm}?` : 'Мій рахунок'}</h3>
          <p className="m-0 mt-0.5 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>
            {edit ? 'Від цього залежить, на чому попереджати: на Swing чи на оцінці новини часто дозволені.' : profileLabel(firmId, profile)}
            {!edit && !sure && <span style={{ color: T.warn }}> · вгадали з назви — перевір</span>}
          </p>
        </div>
        {!edit && <button type="button" onClick={() => setEdit(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold hover:bg-[var(--edge-nav-hover)]" style={{ color: T.text2, fontFamily: T.sans, border: '1px solid var(--edge-line)' }}><Pencil size={14} />Змінити</button>}
      </div>
      <motion.div key={edit ? 'e' : 'v'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
        {edit
          ? <Editor firmId={firmId} programs={programs} value={profile} onSave={(p) => { onSave(p); setEdit(false); }} onCancel={profile?.program ? () => setEdit(false) : null} />
          : !compact && <PolicyGrid policy={policy} />}
      </motion.div>
    </section>
  );
}
