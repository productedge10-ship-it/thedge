import { motion } from 'framer-motion';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { getCat } from './utils';

/* ==================================================================
   Стрічка помилок, згрупована по місяцях.

   Картка мусить відповідати на «що це було» ще до відкриття, тому
   на ній стоїть усе, що дає зрозуміти запис із першого погляду:
   пара, дата, стан розбору, сам опис і категорії.

   Оформлення картки — акцентне, а не по категорії. Спроба фарбувати
   всю картку в колір першої категорії давала стіну червоного: у
   журналі помилок майже все або ризик, або FOMO, і сторінка
   починала кричати рівно там, де від неї потрібен спокій. Колір
   категорії лишився там, де він щось означає — на самих теґах.

   Висота фіксована, а опис обрізаний трьома рядками: сітка з
   карток різної висоти читається гірше за будь-який недочитаний
   текст, а повний опис усе одно за один клік.
================================================================== */


/* Ховер картки — чистим CSS, а не станом React.

   На стані він перемальовував усю картку на кожен рух курсора між
   сусідніми елементами, і саме через це «стрибав». CSS робить це
   на композиторі, без жодного рендера.

   Головний сигнал ховера — рамка: підйом і тінь помітні лише
   боковим зором, а рамка каже «саме ця картка» однозначно. */
const CARD_CSS = `
.err-card{
  --ac: var(--edge-acc-rgb, 139,123,255);
  background-color:var(--edge-sunken);
  background-image:linear-gradient(168deg, rgba(var(--ac),.03), var(--edge-sunken) 42%, var(--edge-sunken));
  border:1px solid var(--edge-line);
  box-shadow:0 12px 28px -22px var(--edge-panel-glow, rgba(0,0,0,0.85)), inset 0 1px 0 rgba(var(--edge-hair-rgb),0.04);
  transition:transform .28s cubic-bezier(.22,1.2,.36,1), border-color .18s,
             background-image .2s, box-shadow .26s;
}
.err-card:hover{
  background-image:linear-gradient(168deg, rgba(var(--ac),.09), var(--edge-sunken) 42%, var(--edge-sunken));
  border-color:rgba(var(--ac),.8);
  box-shadow:0 28px 54px -26px rgba(var(--ac),.6),
             inset 0 1px 0 rgba(var(--ac),.17),
             0 0 0 1px rgba(var(--ac),.28);
  transform:translateY(-4px);
}
.err-card .err-glow{opacity:.07;transition:opacity .26s}
.err-card:hover .err-glow{opacity:.18}
.err-card .err-text{color:var(--edge-text2);transition:color .18s}
.err-card:hover .err-text{color:var(--edge-text)}
.err-card .err-foot{border-top:1px solid var(--edge-line);transition:border-color .2s}
.err-card:hover .err-foot{border-top-color:rgba(var(--ac),.28)}
.err-card .err-arrow{
  background:rgba(var(--edge-hair-rgb),0.03);border:1px solid var(--edge-line);color:var(--edge-text3);
  transition:background .2s, border-color .2s, color .2s, transform .2s;
}
.err-card:hover .err-arrow{
  background:rgba(var(--ac),.16);border-color:rgba(var(--ac),.55);
  color:#ffffff;transform:translateX(2px);
}
`;

function Card({ entry, onOpen }) {
  const cats = entry.cats || [];
  const color = T.acc;

  const d = new Date(`${entry.date || ''}T00:00:00`);
  const bad = Number.isNaN(d.getTime());

  /* «Поза планом» — не така сама позначка, як категорія: категорія
     описує помилку, а це порушення власного правила, і воно важить
     більше за будь-який ярлик. Тому окремим кольором і зі знаком. */
  const offPlan = entry.followedPlan === false;

  return (
    <div
      onClick={() => onOpen(entry)}
      className="err-card relative flex min-h-[250px] cursor-pointer flex-col overflow-hidden rounded-[20px] px-5 pb-4 pt-[18px]"
    >
      <span
        className="err-glow pointer-events-none absolute rounded-full"
        style={{ right: -70, top: -80, width: 260, height: 200, background: color, filter: 'blur(62px)' }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          {entry.pair && (
            <div
              className="inline-flex h-[26px] items-center rounded-[7px] px-2.5"
              style={{
                background: 'rgba(var(--edge-hair-rgb),0.05)',
                border: '1px solid var(--edge-line-hi)',
                fontFamily: T.mono,
                fontSize: 12,
                letterSpacing: '1.1px',
                fontWeight: 700,
                color: 'var(--edge-text)',
              }}
            >
              {entry.pair}
            </div>
          )}

          {/* Дата дрібним моноширинним: місяць і рік уже стоять
              заголовком групи, тож на картці вона потрібна лише щоб
              відрізнити сусідні записи один від одного. */}
          <div
            className="mt-2.5 tabular-nums"
            style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: '0.6px', color: 'var(--edge-text3)' }}
          >
            {bad
              ? '—'
              : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`}
          </div>
        </div>

        <span
          className="flex flex-none items-center gap-2 rounded-full px-3 py-[6px] text-[12px] font-bold"
          style={{
            fontFamily: T.sans,
            background: entry.resolved ? 'rgba(var(--edge-ok-rgb),0.12)' : `rgba(${T.accRgb},0.16)`,
            border: `1px solid ${entry.resolved ? 'rgba(var(--edge-ok-rgb),0.30)' : `rgba(${T.accRgb},0.5)`}`,
            color: entry.resolved ? 'var(--edge-ok)' : 'var(--edge-acc)',
          }}
        >
          <span
            className="h-[5px] w-[5px] rounded-full"
            style={{
              background: entry.resolved ? 'var(--edge-ok)' : 'var(--edge-acc)',
              boxShadow: `0 0 8px 1px ${entry.resolved ? 'rgba(var(--edge-ok-rgb),0.80)' : `rgba(${T.accRgb},0.8)`}`,
            }}
          />
          <span className="whitespace-nowrap">{entry.resolved ? 'Розібрано' : 'Не розібрано'}</span>
        </span>
      </div>

      <p
        className="err-text relative mt-4 overflow-hidden text-[14.5px]"
        style={{ fontFamily: T.sans, lineHeight: 1.6, height: 70 }}
      >
        {entry.desc}
      </p>

      <div className="err-foot relative mt-auto flex items-center justify-between gap-2.5 pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {cats.slice(0, 2).map((id) => {
            const c = getCat(id);
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold"
                style={{
                  fontFamily: T.sans,
                  background: `${c.color}1c`,
                  border: `1px solid ${c.color}3d`,
                  letterSpacing: '.2px',
                  color: `${c.color}ee`,
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="h-[5px] w-[5px] rounded-full" style={{ background: c.color }} />
                {c.label}
              </span>
            );
          })}

          {cats.length > 2 && (
            <span className="text-[11.5px] font-semibold" style={{ fontFamily: T.mono, color: 'var(--edge-text3)' }}>
              +{cats.length - 2}
            </span>
          )}

          {offPlan && (
            <span
              title="Поза планом"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-[5px]"
              style={{ background: 'rgba(var(--edge-warn-rgb),0.11)', border: '1px solid rgba(var(--edge-warn-rgb),0.27)' }}
            >
              <AlertTriangle size={11} strokeWidth={2.2} style={{ color: 'var(--edge-warn)' }} />
              <span className="whitespace-nowrap text-[11.5px] font-bold" style={{ fontFamily: T.sans, color: 'var(--edge-warn)' }}>
                Поза планом
              </span>
            </span>
          )}
        </div>

        <span className="err-arrow grid h-[34px] w-[34px] flex-none place-items-center rounded-full">
          <ArrowRight size={16} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

export default function ErrorGrid({ groups, onOpenCard }) {
  if (!groups?.length) return null;

  return (
    <div className="flex flex-col gap-[30px]">
      <style>{CARD_CSS}</style>
      {groups.map((g, gi) => (
        <motion.section
          key={g.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: EASE, delay: Math.min(gi * 0.05, 0.2) }}
        >
          <div className="flex items-center gap-3.5">
            <h2
              className="whitespace-nowrap"
              style={{ fontFamily: T.display, fontSize: 19, fontWeight: 600, color: 'var(--edge-text)', letterSpacing: '-0.4px' }}
            >
              {g.label}
            </h2>
            <span
              className="whitespace-nowrap text-[12px] uppercase"
              style={{ fontFamily: T.mono, letterSpacing: '1.4px', color: 'var(--edge-text3)' }}
            >
              {g.items.length} {g.items.length === 1 ? 'запис' : g.items.length % 10 >= 2 && g.items.length % 10 <= 4 && (g.items.length % 100 < 10 || g.items.length % 100 >= 20) ? 'записи' : 'записів'}
            </span>
            <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,var(--edge-line),transparent)' }} />
          </div>

          <div
            className="mt-3.5 grid items-stretch gap-3.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}
          >
            {g.items.map((e) => (
              <Card key={e.id} entry={e} onOpen={onOpenCard} />
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  );
}
