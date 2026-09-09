import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Pencil, Trash2, Check, Clock, ChevronLeft, ChevronRight,
  ListChecks, Filter, Copy, AlertTriangle, Image as ImageIcon,
} from 'lucide-react';
import { getCat, reasonLabel, REASON_GROUPS } from './utils';
import { T } from '../../lib/theme';
import { notify } from '../../utils/notify';
import ImageSlider from '../ui/ImageSlider';
import RuleFromErrorModal from './RuleFromErrorModal';

/* ==================================================================
   Перегляд помилки.

   Було висувною шухлядою праворуч — і це неправильно вибраний жанр.
   Шухляда добра для довідки збоку, коли головне лишається на екрані;
   тут же розбір помилки і є головне, а список за ним тільки відволікає.
   Тому вікно по центру.

   Дві колонки. Ліворуч — сам розбір: пара, причини, висновок, скрін.
   Праворуч — рейка з контекстом: стан, факти, вага цієї категорії в
   журналі і три дії. Рейка заразом тримає висоту: без неї вміст
   закінчувався на другому рядку тексту, і 70% вікна лишалось порожнім.
================================================================== */

const Z = 2100;
const A = (a) => `rgba(${T.accRgb}, ${a})`;

const GROUP_COLOR = {
  Main: 'var(--edge-bad)',
  Entry: 'var(--edge-info)',
  'Management and exit': 'var(--edge-warn)',
  Risk: 'var(--edge-bad)',
  Mindset: 'var(--edge-acc)',
  Preparation: 'var(--edge-ok)',
};

const MON = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

const Cap = ({ children, hint }) => (
  <div className="flex items-baseline justify-between gap-2.5">
    <span
      className="text-[11.5px] font-bold uppercase"
      style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: 'var(--edge-text2)' }}
    >
      {children}
    </span>
    {hint && <span className="text-[13px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>{hint}</span>}
  </div>
);

const IconBtn = ({ icon: Icon, title, danger, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className="grid h-9 w-9 place-items-center rounded-[11px]"
    style={{ background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)', color: 'var(--edge-text2)', transition: 'all .16s' }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = danger ? 'rgba(var(--edge-bad-rgb),0.14)' : 'rgba(var(--edge-hair-rgb),0.09)';
      e.currentTarget.style.borderColor = danger ? 'rgba(var(--edge-bad-rgb),0.40)' : 'var(--edge-line-hi)';
      e.currentTarget.style.color = danger ? 'var(--edge-bad)' : 'var(--edge-text)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'rgba(var(--edge-hair-rgb),0.03)';
      e.currentTarget.style.borderColor = 'var(--edge-line)';
      e.currentTarget.style.color = 'var(--edge-text2)';
    }}
  >
    <Icon size={15} strokeWidth={1.9} />
  </button>
);

/* Ті самі граблі, що й на картках: ховер на стані React смикав рядок
   при кожному русі курсора між іконкою, текстом і стрілкою — браузер
   встигав перемалювати кнопку кілька разів на одному проході. Тепер
   це чистий CSS, без жодного рендера. */
const ROW_CSS = `
.err-act{
  --ac: var(--edge-acc-rgb, 139,123,255);
  background:rgba(var(--edge-hair-rgb),0.02);
  border:1px solid var(--edge-line);
  color:var(--edge-text2);
  transition:background .16s, border-color .16s, color .16s;
}
.err-act:hover{
  background:rgba(var(--ac),.10);
  border-color:rgba(var(--ac),.45);
  color:#ffffff;
}
.err-act .err-act-ico{color:var(--edge-text2);transition:color .16s}
.err-act:hover .err-act-ico{color:var(--edge-acc)}
`;

function ActionRow({ icon: Icon, label, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className="err-act flex h-[42px] w-full items-center gap-2.5 rounded-[11px] px-3"
    >
      <Icon size={15} strokeWidth={1.8} className="err-act-ico shrink-0" />
      <span className="min-w-0 flex-1 text-left text-[14px] font-semibold" style={{ fontFamily: T.sans }}>
        {label}
      </span>
      <ChevronRight size={14} strokeWidth={2} style={{ flex: 'none', opacity: 0.7 }} />
    </button>
  );
}

export default function ErrorDetailDrawer({
  selected, numMap, entries = [], onClose, onDelete, onResolve, onEdit, onSimilar, onPrev, onNext,
}) {
  const [ctaHover, setCtaHover] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onPrev, onNext]);

  /* Вага категорії в журналі: скільки таких записів і яку частку
     вони займають. Саме це відрізняє разовий промах від системи —
     і саме з цього народжується правило. */
  const stats = useMemo(() => {
    if (!selected) return null;
    const mainCat = (selected.cats || [])[0];
    if (!mainCat) return null;
    const same = entries.filter((e) => (e.cats || []).includes(mainCat));
    const total = entries.length || 1;
    return {
      cat: getCat(mainCat),
      count: same.length,
      pct: Math.round((same.length / total) * 100),
      last: same.map((e) => e.date).sort().slice(-1)[0] || '',
    };
  }, [selected, entries]);

  if (!selected) return null;

  const cat = stats?.cat || getCat((selected.cats || [])[0]);

  /* Оформлення вікна — акцентне, як і картки в стрічці. Фарбувати
     всю модалку в колір категорії означало відкривати майже кожну
     помилку в червоному: у журналі переважають ризик і FOMO, і
     червоний перестає щось значити рівно тоді, коли він скрізь.
     Колір категорії лишився там, де він несе сенс — на її чіпі,
     теґах причин і в блоці статистики. */
  const color = T.acc;
  const catColor = cat?.color || T.acc;
  const reasons = selected.reasons || [];
  const shots = selected.shots || [];

  const d = new Date(`${selected.date || ''}T00:00:00`);
  const okDate = !Number.isNaN(d.getTime());
  const stamp = okDate
    ? `№ ${String(numMap?.[selected.id] || 0).padStart(3, '0')} · ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
    : `№ ${String(numMap?.[selected.id] || 0).padStart(3, '0')}`;
  const short = okDate ? `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}` : '—';

  const reasonColor = (id) => {
    const g = REASON_GROUPS.find((x) => x.items.some((r) => r.id === id));
    return g ? (GROUP_COLOR[g.group] || T.acc) : 'var(--edge-ok)';
  };

  const facts = [
    ['Записано', short],
    ['Пара', selected.pair || '—'],
    ['Причин', String(reasons.length)],
    ['Стан', selected.resolved ? 'Розібрано' : 'Не розібрано'],
  ];

  const copyAll = async () => {
    const text = [
      `${selected.pair || ''} · ${short}`,
      reasons.map(reasonLabel).join(', '),
      '',
      selected.desc || '',
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      notify.success('Скопійовано', 'Розбір у буфері.');
    } catch {
      /* Дозволу на буфер може не бути — тоді старий спосіб, він
         працює скрізь, де є фокус на сторінці. */
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      notify.success('Скопійовано', 'Розбір у буфері.');
    }
  };

  const body = (
    <AnimatePresence>
      {selected && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(8px)', zIndex: Z }}
          />

          <div
            style={{
              position: 'fixed', inset: 0, zIndex: Z + 1, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative flex w-full flex-col overflow-hidden"
              style={{
                pointerEvents: 'auto',
                maxWidth: 1000,
                maxHeight: '92vh',
                borderRadius: 24,
                /* Два шари, а не один градієнт: перша зупинка
                   `${color}14` — це колір із альфою 8%, і там, де
                   вона стояла першою, вікно було буквально
                   напівпрозорим — крізь шапку просвічувала сторінка.
                   Тепер акцентний відтінок лежить ПОВЕРХ непрозорої
                   підкладки. */
                backgroundColor: 'var(--edge-sunken)',
                backgroundImage: `linear-gradient(170deg, ${color}26, transparent 34%), linear-gradient(170deg, var(--edge-surface-hi), var(--edge-sunken))`,
                border: '1px solid var(--edge-line)',
                boxShadow: `0 50px 110px -40px #000, 0 0 0 1px ${color}14`,
              }}
            >
              <style>{ROW_CSS}</style>

              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg,transparent,${color}cc 28%,rgba(var(--edge-acc-rgb),0.80) 72%,transparent)` }}
              />

              {/* ---------- шапка ---------- */}
              <div
                className="flex flex-none items-center justify-between gap-5 py-4 pl-[22px] pr-[18px]"
                style={{ borderBottom: '1px solid var(--edge-line)' }}
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <span
                    className="grid h-[38px] w-[38px] flex-none place-items-center rounded-xl"
                    style={{ background: `${color}20`, border: `1px solid ${color}5e`, boxShadow: `inset 0 1px 0 ${color}4d`, color: 'var(--edge-acc)' }}
                  >
                    <AlertTriangle size={17} strokeWidth={1.9} />
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {cat && (
                        <span
                          className="flex items-center gap-2 rounded-full px-3.5 py-[6px] text-[13px] font-bold"
                          style={{ fontFamily: T.sans, background: `${catColor}1f`, border: `1px solid ${catColor}4d`, color: `${catColor}f2` }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor, boxShadow: `0 0 8px 1px ${catColor}cc` }} />
                          {cat.label}
                        </span>
                      )}
                      <span
                        className="text-[12px] uppercase"
                        style={{ fontFamily: T.mono, letterSpacing: '1.2px', color: 'var(--edge-text3)' }}
                      >
                        {stamp}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-none items-center gap-2">
                  {onEdit && <IconBtn icon={Pencil} title="Редагувати" onClick={() => onEdit(selected)} />}
                  <IconBtn icon={Trash2} title="Видалити" danger onClick={() => onDelete(selected.id)} />
                  <span className="mx-0.5 h-6 w-px" style={{ background: 'var(--edge-line)' }} />
                  <IconBtn icon={X} title="Закрити" onClick={onClose} />
                </div>
              </div>

              {/* ---------- дві колонки ---------- */}
              <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[1fr_292px]">
                <div className="min-w-0 px-7 pb-6 pt-6" style={{ borderRight: '1px solid var(--edge-line)' }}>
                  <div className="flex flex-wrap items-center gap-3.5">
                    <span style={{ fontFamily: T.display, fontSize: 40, fontWeight: 700, letterSpacing: '-1.6px', lineHeight: 1, color: 'var(--edge-text)' }}>
                      {selected.pair || 'Без пари'}
                    </span>
                    <span
                      className="flex items-center gap-2 rounded-full px-4 py-[8px] text-[13.5px] font-bold"
                      style={{
                        fontFamily: T.sans,
                        background: selected.resolved ? 'rgba(var(--edge-ok-rgb),0.09)' : A(0.16),
                        border: `1px solid ${selected.resolved ? 'rgba(var(--edge-ok-rgb),0.26)' : A(0.5)}`,
                        color: selected.resolved ? 'var(--edge-ok)' : 'var(--edge-acc)',
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: selected.resolved ? 'var(--edge-ok)' : 'var(--edge-acc)',
                          boxShadow: `0 0 9px 1px ${selected.resolved ? 'rgba(var(--edge-ok-rgb),0.80)' : A(0.8)}`,
                        }}
                      />
                      {selected.resolved ? 'Розібрано' : 'Не розібрано'}
                    </span>
                  </div>

                  <div className="my-6 h-px" style={{ background: `linear-gradient(90deg, ${color}66, transparent 72%)` }} />

                  {reasons.length > 0 && (
                    <>
                      <Cap>Причини</Cap>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {reasons.map((id) => {
                          const rc = reasonColor(id);
                          return (
                            <span
                              key={id}
                              className="flex items-center gap-2 rounded-full px-4 py-[8px] text-[13.5px] font-semibold"
                              style={{ fontFamily: T.sans, background: `${rc}1c`, border: `1px solid ${rc}42`, color: `${rc}f2` }}
                            >
                              <span className="h-[5px] w-[5px] rounded-full" style={{ background: rc, boxShadow: `0 0 8px 1px ${rc}99` }} />
                              {reasonLabel(id)}
                            </span>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Розбір оформлений як цитата з журналу, а не як
                      поле форми: рамка з усіх боків робила з власного
                      висновку ще один інпут, який хочеться заповнити,
                      а не перечитати. */}
                  <div className="mt-6">
                    <Cap>Розбір</Cap>
                    <div
                      className="relative mt-3 overflow-hidden py-[18px] pl-6 pr-6"
                      style={{
                        borderRadius: '4px 16px 16px 4px',
                        background: `linear-gradient(100deg, ${color}17, ${color}08 34%, transparent 78%)`,
                      }}
                    >
                      <span
                        className="absolute inset-y-0 left-0 w-[2px] rounded-sm"
                        style={{ background: `linear-gradient(180deg, ${color}, ${color}1f)`, boxShadow: `0 0 14px 1px ${color}80` }}
                      />
                      <span
                        className="pointer-events-none absolute select-none"
                        style={{ right: 14, top: -14, fontFamily: T.display, fontSize: 88, fontWeight: 700, lineHeight: 1, color, opacity: 0.1 }}
                      >
                        ”
                      </span>

                      <p className="relative text-[16px]" style={{ fontFamily: T.sans, lineHeight: 1.68, color: 'var(--edge-text)' }}>
                        {selected.desc}
                      </p>

                      <div className="relative mt-3.5 flex items-center gap-2.5">
                        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${color}3d, transparent)` }} />
                        <span
                          className="whitespace-nowrap text-[11.5px] uppercase"
                          style={{ fontFamily: T.mono, letterSpacing: '1.6px', color: 'var(--edge-text3)' }}
                        >
                          мій висновок · {short}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Cap hint={shots.length > 1 ? `${shots.length} кадри` : 'скрін на момент входу'}>Графік</Cap>

                    {shots.length ? (
                      <div className="mt-3">
                        <ImageSlider images={shots} containerClassName="h-[280px] rounded-2xl" />
                      </div>
                    ) : (
                      <div
                        className="mt-3 flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
                        style={{ border: '1.5px dashed var(--edge-line)', background: 'rgba(var(--edge-hair-rgb),0.015)' }}
                      >
                        <span
                          className="grid h-10 w-10 flex-none place-items-center rounded-xl"
                          style={{ background: 'rgba(var(--edge-hair-rgb),0.04)', border: '1px solid var(--edge-line)', color: 'var(--edge-text2)' }}
                        >
                          <ImageIcon size={18} strokeWidth={1.7} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14.5px] font-semibold" style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}>
                            Скріна ще немає
                          </span>
                          <span className="mt-[3px] block text-[13px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>
                            Додати можна через редагування запису
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ---------- рейка ---------- */}
                <div className="flex min-w-0 flex-col gap-5 px-5 pb-5 pt-6" style={{ background: 'rgba(var(--edge-hair-rgb),0.02)' }}>
                  <button
                    onClick={() => onResolve(selected)}
                    onMouseEnter={() => setCtaHover(true)}
                    onMouseLeave={() => setCtaHover(false)}
                    className="flex h-12 items-center justify-center gap-2.5 rounded-[13px] text-[14.5px] font-bold"
                    style={selected.resolved
                      ? { fontFamily: T.sans, background: 'rgba(var(--edge-ok-rgb),0.09)', border: '1px solid rgba(var(--edge-ok-rgb),0.30)', color: 'var(--edge-ok)', transition: 'all .2s' }
                      : {
                        fontFamily: T.sans,
                        background: `linear-gradient(180deg, ${ctaHover ? 'var(--edge-ok), var(--edge-ok)' : 'var(--edge-ok), var(--edge-ok)'})`,
                        border: '1px solid transparent',
                        color: 'var(--edge-sunken)',
                        boxShadow: ctaHover
                          ? '0 16px 36px -14px rgba(var(--edge-ok-rgb),0.80), inset 0 1px 0 rgba(var(--edge-hair-rgb),0.35)'
                          : '0 10px 26px -14px rgba(var(--edge-ok-rgb),0.60), inset 0 1px 0 rgba(var(--edge-hair-rgb),0.24)',
                        transform: `translateY(${ctaHover ? '-2px' : '0'})`,
                        transition: 'all .2s',
                      }}
                  >
                    {selected.resolved ? <Check size={15} strokeWidth={2.4} /> : <Clock size={15} strokeWidth={2} />}
                    {selected.resolved ? 'Розібрано' : 'Позначити розібраною'}
                  </button>

                  <div>
                    <Cap>Про запис</Cap>
                    <div className="mt-2.5 flex flex-col gap-px">
                      {facts.map(([k, v], i) => (
                        <div
                          key={k}
                          className="flex items-center justify-between gap-2.5 rounded-[9px] px-2.5 py-2"
                          style={{ background: i % 2 ? 'transparent' : 'rgba(var(--edge-hair-rgb),0.02)' }}
                        >
                          <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>{k}</span>
                          <span className="flex-none text-[13px]" style={{ fontFamily: T.mono, color: 'var(--edge-text)' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {stats && (
                    <div>
                      <Cap>Ця категорія</Cap>
                      <div
                        className="relative mt-2.5 overflow-hidden rounded-[15px] px-4 py-4"
                        style={{ background: `linear-gradient(165deg, ${catColor}14, var(--edge-sunken))`, border: `1px solid ${catColor}3d` }}
                      >
                        <span
                          className="pointer-events-none absolute rounded-full"
                          style={{ right: -40, top: -50, width: 160, height: 130, background: catColor, filter: 'blur(48px)', opacity: 0.16 }}
                        />

                        <div className="relative flex items-baseline gap-2">
                          <span style={{ fontFamily: T.display, fontSize: 34, fontWeight: 700, letterSpacing: '-1.4px', lineHeight: 1, color: catColor }}>
                            {stats.count}
                          </span>
                          <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text2)' }}>
                            {stats.count === 1 ? 'запис' : stats.count < 5 ? 'записи' : 'записів'}
                          </span>
                        </div>

                        <div className="relative mt-3 h-1 overflow-hidden rounded-full" style={{ background: 'var(--edge-line)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(4, stats.pct)}%`,
                              background: `linear-gradient(90deg, ${catColor}5e, ${catColor})`,
                              boxShadow: `0 0 12px ${catColor}66`,
                            }}
                          />
                        </div>

                        <p className="relative mt-2.5 text-[13.5px]" style={{ fontFamily: T.sans, lineHeight: 1.5, color: 'var(--edge-text2)' }}>
                          {stats.pct}% усіх твоїх записів у журналі.
                          {stats.count > 2 ? ' Це вже система, а не випадковість.' : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-auto">
                    <Cap>Далі</Cap>
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      <ActionRow
                        icon={ListChecks}
                        label="Створити правило"
                        hint="Перетворити висновок у пункт передторгового чеклиста"
                        onClick={() => setRuleOpen(true)}
                      />
                      {onSimilar && (
                        <ActionRow
                          icon={Filter}
                          label="Схожі помилки"
                          hint="Показати всі записи цієї категорії"
                          onClick={() => onSimilar(cat?.id)}
                        />
                      )}
                      <ActionRow
                        icon={Copy}
                        label="Копіювати розбір"
                        hint="Скопіювати текст"
                        onClick={copyAll}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------- підвал ---------- */}
              <div
                className="flex flex-none flex-wrap items-center justify-between gap-4 py-3 pl-[22px] pr-[18px]"
                style={{ borderTop: '1px solid var(--edge-line)', background: 'var(--edge-sunken)' }}
              >
                <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>
                  {selected.resolved ? 'Розбір закритий — запис більше не в черзі' : 'Запис у черзі на розбір'}
                </span>

                {(onPrev || onNext) && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onPrev}
                      disabled={!onPrev}
                      title="Попередня помилка"
                      className="flex h-9 items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold"
                      style={{
                        fontFamily: T.sans, background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)',
                        color: onPrev ? 'var(--edge-text)' : 'var(--edge-text4)', opacity: onPrev ? 1 : 0.5, transition: 'all .16s',
                      }}
                    >
                      <ChevronLeft size={13} strokeWidth={2} />
                      Назад
                    </button>
                    <button
                      onClick={onNext}
                      disabled={!onNext}
                      title="Наступна помилка"
                      className="flex h-9 items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold"
                      style={{
                        fontFamily: T.sans, background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)',
                        color: onNext ? 'var(--edge-text)' : 'var(--edge-text4)', opacity: onNext ? 1 : 0.5, transition: 'all .16s',
                      }}
                    >
                      Далі
                      <ChevronRight size={13} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          <RuleFromErrorModal
            isOpen={ruleOpen}
            onClose={() => setRuleOpen(false)}
            entry={selected}
            color={color}
          />
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
