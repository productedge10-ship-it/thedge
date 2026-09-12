import { useMemo } from 'react';
import {
  Compass, Layers, Radio, LineChart, NotebookPen,
  Link as LinkIcon, Search as SearchIcon, Loader2, X,
} from 'lucide-react';
import NarrativeSelect from '../ui/NarrativeSelect';
import UpdatesList from './UpdatesList';
import TdaGrid from './TdaGrid';
import PlanTabs from './PlanTabs';
import { Spotlight } from '../ui/Hovers';
import { Section, SectionAnchor, FieldLabel, WriteBlock } from './PlanPrimitives';
import { T } from './planTheme';
import { weekPlanProgress } from '../../lib/weekPlan';

/* ==================================================================
   Тижневий план.

   Той самий ритм Plan → Live → Review, що й у денному, тільки
   масштаб інший: не один актив на день, а список того, за чим
   стежиш увесь тиждень — і список цей навмисно може бути порожнім.
   Тиждень без чіткої ідеї — теж чесний результат, а не помилка
   заповнення форми.
================================================================== */

const RATING = [
  { label: 'Погано', color: T.bad, rgb: T.badRgb },
  { label: 'Слабко', color: '#fb923c', rgb: '251,146,60' },
  { label: 'Середньо', color: T.warn, rgb: T.warnRgb },
  { label: 'Добре', color: '#a3e635', rgb: '163,230,53' },
  { label: 'Відмінно', color: T.ok, rgb: T.okRgb },
];

function assetCountLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} актив`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${n} активи`;
  return `${n} активів`;
}

const BIAS_TONE = {
  Bullish: [T.ok, T.okRgb],
  Bearish: [T.bad, T.badRgb],
  Neutral: [T.text2, '180,180,189'],
  'Day off': [T.info, T.infoRgb],
};

function BiasChip({ value }) {
  if (!value) return <span className="text-[13px] font-medium" style={{ color: T.text4 }}>—</span>;
  const [c, rgb] = BIAS_TONE[value] || [T.text2, '180,180,189'];
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[12.5px] font-semibold"
      style={{ background: `rgba(${rgb},0.10)`, border: `1px solid rgba(${rgb},0.24)`, color: c, fontFamily: T.sans }}
    >
      {value}
    </span>
  );
}

/* ---------- один актив у списку ---------- */
const FIELD = 'w-full rounded-lg bg-transparent text-[14px] outline-none transition-colors duration-150';

/* Актив уже вибраний зверху мультивибором — тут лишається тільки
   звірити факт: bias тижня був один, і саме з ним звіряється кожен
   актив, а не з окремою тезою на нього. */
function AssetRow({ asset, weekNarrative, onChange }) {
  const patch = (p) => onChange({ ...asset, ...p });

  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:gap-4"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      <div className="flex shrink-0 items-center gap-2.5 sm:w-[168px]">
        <span
          className="truncate rounded-lg px-2.5 py-1.5 text-[13.5px] font-bold uppercase tabular-nums"
          style={{ fontFamily: T.mono, background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text }}
        >
          {asset.pair || '—'}
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: T.text4 }}>
          тиждень: <BiasChip value={weekNarrative} />
        </span>
      </div>

      <div className="min-w-[150px] sm:w-[170px]">
        <NarrativeSelect value={asset.actualBias} onChange={(v) => patch({ actualBias: v })} />
      </div>

      <input
        value={asset.outcome}
        onChange={(e) => patch({ outcome: e.target.value })}
        placeholder="Що вийшло по факту?"
        className={FIELD}
        style={{ border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, padding: '10px 12px' }}
        onFocus={(e) => (e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.4)`)}
        onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
      />
    </div>
  );
}

/* ---------- список активів (тільки Review — вибір живе зверху) ---------- */
function AssetsBoard({ assets, weekNarrative, onChange }) {
  const setOne = (id, next) => onChange(assets.map((a) => (a.id === id ? next : a)));

  if (!assets.length) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl px-6 py-10 text-center"
        style={{ background: T.sunken, border: `1px dashed ${T.line}` }}
      >
        <span className="text-[14.5px] font-semibold" style={{ color: T.text2, fontFamily: T.sans }}>
          Активів на цей тиждень не обрано
        </span>
        <span className="max-w-[320px] text-[13.5px]" style={{ color: T.text4 }}>
          Тиждень без конкретної ідеї — теж результат, порівнювати тут нема з чим.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {assets.map((a) => (
        <AssetRow key={a.id} asset={a} weekNarrative={weekNarrative} onChange={(next) => setOne(a.id, next)} />
      ))}
    </div>
  );
}

/* ---------- оцінка тижня: той самий 1–5, що й у денному розборі ---------- */
function WeekRating({ value, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      <FieldLabel>Наскільки дотримався тижневої тези?</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {RATING.map((r, i) => {
          const n = i + 1;
          const active = value === n;
          return (
            <button
              key={n}
              onClick={() => onChange(n)}
              className="flex h-11 flex-1 items-center justify-center rounded-xl text-[14px] font-semibold transition-all duration-200 sm:flex-none sm:w-[62px]"
              style={{
                background: active ? `rgba(${r.rgb},0.12)` : T.sunken,
                border: `1px solid ${active ? `rgba(${r.rgb},0.42)` : T.line}`,
                color: active ? r.color : T.text3,
                fontFamily: T.sans,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = T.line; }}
            >
              {n}
            </button>
          );
        })}
        {value > 0 && (
          <span
            className="flex items-center px-2 text-[14px] font-semibold"
            style={{ color: RATING[value - 1].color, fontFamily: T.sans }}
          >
            {RATING[value - 1].label}
          </span>
        )}
      </div>
    </div>
  );
}

/* ==================================================================
   Головний компонент
================================================================== */
export default function WeeklyPlanView({
  data, onChange, activeSection, onNavigateSection,
  onOpenAssetModal, isLoadingAssets, onRemoveAsset,
}) {
  const patch = (p) => onChange({ ...data, ...p });

  /* Той самий розрахунок, що й рейка зліва в DailyPlan.jsx отримує
     через weekPlanProgress — тут лишається тільки useMemo-обгортка,
     щоб не рахувати заново на кожен рендер. */
  const progress = useMemo(() => weekPlanProgress(data), [data]);
  const overall = progress.plan * 0.45 + progress.live * 0.1 + progress.review * 0.45;

  const addUpdate = () => {
    const weekday = new Date().toLocaleDateString('uk-UA', { weekday: 'short' });
    const time = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    patch({
      updates: [...data.updates, { id: Date.now(), date: `${weekday}, ${time}`, tf: '', image: null, text: '' }],
    });
  };
  const saveUpdate = (id, d) => patch({ updates: data.updates.map((u) => (u.id === id ? { ...u, ...d } : u)) });
  const saveTda = (id, d) => patch({ tdaBlocks: (data.tdaBlocks || []).map((b) => (b.id === id ? { ...b, ...d } : b)) });
  const tdaFilled = (data.tdaBlocks || []).filter((b) => b.image || b.text?.trim()).length;

  const reviewedCount = data.assets.filter((a) => a.actualBias || a.outcome?.trim()).length;

  return (
    <>
      {/* Spotlight замість звичайного Card: та сама м'яка підсвітка за
         курсором, що й у картках аналізів, але без clip — інакше вона
         обрізає спадне меню bias, коли те відкривається нижче краю
         картки. Дата тижня вже сказана заголовком сторінки (PlanHeader),
         тут лишається тільки те, що людина справді вибирає. */}
      <Spotlight
        clip={false}
        lift={false}
        radius={420}
        color={`rgba(${T.accRgb},0.28)`}
        className="relative rounded-2xl"
        style={{
          background: `linear-gradient(160deg, ${T.surface}, ${T.sunken})`,
          border: `1px solid ${T.line}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 60px -36px rgba(0,0,0,0.85)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full opacity-25 blur-[64px]"
          style={{ background: `rgba(${T.accRgb},1)` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${T.accRgb},0.55), transparent)` }}
        />

        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-5">
            <div className="flex min-w-[200px] flex-1 flex-col gap-2 sm:max-w-[300px]">
              <FieldLabel icon={LinkIcon} filled={data.assets.length > 0}>Активи тижня</FieldLabel>
              <button
                onClick={onOpenAssetModal}
                disabled={isLoadingAssets}
                className="flex h-[46px] w-full items-center justify-between rounded-xl px-4 text-[15px] font-semibold transition-all duration-200"
                style={{
                  background: data.assets.length ? `rgba(${T.accRgb},0.08)` : T.sunken,
                  border: `1px solid ${data.assets.length ? `rgba(${T.accRgb},0.32)` : T.line}`,
                  color: data.assets.length ? T.text : T.text4,
                  fontFamily: T.sans,
                  cursor: isLoadingAssets ? 'wait' : 'pointer',
                }}
                onMouseEnter={(e) => { if (!isLoadingAssets) e.currentTarget.style.borderColor = data.assets.length ? `rgba(${T.accRgb},0.5)` : T.lineHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = data.assets.length ? `rgba(${T.accRgb},0.32)` : T.line; }}
              >
                <span className="truncate">
                  {data.assets.length ? assetCountLabel(data.assets.length) : 'Вибрати...'}
                </span>
                {isLoadingAssets
                  ? <Loader2 size={15} className="animate-spin shrink-0" style={{ color: T.text4 }} />
                  : <SearchIcon size={15} strokeWidth={2.2} className="shrink-0" style={{ color: data.assets.length ? T.acc : T.text4 }} />}
              </button>
            </div>

            <div className="flex min-w-[200px] flex-1 flex-col gap-2 sm:max-w-[300px]">
              <FieldLabel icon={Compass} required filled={!!data.narrative}>Загальний bias тижня</FieldLabel>
              <NarrativeSelect value={data.narrative} onChange={(v) => patch({ narrative: v })} />
            </div>
          </div>

          {data.assets.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.assets.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-[12.5px] font-bold uppercase tabular-nums"
                  style={{ fontFamily: T.mono, background: `rgba(${T.accRgb},0.08)`, border: `1px solid rgba(${T.accRgb},0.22)`, color: T.text2 }}
                >
                  {a.pair}
                  <button
                    onClick={() => onRemoveAsset(a.pair)}
                    title="Прибрати актив"
                    className="grid h-4 w-4 place-items-center rounded-full transition-colors duration-150"
                    style={{ color: T.text4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
                  >
                    <X size={11} strokeWidth={2.6} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Spotlight>

      <div className="mt-6">
        <PlanTabs
          active={activeSection}
          onNavigate={onNavigateSection}
          progress={progress}
          overall={overall}
        />
      </div>

      <div>
        {/* ═══════════════ PLAN ═══════════════ */}
        <SectionAnchor id="plan" first label="Plan" sub="Before" icon={Compass} progress={progress.plan} />

        <div className="flex flex-col gap-5">
          <Section
            icon={Layers}
            storageKey="week-tda"
            group="plan"
            title="Top-down аналіз"
            hint="Структура від старших ТФ до молодших — старший масштаб для тижневої тези"
            done={tdaFilled >= 2}
            right={
              <span className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
                {tdaFilled}/4
              </span>
            }
          >
            <div className="p-5 sm:p-6">
              <TdaGrid blocks={data.tdaBlocks || []} onSave={saveTda} />
            </div>
          </Section>

          <Section
            icon={Compass}
            storageKey="week-thesis"
            group="plan"
            title="Теза тижня"
            hint="Загальна картина ринку і що її заперечить"
            done={!!data.planText?.trim()}
          >
            <WriteBlock
              value={data.planText}
              onChange={(v) => patch({ planText: v })}
              placeholder="Що очікуєш від ринку цього тижня і за яких умов ідея не спрацює?"
              hint="Один абзац логіки вартий десяти індикаторів"
              minRows={6}
            />
          </Section>
        </div>

        {/* ═══════════════ LIVE ═══════════════ */}
        <SectionAnchor id="live" label="Live" sub="During" icon={Radio} progress={progress.live} />

        <Section
          icon={Radio}
          storageKey="week-updates"
          group="live"
          title="Проміжні перевірки"
          hint="Середа — гарний день звірити тезу з реальністю"
          done={progress.live >= 1 && data.updates.length > 0}
        >
          <div className="p-5 sm:p-6">
            <UpdatesList updates={data.updates} onAdd={addUpdate} onSave={saveUpdate} />
          </div>
        </Section>

        {/* ═══════════════ REVIEW ═══════════════ */}
        <SectionAnchor id="review" label="Review" sub="After" icon={LineChart} progress={progress.review} />

        <div className="flex flex-col gap-5">
          <Section
            icon={LineChart}
            storageKey="week-outcome"
            group="review"
            title="Що вийшло по активах"
            hint="Порівняй тезу з фактом по кожному, за яким стежив"
            done={reviewedCount > 0}
            right={
              data.assets.length > 0 && (
                <span className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {reviewedCount}/{data.assets.length}
                </span>
              )
            }
          >
            <div className="p-5 sm:p-6">
              <AssetsBoard assets={data.assets} weekNarrative={data.narrative} onChange={(assets) => patch({ assets })} />
            </div>
          </Section>

          <Section
            icon={NotebookPen}
            storageKey="week-conclusions"
            group="review"
            title="Висновки тижня"
            hint="Що забереш у наступний тиждень"
            done={!!data.conclusionsText?.trim() && data.weekRating > 0}
          >
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <WeekRating value={data.weekRating} onChange={(n) => patch({ weekRating: n })} />
            </div>
            <WriteBlock
              value={data.conclusionsText}
              onChange={(v) => patch({ conclusionsText: v })}
              placeholder="Що спрацювало, що зламалось, що зробити інакше наступного тижня?"
              hint="Один чіткий висновок вартий десяти розмитих"
              minRows={6}
            />
          </Section>
        </div>
      </div>
    </>
  );
}
