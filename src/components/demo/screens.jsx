import { Check, Plus, Share2, Flame, ListChecks } from 'lucide-react';
import { C, F, A, Cat } from '../landing/v3/base';

/* ==================================================================
   Екрани пісочниці.

   Це не скріншоти й не справжні сторінки застосунку: справжні
   тягнуть дані з бази під конкретний акаунт, і показати їх
   незалогіненій людині неможливо, не ламаючи ізоляцію даних. Тому
   тут ті самі візуальні рішення на вигаданих цифрах — з поміткою
   про це в першій же підказці.
================================================================== */

const panel = { background: '#0d0d13', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16 };
const cap = { fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.3px', color: C.dim };
const h1 = { fontFamily: F.display, fontSize: 22, fontWeight: 700, letterSpacing: '-.6px', color: '#fff' };

const Head = ({ title, sub, right }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
    <div>
      <div style={h1}>{title}</div>
      {sub && <div style={{ fontFamily: F.sans, fontSize: 13.5, color: '#8a8a9c', marginTop: 6 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

const Btn = ({ children, icon: Icon, tour, onClick, primary }) => (
  <button
    type="button"
    data-tour={tour}
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 9, borderRadius: 12, cursor: 'pointer',
      fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, padding: '11px 18px', whiteSpace: 'nowrap',
      border: primary ? 0 : '1px solid rgba(255,255,255,.12)',
      background: primary ? `linear-gradient(135deg,${C.acc},${C.accDeep})` : 'rgba(255,255,255,.04)',
      color: primary ? '#fff' : C.text2,
      boxShadow: primary ? '0 12px 30px rgba(74,59,245,.32)' : 'none',
    }}
  >
    {Icon && <Icon size={15} strokeWidth={2.2} />}
    {children}
  </button>
);

/* ---------- план на день ---------- */

const TF = [
  { tf: '1W', dir: 'Тренд вгору', level: '2 386.40', color: C.ok },
  { tf: '1D', dir: 'Відкат до OB', level: '2 412.80', color: C.ok },
  { tf: '4H', dir: 'Чекаю свіп', level: '2 421.15', color: C.warn },
  { tf: '1m', dir: 'Вхід після FVG', level: '2 419.90', color: C.acc },
];

const CHECK = ['Виспався', 'Немає відкритих збитків', 'План написаний до відкриття', 'Ризик на угоду 1%', 'Немає новин у сесію'];

export function PlanScreen() {
  return (
    <div>
      <Head
        title="План на 8 вересня"
        sub="Пишеться до відкриття ринку — потім кожна угода знатиме, звідки вона вийшла."
        right={<Btn primary icon={Plus} tour="plan-new">Новий план</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 22 }}>
        {TF.map((t) => (
          <div key={t.tf} style={{ ...panel, padding: '16px 18px' }}>
            <div style={{ ...cap, marginBottom: 10 }}>{t.tf}</div>
            <div style={{ fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, color: t.color, marginBottom: 6 }}>{t.dir}</div>
            <div style={{ fontFamily: F.mono, fontSize: 12.5, color: C.text5 }}>{t.level}</div>
          </div>
        ))}
      </div>

      <div data-tour="plan-check" style={{ ...panel, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <span style={cap}>СТАН ПЕРЕД СЕСІЄЮ</span>
          <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: C.ok }}>5 / 5</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
          {CHECK.map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#0a0a0f', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '12px 14px' }}>
              <Check size={14} strokeWidth={3} color={C.ok} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: F.sans, fontSize: 13.5, color: '#b8b8c8' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- журнал ---------- */

export const TRADES = [
  { sym: 'XAUUSD', setup: 'Свінг + FVG', mood: 'Спокій', viol: '—', r: '+2.4R', time: '10:15' },
  { sym: 'GER40', setup: 'Judas swing', mood: 'Спокій', viol: '—', r: '+1.8R', time: '11:02' },
  { sym: 'EURUSD', setup: 'Без сетапу', mood: 'Нудьга', viol: 'Вхід без умов', r: '−1.0R', time: '13:40' },
  { sym: 'XAUUSD', setup: 'Сплеск на новині', mood: 'FOMO', viol: 'Подвоїв обсяг', r: '−1.0R', time: '15:31' },
  { sym: 'NAS100', setup: 'Ретест OB', mood: 'Фокус', viol: '—', r: '+1.6R', time: '16:20' },
];

const GRID = '84px 1fr 96px 1fr 70px';

export function JournalScreen({ onOpenTrade }) {
  return (
    <div>
      <Head
        title="Журнал угод"
        sub="Ліва половина приїжджає з MetaTrader 5. Права — та, заради якої все й ведеться."
        right={<Btn icon={Plus} tour="journal-new">Додати вручну</Btn>}
      />

      <div style={{ ...panel, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '14px 18px', ...cap, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <span>ІНСТРУМЕНТ</span><span>СЕТАП</span><span>СТАН</span><span>ЩО ПОРУШИВ</span>
          <span style={{ textAlign: 'right' }}>R</span>
        </div>

        {TRADES.map((t, i) => (
          <div
            key={t.sym + t.time}
            data-tour={i === 0 ? 'journal-row' : undefined}
            onClick={() => onOpenTrade(t)}
            style={{
              display: 'grid', gridTemplateColumns: GRID, gap: 14, alignItems: 'center',
              padding: '15px 18px', borderBottom: '1px solid rgba(255,255,255,.035)',
              cursor: 'pointer', transition: 'background .16s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.03)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 600, color: C.text }}>{t.sym}</span>
            <span style={{ fontFamily: F.sans, fontSize: 13.5, color: '#b8b8c8' }}>{t.setup}</span>
            <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: t.mood === 'FOMO' ? C.warn : t.mood === 'Нудьга' ? '#8a8a9c' : C.ok }}>{t.mood}</span>
            <span style={{ fontFamily: F.sans, fontSize: 12.5, color: t.viol === '—' ? C.dim : '#ff9b9b' }}>{t.viol}</span>
            <span style={{ fontFamily: F.mono, fontSize: 13.5, fontWeight: 700, textAlign: 'right', color: t.r.startsWith('−') ? C.bad : C.ok }}>{t.r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- розбір помилок ---------- */

export function ErrorsScreen() {
  return (
    <div>
      <Head
        title="Журнал помилок"
        sub="Помилка, яку записано й розібрано, — єдина, що не повторюється."
        right={<Btn primary icon={Plus} tour="error-new">Зафіксувати помилку</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
        <div data-tour="error-card" style={{ ...panel, padding: 20, borderColor: A(0.24) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, color: C.text2, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 8, padding: '5px 10px' }}>
              XAUUSD
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, color: C.accSoft, background: A(0.14), border: `1px solid ${A(0.4)}`, borderRadius: 999, padding: '5px 11px' }}>
              Не розібрано
            </span>
          </div>

          <div style={{ fontFamily: F.mono, fontSize: 12.5, color: C.text5, marginBottom: 12 }}>08.09.2026</div>

          <p style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.6, color: '#c4c4d4', margin: '0 0 16px' }}>
            Подвоїв обсяг після двох стопів поспіль. Стоп поставив за структурою, але ризик вийшов 2.4R замість звичного 1R.
            Наступного разу: обʼєм рахую до входу, а не після того, як побачив рух.
          </p>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
            {[['Risk Violation', C.bad], ['Тілт', C.warn]].map(([t, c]) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: `${c}ee`, background: `${c}1c`, border: `1px solid ${c}3d`, borderRadius: 999, padding: '5px 11px' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: c }} />
                {t}
              </span>
            ))}
          </div>

          <div data-tour="error-rule">
            <Btn icon={ListChecks} tour={undefined}>Створити правило</Btn>
          </div>
        </div>

        <div style={{ ...panel, padding: 20 }}>
          <div style={{ ...cap, marginBottom: 14 }}>ЩО ПОВТОРЮЄТЬСЯ</div>
          {[['Risk Violation', 3, 46, C.bad], ['FOMO Entry', 2, 31, C.warn], ['Early Exit', 1, 23, '#4da3ff']].map(([k, n, pct, c]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <span style={{ width: 130, fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.text2 }}>{k}</span>
              <span style={{ flex: 1, height: 7, borderRadius: 999, background: '#17171f', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg,${c}5e,${c})` }} />
              </span>
              <span style={{ fontFamily: F.display, fontSize: 15, fontWeight: 700, color: '#fff', width: 20, textAlign: 'right' }}>{n}</span>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 18, padding: 14, background: A(0.07), border: `1px solid ${A(0.2)}`, borderRadius: 13 }}>
            <Flame size={16} strokeWidth={2} color={C.accSoft} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.5, color: '#c4c4d4' }}>
              Порушення ризику тричі за тиждень — це вже система, а не випадковість.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- аналітика ---------- */

const CHARTS = [
  { title: 'СЕСІЇ', bars: [['Азія', 0.3], ['Лондон', 1], ['NY', 0.62]] },
  { title: 'СЕТАПИ', bars: [['A', 1], ['B', 0.55], ['C', 0.22]] },
  { title: 'ДНІ ТИЖНЯ', bars: [['Пн', 0.6], ['Вт', 0.18], ['Ср', 0.82], ['Чт', 0.44], ['Пт', 0.7]] },
];

const RANK = [
  ['Сетап A · свінг + FVG', '+11.4R', C.ok],
  ['Лондонська сесія', '+8.2R', C.ok],
  ['Входи на FOMO', '−8.4R', C.bad],
  ['Вівторок · вечір', '−9.0R', C.bad],
];

export function AnalyticsScreen() {
  return (
    <div>
      <Head title="Аналітика" sub="Не «скільки я заробив», а «що саме мені платить»." right={<Btn icon={Share2}>Поділитись</Btn>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
        {CHARTS.map((ch) => (
          <div key={ch.title} style={{ ...panel, padding: 18 }}>
            <div style={{ ...cap, marginBottom: 16 }}>{ch.title}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 86 }}>
              {ch.bars.map(([label, v]) => (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: '100%', borderRadius: '5px 5px 0 0', height: Math.round(v * 70), background: v >= 0.55 ? A(0.85) : A(0.3) }} />
                  <span style={{ fontFamily: F.mono, fontSize: 10, color: C.dim }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div data-tour="analytics-rank" style={{ ...panel, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ ...cap, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>СКІЛЬКИ ПЛАТИТЬ · РЕЙТИНГ</div>
        {RANK.map(([k, v, c]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,.035)' }}>
            <span style={{ fontFamily: F.sans, fontSize: 13.5, color: '#b8b8c8' }}>{k}</span>
            <span style={{ fontFamily: F.mono, fontSize: 13.5, fontWeight: 700, color: c }}>{v}</span>
          </div>
        ))}
      </div>

      <div data-tour="analytics-coach" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: `linear-gradient(160deg,${A(0.1)},#0b0b10 60%)`, border: `1px solid ${A(0.26)}`, borderRadius: 16, padding: 18 }}>
        <Cat size={40} />
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.4px', color: C.accSoft, marginBottom: 8 }}>РОЗБІР ТИЖНЯ</div>
          <p style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.6, color: '#dcdce8', margin: 0 }}>
            Вісім із двадцяти двох угод узяті повз план, і всі вісім у проміжку 15:00–17:00. Разом −8.4R.
            Найдешевша зміна на тиждень: закривати термінал о 15:00.
          </p>
        </div>
      </div>
    </div>
  );
}
