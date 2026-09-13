import { useMemo } from 'react';
import { Compass, Radio, LineChart, NotebookPen, Layers, Trash2 } from 'lucide-react';
import NarrativeSelect from '../ui/NarrativeSelect';
import UpdatesList from './UpdatesList';
import PlanTabs from './PlanTabs';
import TdaGrid from './TdaGrid';
import { Section, SectionAnchor, FieldLabel, WriteBlock } from './PlanPrimitives';
import { TdaAnalysisFields, AddTdaButton } from './TdaAnalysisCard';
import { T } from './planTheme';
import { weekPlanProgress, emptyTdaAnalysis } from '../../lib/weekPlan';

/* ==================================================================
   Тижневий план.

   Той самий ритм Plan → Live → Review, що й у денному, тільки
   масштаб інший: не один актив на день, а декілька — і на кожен
   свій top-down розбір. Актив і плановий bias живуть ТІЛЬКИ там, у
   самому розборі (той самий пошук по ринку, що й у денному плані) —
   без окремого кроку «спершу обери активи тижня», який лише
   дублював той самий вибір. Розборів декілька — просто додається
   ще один.
================================================================== */

const RATING = [
  { label: 'Погано', color: T.bad, rgb: T.badRgb },
  { label: 'Слабко', color: '#fb923c', rgb: '251,146,60' },
  { label: 'Середньо', color: T.warn, rgb: T.warnRgb },
  { label: 'Добре', color: '#a3e635', rgb: '163,230,53' },
  { label: 'Відмінно', color: T.ok, rgb: T.okRgb },
];

/* ---------- один актив у розборі "Що вийшло" ---------- */
const FIELD = 'w-full rounded-lg bg-transparent text-[14px] outline-none transition-colors duration-150';

function AssetRow({ analysis, onChange }) {
  const patch = (p) => onChange({ ...analysis, ...p });

  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:gap-4"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      <span
        className="inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[15px] font-bold uppercase tabular-nums sm:w-[110px]"
        style={{ fontFamily: T.mono, background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text, letterSpacing: '-0.01em' }}
      >
        {analysis.pair}
      </span>

      <div className="min-w-[150px] sm:w-[170px]">
        <NarrativeSelect value={analysis.actualBias} onChange={(v) => patch({ actualBias: v })} />
      </div>

      <input
        value={analysis.outcome}
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

/* ---------- список активів для звірки — ті самі, що й у top-down аналізі ---------- */
function AssetsBoard({ analyses, onSave }) {
  const reviewable = analyses.filter((a) => a.pair);

  if (!reviewable.length) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl px-6 py-10 text-center"
        style={{ background: T.sunken, border: `1px dashed ${T.line}` }}
      >
        <span className="text-[14.5px] font-semibold" style={{ color: T.text2, fontFamily: T.sans }}>
          Активів на цей тиждень ще немає
        </span>
        <span className="max-w-[320px] text-[13.5px]" style={{ color: T.text4 }}>
          Обери актив у Top-down аналізі вище — він з'явиться і тут, коли настане час звірити факт.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reviewable.map((a) => (
        <AssetRow key={a.id} analysis={a} onChange={(next) => onSave(a.id, next)} />
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
  data, onChange, activeSection, onNavigateSection, onOpenAssetModal, isLoadingAssets,
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

  /* Єдине джерело правди на весь тиждень: кожен розбір — це і актив,
     і плановий bias, і сітка ТФ, і (пізніше, в Review) факт по ньому.
     Plan-картки й рядки Review пишуть в один і той самий масив через
     один і той самий setter. */
  const tdaAnalyses = data.tdaAnalyses || [];
  const setTdaAnalyses = (next) => patch({ tdaAnalyses: next });
  const saveTdaAnalysis = (id, next) => setTdaAnalyses(tdaAnalyses.map((t) => (t.id === id ? next : t)));
  const addTdaAnalysis = () => setTdaAnalyses([...tdaAnalyses, emptyTdaAnalysis()]);
  const removeTdaAnalysis = (id) => setTdaAnalyses(tdaAnalyses.filter((t) => t.id !== id));

  const namedAnalyses = tdaAnalyses.filter((t) => t.pair);
  const reviewedCount = namedAnalyses.filter((t) => t.actualBias || t.outcome?.trim()).length;

  return (
    <>
      <PlanTabs
        active={activeSection}
        onNavigate={onNavigateSection}
        progress={progress}
        overall={overall}
      />

      <div className="mt-6">
        {/* ═══════════════ PLAN ═══════════════ */}
        <SectionAnchor id="plan" first label="Plan" sub="Before" icon={Compass} progress={progress.plan} />

        <div className="flex flex-col gap-5">
          {/* Один розбір — своя окрема секція, а не картка всередині
              спільної: кожен актив згортається окремо, і видно, який
              він, ще до розгортання (заголовок = сам актив). Кнопка
              додати новий розбір — поза секціями, на їхньому рівні. */}
          {tdaAnalyses.map((t) => {
            const filled = t.blocks.filter((b) => b.image || b.text?.trim()).length;
            return (
              <Section
                key={t.id}
                icon={Layers}
                storageKey={`tda-${t.id}`}
                group="plan"
                title={t.pair || 'Top-down аналіз'}
                hint={t.pair ? 'Top-down аналіз' : 'Актив, плановий bias і сітка ТФ'}
                done={filled >= 2}
                right={
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums"
                          style={{ fontFamily: T.sans, color: T.text4 }}>
                      {filled}/4
                    </span>
                    {tdaAnalyses.length > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        title="Прибрати цей розбір"
                        onClick={(e) => { e.stopPropagation(); removeTdaAnalysis(t.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); removeTdaAnalysis(t.id); } }}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors duration-150"
                        style={{ color: T.text4 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Trash2 size={13} strokeWidth={2.2} />
                      </span>
                    )}
                  </div>
                }
              >
                <div className="flex flex-col gap-4 p-5 sm:p-6">
                  <TdaAnalysisFields
                    analysis={t}
                    onOpenAssetModal={onOpenAssetModal}
                    isLoadingAssets={isLoadingAssets}
                    onChange={(next) => saveTdaAnalysis(t.id, next)}
                  />
                  <TdaGrid blocks={t.blocks} onSave={(id, d) => saveTdaAnalysis(t.id, { ...t, blocks: t.blocks.map((b) => (b.id === id ? { ...b, ...d } : b)) })} />
                </div>
              </Section>
            );
          })}
          <AddTdaButton onAdd={addTdaAnalysis} />

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
            hint="Порівняй плановий bias з фактом по кожному розбору"
            done={reviewedCount > 0}
            right={
              namedAnalyses.length > 0 && (
                <span className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {reviewedCount}/{namedAnalyses.length}
                </span>
              )
            }
          >
            <div className="p-5 sm:p-6">
              <AssetsBoard analyses={tdaAnalyses} onSave={saveTdaAnalysis} />
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
