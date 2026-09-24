import { useState } from 'react';
import { ArrowRight, Ban, Check, ChevronDown, Gift, TriangleAlert } from 'lucide-react';
import { C, F, A, reducedMotion, SHELL, SoonTag, PriceRoll } from './base';
import { useUahRate, toUah, fmtUah, TRIAL_DAYS } from '../../../lib/billing';

/* ==================================================================
   Хвіст сторінки: ритм дня, чого ми не робимо, ціни, питання, футер.

   Усі чотири блоки разом коротші за один старий «Продукт», бо жоден
   із них не викладений стовпчиком однакових карток.
================================================================== */

const RHYTHM = [
  {
    time: '09:40 · ПЕРЕД СЕСІЄЮ', label: 'План: рівні, напрямок, чого чекаю', dur: '2 хвилини',
    title: 'КАРТКА ПЛАНУ',
    rows: [['Напрямок', 'LONG', C.ok], ['Рівень', '2 412.80', C.text2], ['Стан', '5 / 5', C.acc]],
  },
  {
    time: '15:30 · УГОДА', label: 'Вхід із причиною і скріном', dur: '20 секунд',
    title: 'РЯДОК ЖУРНАЛУ',
    rows: [['XAUUSD · свінг + FVG', '+2.4R', C.ok], ['Стан', 'Спокій', C.text2], ['Скрін', 'є', C.acc]],
  },
  {
    time: '22:00 · ВЕЧІР', label: 'Розбір: що спрацювало, що ні, одне правило', dur: '5 хвилин',
    title: 'РОЗБІР ДНЯ',
    rows: [['Дисципліна', '86%', C.ok], ['Порушень', '1', C.warn], ['Правило', 'додано', C.acc]],
  },
];

export function Rhythm() {
  return (
    <section style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>РИТМ</span>
      </div>

      <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(26px,2.3vw,44px)', letterSpacing: '-1.6px', lineHeight: 1.1, margin: '0 0 12px', color: '#fff' }}>
        Три дотики за день
      </h2>
      <p style={{ fontFamily: F.sans, fontSize: 16.5, lineHeight: 1.5, color: '#8a8a9c', margin: '0 0 30px', maxWidth: 680 }}>
        Журнал не забирає час. Він забирає рішення, які ти й так приймаєш — і залишає їх на папері
      </p>

      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', top: 7, left: '10%', right: '10%', height: 1, background: 'rgba(255,255,255,.07)' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(250px,100%),1fr))', gap: 24, position: 'relative' }}>
          {RHYTHM.map((r) => (
            <div key={r.time} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: C.panel2, border: `2px solid ${C.acc}`, boxShadow: `0 0 16px ${A(0.6)}`, display: 'block', marginBottom: 18 }} />
              <div style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '1.2px', color: C.accSoft, marginBottom: 8 }}>{r.time}</div>
              <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 14 }}>{r.label}</div>

              <div style={{ width: '100%', background: 'linear-gradient(160deg,#0e0e14,#0b0b10)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 15, textAlign: 'left' }}>
                <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.1px', color: C.dim, marginBottom: 11 }}>{r.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.rows.map(([k, v, c]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.text3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                      <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, flexShrink: 0, color: c }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontFamily: F.sans, fontSize: 12, color: C.text5, marginTop: 11 }}>{r.dur}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, color: C.accSoft, marginTop: 26 }}>
        Разом — менше десяти хвилин на день
      </div>
    </section>
  );
}

/* ---------- чого ми не робимо ---------- */

const NOT_DOING = ['Не даємо сигналів', 'Не керуємо твоїми грошима', 'Не обіцяємо прибуток', 'Не продаємо твої дані'];

export function NotDoing() {
  return (
    <section style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ position: 'relative', background: 'linear-gradient(150deg,rgba(245,163,59,.11),rgba(245,163,59,.03) 55%,transparent)', border: '1px solid rgba(245,163,59,.3)', borderRadius: 24, padding: 'clamp(18px,4.5vw,30px)', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#f5a33b,rgba(245,163,59,.2),transparent)' }} />
        <span aria-hidden style={{ position: 'absolute', top: -90, right: -40, width: 320, height: 320, background: 'radial-gradient(circle,rgba(245,163,59,.16),transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 300px', minWidth: 'min(260px,100%)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'rgba(245,163,59,.14)', border: '1px solid rgba(245,163,59,.4)', borderRadius: 999, padding: '7px 14px', marginBottom: 18 }}>
              <TriangleAlert size={14} strokeWidth={2.2} color={C.warn} />
              <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.4px', color: C.warn }}>ЧИТАЙ ПЕРЕД РЕЄСТРАЦІЄЮ</span>
            </div>

            <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(26px,2.3vw,44px)', letterSpacing: '-1.6px', lineHeight: 1.1, margin: '0 0 12px', color: '#fff' }}>
              Чого ми не робимо
            </h2>
            <p style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: '#c4a882', margin: 0, maxWidth: 380 }}>
              Журнал не заробляє замість тебе. Він показує, де ти вже заробляєш, а де ні
            </p>
          </div>

          <div style={{ flex: '1 1 420px', minWidth: 'min(280px,100%)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(190px,100%),1fr))', gap: 11 }}>
            {NOT_DOING.map((t) => (
              <div
                key={t}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,163,59,.07)', border: '1px solid rgba(245,163,59,.26)', borderRadius: 14, padding: '15px 16px', transition: 'border-color .2s ease,background .2s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(245,163,59,.55)'; e.currentTarget.style.background = 'rgba(245,163,59,.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(245,163,59,.26)'; e.currentTarget.style.background = 'rgba(245,163,59,.07)'; }}
              >
                <Ban size={18} strokeWidth={2.1} color={C.warn} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.35 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- ціни ---------- */

const FREE = ['План на день', 'Журнал без обмежень', 'Діагностика перед сесією', 'Задачі й чекліст', 'Документи торгової системи'];
/* `soon` — це не позначка «колись». Поки функції немає, вона не має
   виглядати частиною того, за що людина платить сьогодні: інакше
   перший же тиждень підписки закінчується питанням «а де AI». */
const PRO = [
  'Повна аналітика',
  'Бектести',
  'Автоімпорт MT5',
  'Пропрахунки з виплатами',
  'Картки статистики',
  { text: 'AI-коуч на твоїх угодах', soon: true },
];
const COMPARE = [
  ['Всі угоди в одному місці', true],
  ['Рахує R і профіт-фактор', false],
  ['Бачить, який сетап платить', false],
  ['Ловить повтори помилок', false],
  ['Пише правило з твого висновку', false],
  ['Імпорт із MT5', false],
];

const COMPARE_GRID = 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)';

export function Pricing() {
  const [yearly, setYearly] = useState(false);
  const rate = useUahRate();
  const uahMonth = toUah(yearly ? 12 : 15, rate);
  const uahYear = toUah(144, rate);
  const reduced = reducedMotion();

  /* Кнопка більше не має власного фону. Підсвітка — одна плашка, що
     їздить під ними: коли фон просто гасне в одній кнопці й
     зʼявляється в іншій, перемикач читається як дві лампочки, а не як
     один перемикач із двома положеннями.

     Обидві кнопки однакової ширини — інакше плашка мусила б міряти
     текст, а «Місяць» і «Рік» різної довжини. */
  const tab = (on) => ({
    position: 'relative', zIndex: 1, border: 0, background: 'transparent',
    borderRadius: 999, padding: '9px 0', width: 92, textAlign: 'center',
    fontFamily: F.sans, fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer', transition: 'color .22s ease', whiteSpace: 'nowrap',
    color: on ? '#fff' : '#8a8a9c',
  });

  const feat = (list, color, textColor) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 26 }}>
      {list.map((f) => {
        const soon = typeof f === 'object' && f.soon;
        const label = typeof f === 'object' ? f.text : f;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <Check size={14} strokeWidth={2.6} color={soon ? C.text4 : color} style={{ flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.45, color: soon ? '#7d7d90' : textColor }}>
              {label}
              {soon && <SoonTag />}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <section id="pricing" style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', marginBottom: 30 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>ЦІНИ</span>
          </div>
          <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.08, margin: '0 0 10px', color: '#fff' }}>
            Дешевше за одну погану угоду
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16.5, color: '#8a8a9c', margin: 0 }}>Почни безкоштовно і залиш журнал назавжди</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 999, padding: 4 }}>
            <span
              aria-hidden
              style={{
                position: 'absolute', top: 4, bottom: 4, left: 4, width: 92,
                borderRadius: 999, background: A(0.18), border: `1px solid ${A(0.32)}`,
                transform: `translateX(${yearly ? 92 : 0}px)`,
                transition: reduced ? 'none' : 'transform .38s cubic-bezier(.34,1.3,.5,1)',
              }}
            />
            <button type="button" onClick={() => setYearly(false)} style={tab(!yearly)}>Місяць</button>
            <button type="button" onClick={() => setYearly(true)} style={tab(yearly)}>Рік</button>
          </div>

        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 22 }}>
        <div style={{ background: 'linear-gradient(160deg,#0e0e14,#0b0b10)', border: `1px solid ${C.line}`, borderRadius: 22, padding: 'clamp(20px,5vw,30px) clamp(18px,4.5vw,28px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2px', color: C.text4, marginBottom: 16 }}>FREE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 46, letterSpacing: '-2.2px', color: '#fff' }}>$0</span>
            <span style={{ fontFamily: F.sans, fontSize: 15, color: '#7d7d90' }}>назавжди</span>
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 14.5, color: '#8a8a9c', marginBottom: 22 }}>Усе, щоб виробити звичку</div>
          {feat(FREE, C.text4, '#b8b8c8')}
          <a
            href="/auth"
            style={{ marginTop: 'auto', width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,.13)', color: C.text, fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, padding: 14, borderRadius: 13, cursor: 'pointer', textAlign: 'center', transition: 'all .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.45); e.currentTarget.style.background = A(0.07); }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.13)'; e.currentTarget.style.background = 'transparent'; }}
          >
            Почати безкоштовно
          </a>
        </div>

        <div style={{ position: 'relative', background: 'linear-gradient(160deg,#12121c,#0c0c14)', border: `1px solid ${A(0.42)}`, borderRadius: 22, padding: 'clamp(20px,5vw,30px) clamp(18px,4.5vw,28px)', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 74px rgba(74,59,245,.2)', transform: 'translateY(-6px)' }}>
          <span style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 1, background: `linear-gradient(90deg,transparent,${C.acc},transparent)` }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 16 }}>
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2px', color: C.accSoft }}>PRO</span>
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.2px', color: '#fff', background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, borderRadius: 999, padding: '7px 14px', whiteSpace: 'nowrap' }}>
              НАЙКОРИСНІШЕ
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
            <PriceRoll
              value={yearly ? '$12' : '$15'}
              size={46}
              style={{ fontFamily: F.display, fontWeight: 700, fontSize: 46, letterSpacing: '-2.2px', color: '#fff' }}
            />
            <span style={{ fontFamily: F.sans, fontSize: 15, color: '#7d7d90' }}>
              / місяць
              {/* Гривня за курсом НБУ на сьогодні — довідково, поруч із доларом. */}
              {uahMonth ? <span style={{ color: '#5d5d70' }}> · ≈ {fmtUah(uahMonth)}</span> : null}
            </span>
          </div>

          <div style={{ fontFamily: F.sans, fontSize: 14.5, color: '#8a8a9c', marginBottom: 22, minHeight: 21 }}>
            {/* `key` змушує React перемонтувати рядок, і анімація
                програється заново. Без нього текст міняється миттєво
                посеред того, як ціна ще котиться — і два різні темпи в
                одному русі виглядають як збій.

                `minHeight` тримає висоту: рядки різної довжини на
                вузькій картці переносяться по-різному, і без нього
                кнопка внизу підстрибувала б на кожен клік. */}
            <span
              key={yearly ? 'y' : 'm'}
              style={{
                display: 'inline-block',
                animation: reduced ? 'none' : 'lnSubIn .42s cubic-bezier(.4,0,.2,1) .16s both',
              }}
            >
              {yearly
                ? `$144 на рік${uahYear ? ` (≈ ${fmtUah(uahYear)})` : ''} — на $36 дешевше`
                : `${TRIAL_DAYS} днів безкоштовно · лише привʼязка картки`}
            </span>
          </div>

          {feat(PRO, C.acc, '#dcdce8')}

          {/* Намір несемо в адресі, а не в localStorage.

              Людина може зареєструватись у другій вкладці, з іншого
              пристрою або перейти за посиланням, надісланим собі в
              чат. Прапорець у сховищі цього не переживе, а ?next=
              переживе — і після входу ми знаємо, що вона прийшла не
              «подивитись», а по підписку. */}
          <a
            href="/auth?next=pro"
            style={{ marginTop: 'auto', width: '100%', background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, border: 0, color: '#fff', fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, padding: 14, borderRadius: 13, cursor: 'pointer', textAlign: 'center', boxShadow: '0 14px 36px rgba(74,59,245,.4)', transition: 'box-shadow .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 18px 46px rgba(74,59,245,.55)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 14px 36px rgba(74,59,245,.4)'; }}
          >
            Почати безкоштовно
          </a>

          {/* Обіцянка раннім підписникам. Стоїть під кнопкою, а не над
              ціною: спершу людина вирішує, чи вартий продукт грошей, і
              лише потім дізнається, що отримає ще й бонус. Навпаки це
              читалось би як спроба доплатити за недоробленість. */}
          <div style={{ marginTop: 14, display: 'flex', gap: 9, alignItems: 'flex-start', borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 14 }}>
            <Gift size={15} strokeWidth={2.2} color={C.accSoft} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.5, color: '#9a9ab0' }}>
              Оформив підписку до виходу AI-коуча — отримаєш <b style={{ color: '#fff' }}>два тижні нейромережі в подарунок</b> у день запуску
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 26, border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COMPARE_GRID, gap: 12, padding: '15px 22px', background: '#0d0d13', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.text4 }}>ЩО ВМІЄ</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.text4, textAlign: 'center' }}>ЗВИЧАЙНИЙ ЖУРНАЛ</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.accSoft, textAlign: 'center' }}>EDGE JOURNAL</span>
        </div>

        {COMPARE.map(([k, basic]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: COMPARE_GRID, gap: 12, alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,.035)', background: C.sunken }}>
            <span style={{ fontFamily: F.sans, fontSize: 14, color: '#b8b8c8' }}>{k}</span>
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              {basic
                ? <Check size={15} strokeWidth={2.6} color={C.text4} />
                : <span style={{ width: 12, height: 2, borderRadius: 1, background: '#3a3a48', display: 'block' }} />}
            </span>
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              <Check size={15} strokeWidth={2.6} color={C.acc} />
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: F.sans, fontSize: 13.5, color: C.text5, marginTop: 18 }}>
        Скасувати можна будь-коли. Дані твої — експорт у CSV в один клік
      </div>
    </section>
  );
}

/* ---------- фінал + питання ---------- */

const FAQ = [
  { chip: 'БЕЗПЕКА', q: 'Логін інвестора — це безпечно?', a: 'Так. Логін інвестора дає лише читання: подивитись історію й баланс. Торгувати, виводити кошти чи змінювати налаштування з ним неможливо технічно, на рівні самого MetaTrader' },
  { chip: 'ЧАС', q: 'Скільки часу це забирає щодня?', a: 'Двадцять секунд на угоду, дві хвилини на план і п’ять на вечірній розбір. Цифри й результат приїжджають з MT5 самі — руками ти дописуєш тільки причину входу й стан' },
  { chip: 'КОУЧ', q: 'Чим коуч відрізняється від ChatGPT?', a: 'Він не радить абстрактно, а працює з твоєю вибіркою: дисципліна, час входів, серії після стопу, ціна кожної звички в R. Порада завжди привʼязана до конкретних угод, які можна відкрити й перевірити' },
  { chip: 'ПРОП', q: 'А якщо я торгую на пропфірмі?', a: 'Проп-рахунки ведуться окремо: ліміт денної просадки, загальна просадка, прогрес до виплати й історія самих виплат. Один журнал тримає особисті й проп-рахунки одночасно' },
  { chip: 'ДАНІ', q: 'Мої угоди йдуть на навчання моделей?', a: 'Ні. Дані замкнені на твій акаунт на рівні бази й не використовуються для тренування. Публічним стає лише те, на що ти сам створиш посилання' },
  { chip: 'ОПЛАТА', q: 'Що буде, якщо я перестану платити?', a: 'Журнал і вся історія лишаються на безкоштовному плані — вимикаються тільки можливості Pro. Експорт у CSV доступний завжди, в один клік' },
];

export function FinalFaq() {
  const [open, setOpen] = useState(0);
  const reduced = reducedMotion();

  return (
    <section id="faq" style={{ ...SHELL, paddingTop: '0', paddingBottom: '76px' }}>
      <div style={{ display: 'flex', gap: 52, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 380px', minWidth: 'min(280px,100%)', position: 'relative' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute', top: -40, left: -70, width: 340, height: 340,
              background: 'radial-gradient(circle,rgba(74,59,245,.16),transparent 70%)', filter: 'blur(70px)',
              pointerEvents: 'none', animation: reduced ? 'none' : 'lnBreathe 7s ease-in-out infinite',
            }}
          />

          <div style={{ position: 'relative' }}>
            <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.07, margin: '0 0 16px', color: '#fff', textWrap: 'balance' }}>
              Стратегія в тебе вже є. Бракує доказів, що вона працює
            </h2>
            <p style={{ fontFamily: F.sans, fontSize: 16.5, lineHeight: 1.55, color: '#8a8a9c', margin: '0 0 28px', maxWidth: 420 }}>
              Тридцять днів чесних записів — і ти побачиш, які рішення тебе годують, а які коштують
            </p>

            <a
              href="/auth"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, border: 0, color: '#fff', fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, padding: '17px 30px', borderRadius: 14, cursor: 'pointer', boxShadow: '0 18px 50px rgba(74,59,245,.42)', whiteSpace: 'nowrap', transition: 'all .2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 22px 60px rgba(74,59,245,.58)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 18px 50px rgba(74,59,245,.42)'; e.currentTarget.style.transform = 'none'; }}
            >
              Почати безкоштовно
              <ArrowRight size={16} strokeWidth={2.4} />
            </a>

            <div style={{ fontFamily: F.sans, fontSize: 13, color: C.text5, marginTop: 16 }}>
              Три хвилини на підключення. Картка не потрібна
            </div>
          </div>
        </div>

        <div style={{ flex: '1 1 470px', minWidth: 'min(300px,100%)', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {FAQ.map((f, i) => {
            const on = open === i;
            return (
              <div key={f.q} style={{ position: 'relative', background: 'linear-gradient(160deg,#0e0e14,#0b0b10)', border: `1px solid ${on ? A(0.28) : 'rgba(255,255,255,.07)'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color .2s ease' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: `linear-gradient(180deg,${C.acc},${C.accDeep})`, transition: 'opacity .25s ease', opacity: on ? 1 : 0 }} />

                <button
                  type="button"
                  onClick={() => setOpen(on ? -1 : i)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: 0, padding: '18px 20px', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontFamily: F.mono, fontSize: 11.5, fontWeight: 700, flexShrink: 0, color: on ? C.accSoft : C.dim }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ flex: 1, fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff' }}>{f.q}</span>
                  <span style={{ flexShrink: 0, display: 'flex', transition: 'transform .25s ease', transform: on ? 'rotate(180deg)' : 'none' }}>
                    <ChevronDown size={16} strokeWidth={2.2} color={C.acc} />
                  </span>
                </button>

                {on && (
                  <div style={{ padding: '0 20px 20px 45px', animation: reduced ? 'none' : 'lnFadeUp .25s ease-out' }}>
                    <div style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.65, color: '#8a8a9c' }}>{f.a}</div>
                    <div style={{ display: 'inline-flex', marginTop: 12, fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: C.accSoft, background: A(0.1), border: `1px solid ${A(0.24)}`, borderRadius: 999, padding: '5px 11px' }}>
                      {f.chip}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
