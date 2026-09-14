import { Compass, Link as LinkIcon, Search as SearchIcon, Loader2, Plus } from 'lucide-react';
import NarrativeSelect from '../ui/NarrativeSelect';
import { FieldLabel } from './PlanPrimitives';
import { T } from './planTheme';

/* ==================================================================
   Top-down розбір у тижневому плані: актив, bias і власна сітка ТФ,
   один розбір — один актив, розборів може бути декілька.

   TdaAnalysisFields — сам вибір активу й bias, без картки навколо:
   картку, згортання й заголовок (сам актив) уже дає окрема Section
   у WeeklyPlanView — на кожен розбір своя, а не одна спільна на всіх.
================================================================== */
export function TdaAnalysisFields({ analysis, onOpenAssetModal, isLoadingAssets, onChange }) {
  const patch = (p) => onChange({ ...analysis, ...p });
  return (
    <div className="flex flex-wrap items-end gap-3.5">
      <div className="flex min-w-[140px] flex-1 flex-col gap-1.5 sm:max-w-[210px]">
        <FieldLabel icon={LinkIcon} required filled={!!analysis.pair}>Актив</FieldLabel>
        <button
          onClick={() => onOpenAssetModal(analysis.id)}
          disabled={isLoadingAssets}
          className="flex h-[42px] w-full items-center justify-between rounded-xl px-3.5 text-[15px] font-semibold transition-all duration-200"
          style={{
            background: T.sunken,
            border: `1px solid ${analysis.pair ? T.lineAcc : `rgba(${T.warnRgb},0.28)`}`,
            color: analysis.pair ? T.text : T.text4,
            fontFamily: analysis.pair ? T.mono : T.sans,
            cursor: isLoadingAssets ? 'wait' : 'pointer',
          }}
        >
          <span className="truncate">{analysis.pair || 'Вибрати...'}</span>
          {isLoadingAssets
            ? <Loader2 size={14} className="animate-spin shrink-0" style={{ color: T.text4 }} />
            : <SearchIcon size={14} strokeWidth={2.2} className="shrink-0" style={{ color: analysis.pair ? T.acc : T.warn }} />}
        </button>
      </div>

      <div className="flex min-w-[160px] flex-1 flex-col gap-1.5 sm:max-w-[220px]">
        <FieldLabel icon={Compass} filled={!!analysis.narrative}>Плановий bias</FieldLabel>
        <NarrativeSelect value={analysis.narrative} onChange={(v) => patch({ narrative: v })} />
      </div>
    </div>
  );
}

export function AddTdaButton({ onAdd }) {
  return (
    <button
      onClick={onAdd}
      className="group flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-semibold transition-all duration-200"
      style={{ background: 'transparent', border: `1px dashed ${T.line}`, color: T.text4, fontFamily: T.sans }}
      onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.4)`; e.currentTarget.style.background = `rgba(${T.accRgb},0.04)`; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = 'transparent'; }}
    >
      <Plus size={14} strokeWidth={2.6} className="transition-transform duration-300 group-hover:rotate-90" />
      Ще один розбір
    </button>
  );
}
