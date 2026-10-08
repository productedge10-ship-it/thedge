import { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { ACT, act, actGradient } from '../accent';
import Button from '../../ui/Button';

/* ==================================================================
   Порожній стан і приймач файлу.

   Пояснення — прямо тут, по кроках, бо експорт барів у MT5 захований
   у вікні «Символи», і без підказки його не знаходить майже ніхто.
================================================================== */

export function useCandleFilePicker(onFile) {
  const ref = useRef(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept=".csv,.txt,text/csv,text/plain"
      className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }}
    />
  );
  return [input, () => ref.current?.click()];
}

export function ImportProgress({ progress, label }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
      <div className="w-[300px] rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2.5 text-[14px] font-semibold" style={{ color: T.text }}>
          <Loader2 size={16} className="animate-spin" style={{ color: ACT.tint }} />
          {label || tx('Розбираю файл…', 'Reading the file…')}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: T.sunken }}>
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%`, background: actGradient }} />
        </div>
        <div className="mt-2 text-right text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>{Math.round(progress * 100)}%</div>
      </div>
    </div>
  );
}

export default function ImportCandles({ onFile }) {
  const [over, setOver] = useState(false);
  const [input, pick] = useCandleFilePicker(onFile);

  const steps = [
    tx('Відкрий MT5 → Вигляд → Символи (Ctrl+U) → вкладка «Бари».', 'Open MT5 → View → Symbols (Ctrl+U) → “Bars” tab.'),
    tx('Обери інструмент і таймфрейм M1, постав початкову дату (наприклад, 3 роки тому) і натисни «Запит».', 'Pick the symbol and M1, set a start date (e.g. 3 years back) and press “Request”.'),
    tx('Натисни «Експортувати бари» і збережи CSV.', 'Press “Export Bars” and save the CSV.'),
    tx('Перетягни файл сюди. Він лишиться в цьому браузері — на сервер не йде.', 'Drop the file here. It stays in this browser — nothing is uploaded.'),
  ];

  return (
    <div className="grid h-full place-items-center p-6">
      {input}
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className="w-full max-w-[560px] rounded-2xl p-7 transition-colors"
        style={{
          background: over ? act(0.08) : T.surface,
          border: `1px dashed ${over ? act(0.7) : T.lineHi}`,
        }}
      >
        <div className="grid h-12 w-12 place-items-center rounded-xl" style={{ background: act(0.14), color: ACT.tint }}>
          <UploadCloud size={22} />
        </div>
        <h2 className="mt-4 text-[20px] font-bold" style={{ color: T.text }}>
          {tx('Завантаж свічки з MT5', 'Load candles from MT5')}
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: T.text2 }}>
          {tx(
            'Бектест іде на історії твого ж брокера: ті самі свічки, спред і години, що в терміналі.',
            'The backtest runs on your own broker’s history: the same candles and hours as in your terminal.',
          )}
        </p>
        <ol className="mt-5 space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[13.5px] leading-snug" style={{ color: T.text2 }}>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: T.sunken, color: T.text3, fontFamily: T.mono }}>{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <Button variant="primary" size="lg" block icon={UploadCloud} onClick={pick} className="mt-6">
          {tx('Обрати файл CSV', 'Choose CSV file')}
        </Button>
      </div>
    </div>
  );
}
