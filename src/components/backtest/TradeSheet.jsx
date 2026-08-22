import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import { X, Check, Trash2, ImagePlus, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { SESSIONS, QUALITIES, metaOf, pairOf } from '../../lib/backtestStats';

/* ==================================================================
   Деталі угоди бектесту.
   Тільки те, що реально потрібно, щоб потім розібрати угоду:
   актив, напрям і результат, R, сесія, якість, сетап, скрін і запис.
   Ніяких рівнів входу та анкет — у бектесті вони не окупаються.
================================================================== */

const qualColor = (q) => ({ 'A+': T.ok, A: T.acc, B: T.warn, C: T.bad }[q] || T.text3);
const resColor = (r) => ({ WIN: T.ok, LOSS: T.bad, BE: T.text3 }[r] || T.text3);

const SETUP_TAGS = ['Silver Bullet', 'SFP', 'Manipulation', 'BOS', 'OB retest', 'FVG', 'Swing', 'FOMO', 'Impatience'];

function Field({ label, children, hint }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>{label}</span>
        {hint && <span className="truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* Сегмент: активний — залитий кольором, неактивний просто світлішає.
   Один стан, один перехід, нічого не стрибає. */
function Seg({ options, value, onChange, colorOf, full }) {
  return (
    <div className={`flex items-center gap-1 rounded-xl p-1 ${full ? 'w-full' : 'w-fit'}`} style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      {options.map((o) => {
        const on = value === o;
        const c = colorOf ? colorOf(o) : T.acc;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-bold transition-colors duration-200 ${full ? 'flex-1' : ''}`}
            style={{
              fontFamily: T.sans,
              color: on ? c : T.text3,
              background: on ? `${c}1f` : 'transparent',
              border: `1px solid ${on ? `${c}3d` : 'transparent'}`,
            }}
            onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = T.text; } }}
            onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/* Поле: на ховері рамка світлішає, на фокусі стає акцентною */
function Input({ value, onChange, placeholder, mono, className = '', ...rest }) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-11 w-full rounded-xl px-3.5 text-[14px] outline-none transition-colors duration-200 ${className}`}
      style={{
        background: T.sunken, border: `1px solid ${T.line}`, color: T.text,
        fontFamily: mono ? T.mono : T.sans,
      }}
      onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = T.line; }}
      onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
      onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
      {...rest}
    />
  );
}

function IconBtn({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 active:scale-95"
      style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? `rgba(${T.badRgb},0.10)` : T.surfaceHi;
        e.currentTarget.style.borderColor = danger ? `rgba(${T.badRgb},0.35)` : T.lineHi;
        e.currentTarget.style.color = danger ? T.bad : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = T.surface;
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.color = T.text2;
      }}
    >
      <Icon size={15} strokeWidth={2.2} />
    </button>
  );
}

export default function TradeSheet({ initial, pair, saving, onClose, onSave, onDelete }) {
  const meta = metaOf(initial);
  const [f, setF] = useState({
    id: initial?.id || null,
    date: initial?.date || new Date().toISOString().slice(0, 10),
    pair: pairOf(initial, pair) || pair || '',
    type: initial?.type || 'LONG',
    result: initial?.result || 'WIN',
    rr: initial?.rr != null ? String(Math.abs(initial.rr)) : '2',
    quality: meta.quality || 'A',
    session: meta.session || 'London',
    tags: meta.tags || [],
    notes: initial?.notes || '',
    screenshot_url: initial?.screenshot_url || null,
  });
  const fileRef = useRef(null);
  const set = (p) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const readFile = (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => set({ screenshot_url: r.result });
    r.readAsDataURL(file);
  };

  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text');
    if (text && /^https?:\/\//.test(text.trim())) { set({ screenshot_url: text.trim() }); e.preventDefault(); return; }
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.indexOf('image') !== -1);
    if (item) { e.preventDefault(); readFile(item.getAsFile()); }
  };

  const toggleTag = (tag) =>
    set({ tags: f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag] });

  const submit = () => {
    const rr = Number(String(f.rr).replace(',', '.'));
    onSave({
      ...f,
      rr: f.result === 'BE' ? 0 : f.result === 'LOSS' ? 1 : Number.isFinite(rr) ? Math.abs(rr) : 0,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
        className="my-auto w-full max-w-[760px] overflow-hidden rounded-3xl"
        style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)' }}
      >
        {/* шапка */}
        <div
          className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5 sm:px-7"
          style={{ borderBottom: `1px solid ${T.line}`, background: 'rgba(19,19,22,0.94)', backdropFilter: 'blur(14px)' }}
        >
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-200"
            style={{
              background: f.type === 'LONG' ? `rgba(${T.okRgb},0.10)` : `rgba(${T.infoRgb},0.10)`,
              border: `1px solid ${f.type === 'LONG' ? `rgba(${T.okRgb},0.22)` : `rgba(${T.infoRgb},0.22)`}`,
            }}
          >
            {f.type === 'LONG'
              ? <TrendingUp size={15} strokeWidth={2.4} style={{ color: T.ok }} />
              : <TrendingDown size={15} strokeWidth={2.4} style={{ color: T.info }} />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
              {f.id ? 'Угода' : 'Нова угода'}
            </div>
            <div className="truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              {f.pair || 'без активу'} · {f.session}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {f.id && onDelete && <IconBtn icon={Trash2} label="Видалити" onClick={() => onDelete(f.id)} danger />}
            <IconBtn icon={X} label="Закрити (Esc)" onClick={onClose} />
          </div>
        </div>

        <div className="flex flex-col gap-6 px-4 py-5 sm:px-7 sm:py-6">
          {/* напрям і результат */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Напрям">
              <Seg full options={['LONG', 'SHORT']} value={f.type} onChange={(v) => set({ type: v })} colorOf={(v) => (v === 'LONG' ? T.ok : T.info)} />
            </Field>
            <Field label="Результат">
              <Seg full options={['WIN', 'LOSS', 'BE']} value={f.result} onChange={(v) => set({ result: v })} colorOf={resColor} />
            </Field>
          </div>

          {/* актив · R · дата */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Актив">
              <Input value={f.pair} onChange={(v) => set({ pair: v.toUpperCase() })} placeholder="EURUSD" mono />
            </Field>
            <Field label="R" hint={f.result !== 'WIN' ? 'авто' : null}>
              <Input
                mono
                value={f.result === 'WIN' ? f.rr : f.result === 'LOSS' ? '−1' : '0'}
                onChange={(v) => set({ rr: v.replace(',', '.') })}
                disabled={f.result !== 'WIN'}
                inputMode="decimal"
              />
            </Field>
            <Field label="Дата">
              <input
                type="date"
                value={f.date}
                onChange={(e) => set({ date: e.target.value })}
                className="h-11 w-full rounded-xl px-3.5 text-[14px] outline-none transition-colors duration-200"
                style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, colorScheme: 'dark' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
              />
            </Field>
          </div>

          {/* сесія · якість */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Сесія">
              <Seg full options={SESSIONS} value={f.session} onChange={(v) => set({ session: v })} />
            </Field>
            <Field label="Якість">
              <Seg full options={QUALITIES} value={f.quality} onChange={(v) => set({ quality: v })} colorOf={qualColor} />
            </Field>
          </div>

          {/* сетап */}
          <Field label="Сетап" hint="можна кілька">
            <div className="flex flex-wrap gap-2">
              {SETUP_TAGS.map((tag) => {
                const on = f.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-200"
                    style={{
                      fontFamily: T.sans,
                      color: on ? T.acc : T.text3,
                      background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                      border: `1px solid ${on ? T.lineAcc : T.line}`,
                    }}
                    onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; } }}
                    onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; } }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* графік */}
          <Field label="Графік" hint="Ctrl+V, файл або посилання">
            {f.screenshot_url ? (
              <div
                className="group relative overflow-hidden rounded-2xl transition-colors duration-200"
                style={{ border: `1px solid ${T.line}` }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
              >
                <img src={f.screenshot_url} alt="" className="block max-h-[340px] w-full object-contain" style={{ background: T.sunken }} />
                <button
                  onClick={() => set({ screenshot_url: null })}
                  title="Прибрати"
                  className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
                  style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${T.line}`, color: T.text2, backdropFilter: 'blur(8px)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
                >
                  <X size={14} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}
                className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl text-[13.5px] font-semibold transition-colors duration-200"
                style={{ background: T.sunken, border: `1px dashed ${T.lineHi}`, color: T.text3, fontFamily: T.sans }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineAcc; e.currentTarget.style.color = T.acc; e.currentTarget.style.background = `rgba(${T.accRgb},0.04)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text3; e.currentTarget.style.background = T.sunken; }}
              >
                <ImagePlus size={20} strokeWidth={1.9} />
                Встав скрін графіка
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => readFile(e.target.files?.[0])} />
          </Field>

          {/* запис */}
          <Field label="Запис">
            <div
              className="rounded-2xl transition-colors duration-200"
              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
            >
              <TextareaAutosize
                value={f.notes}
                onChange={(e) => set({ notes: e.target.value })}
                placeholder="Що бачив, чому зайшов, що зробив би інакше."
                minRows={3}
                className="w-full resize-none border-none bg-transparent px-4 py-3 outline-none"
                style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.text }}
              />
            </div>
          </Field>
        </div>

        {/* дії */}
        <div className="flex items-center justify-end gap-2.5 px-4 py-4 sm:px-7" style={{ borderTop: `1px solid ${T.line}` }}>
          <button
            onClick={onClose}
            className="h-11 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
          >
            Скасувати
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            style={{
              background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
              boxShadow: `0 6px 18px -8px rgba(${T.accRgb},0.6)`,
              opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`)}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`)}
          >
            {saving ? <Loader2 size={15} strokeWidth={3} className="animate-spin" /> : <Check size={15} strokeWidth={3} className="shrink-0" />}
            {f.id ? 'Зберегти' : 'Додати угоду'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
