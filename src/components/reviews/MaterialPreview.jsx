import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Check, Plus } from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import ImageSlider from '../ui/ImageSlider';
import { MISTAKE_TYPES, fmtDate, fmtR, rOf } from '../../lib/reviewsData';

/* ==================================================================
   Картка матеріалу зблизька.

   У списку рядок показує рівно стільки, скільки треба, щоб упізнати
   угоду. Але вирішити «беру це в розбір чи ні» по одному рядку часто
   не виходить — треба перечитати нотатку цілком.

   Тому окреме вікно: факти таблицею згори, текст нижче, і одна
   кнопка, яка додає або прибирає матеріал, не змушуючи повертатись
   до списку й шукати той самий рядок очима.

   Через портал у body — з тієї ж причини, що й читалка розбору:
   всередині <main> лежить власний контекст накладання.
================================================================== */

const SEVERITY = { high: 'висока', mid: 'середня', low: 'низька' };

/* Ті самі підписи й кольори, що в таблиці журналу та в картці угоди:
   Take / Stop / BE. WIN/LOSS — це внутрішнє представлення в базі, і
   показувати його людині означало б завести четверту назву для того
   самого стану. */
const RESULT = {
  WIN: { label: 'Take', tone: T.ok },
  LOSS: { label: 'Stop', tone: T.bad },
  BE: { label: 'BE', tone: T.warn },
};

/* Психологія в журналі — чотири прапорці. Перекладаємо в підписи й
   показуємо лише підняті: список із чотирьох «ні» нічого не додає. */
const PSY = [
  { key: 'confident', label: 'Був упевнений', good: true },
  { key: 'fear', label: 'Був страх', good: false },
  { key: 'repeat', label: 'Повторив би', good: true },
  { key: 'revenge', label: 'Відігравався', good: false },
];

/* «09:30:00» → «09:30». Секунди в журналі ніхто не вводить руками,
   вони просто приїжджають із типу time. */
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

/* «За планом» — це так або ні, і галочка читається швидше за слово. */
function YesNo({ yes }) {
  const c = yes ? T.ok : T.bad;
  return (
    <span
      className="grid place-items-center"
      style={{
        width: 24, height: 24, borderRadius: 7,
        background: `${c}1c`, border: `1px solid ${c}55`, color: c,
      }}
    >
      {yes ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
    </span>
  );
}

const KIND = {
  trades: 'Угода',
  plans: 'План',
  mistakes: 'Помилка',
};

/* Рядок фактів. Підпис моноширинним і в розрядку — так само, як
   підписи цифр у решті розборів. */
function Fact({ label, value, tone }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ padding: '13px 0', borderTop: `1px solid ${T.line}` }}>
      <div
        className="uppercase"
        style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: '1.6px', color: T.text3 }}
      >
        {label}
      </div>
      <div
        style={{ fontFamily: T.sans, marginTop: 6, fontSize: 14.5, fontWeight: 500, color: tone || T.text }}
      >
        {value}
      </div>
    </div>
  );
}

/* Абзац із підписом. Таких блоків у вікні кілька, і всі однакові. */
function Text({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <div
        className="uppercase"
        style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: '1.6px', color: T.text3 }}
      >
        {label}
      </div>
      <p
        className="whitespace-pre-wrap"
        style={{ fontFamily: T.sans, marginTop: 10, fontSize: 14.5, lineHeight: '25px', color: T.text2 }}
      >
        {value}
      </p>
    </div>
  );
}

/* Скріни сетапу.

   Раніше це були посилання з target="_blank": клік або нічого не
   робив, або викидав людину з розбору в чисту вкладку з картинкою.
   Тепер той самий ImageSlider, що в картці угоди, — стрілки, лупа й
   фулскрін просто на місці, не покидаючи сторінку. */
function Shots({ images }) {
  if (!images?.length) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <div
        className="uppercase"
        style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: '1.6px', color: T.text3 }}
      >
        {images.length === 1 ? 'Скрін' : `Скріни · ${images.length}`}
      </div>
      <div style={{ marginTop: 10 }}>
        <ImageSlider images={images} containerClassName="h-[240px] w-full" />
      </div>
    </div>
  );
}

export default function MaterialPreview({ kind, item, selected, onToggle, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (!item) return null;

  let title = item.pair;
  let facts = [];
  let texts = [];
  let accent = T.acc;
  let flags = [];

  if (kind === 'trades') {
    const r = rOf(item);
    const long = item.type === 'LONG';
    const res = RESULT[item.result] || { label: item.result, tone: T.text };
    accent = r > 0 ? T.ok : r < 0 ? T.bad : T.text2;

    /* Час тримання рахуємо тут, а не показуємо два окремі поля: сам
       по собі «вихід о 12:40» не каже нічого, а «45 хв у позиції» —
       каже. Вхід лишаємо, бо він прив'язує угоду до сесії. */
    const held = (() => {
      const a1 = hhmm(item.entryTime);
      const b1 = hhmm(item.exitTime);
      if (!a1 || !b1) return '';
      const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const diff = (m(b1) - m(a1) + 1440) % 1440;
      if (!diff) return '';
      const h = Math.floor(diff / 60);
      return h ? `${h} год ${diff % 60} хв` : `${diff} хв`;
    })();

    facts = [
      { label: 'Дата', value: fmtDate(item.date) },
      { label: 'Сесія', value: item.session },
      /* Лонг зелений, шорт червоний — так само, як напрям читається
         на самому графіку. */
      { label: 'Напрям', value: item.type, tone: long ? T.ok : T.bad },
      { label: 'Результат', value: res.label, tone: res.tone },
      { label: 'R', value: fmtR(r), tone: accent },
      { label: 'Ризик', value: Number.isFinite(item.risk) ? `${item.risk}%` : '' },
      { label: 'Сетап', value: item.setup },
      { label: 'Рахунок', value: item.account },
      { label: 'Вхід', value: hhmm(item.entryTime) },
      { label: 'У позиції', value: held },
      { label: 'За планом', value: <YesNo yes={item.followedPlan} /> },
      /* Тут галочка була б двозначною: хрестик усюди читається як
         «ні», а поспіх у нас навпаки — «так, був». Лишаємо словом. */
      item.rushed ? { label: 'Поспіх', value: 'був', tone: T.warn } : null,
    ].filter(Boolean);

    flags = PSY.filter((f) => item.psy?.[f.key]);
    texts = [{ label: 'Нотатка', value: item.note }];
  } else if (kind === 'plans') {
    const done = item.status === 'Розібрано' || item.status === 'Відпрацьовано';
    accent = done ? T.ok : T.warn;
    facts = [
      { label: 'Дата', value: fmtDate(item.date) },
      { label: 'Настрій', value: item.narrative },
      { label: 'Насправді', value: item.actualNarrative },
      { label: 'Категорія', value: item.category },
      { label: 'Стан', value: item.status, tone: accent },
      { label: 'Оцінка', value: item.rating ? `${item.rating} / 5` : '' },
    ];
    texts = [
      { label: 'План', value: item.text },
      /* Висновки показуємо окремо й лише якщо це не той самий текст:
         у старих записах план і висновки писали в одне поле. */
      { label: 'Висновки', value: item.conclusions === item.text ? '' : item.conclusions },
      { label: 'Помилка аналізу', value: item.analysisMistake },
    ];
  } else {
    const meta = MISTAKE_TYPES[item.type] || { label: item.type };
    title = meta.label;
    accent = T.warn;
    facts = [
      { label: 'Дата', value: fmtDate(item.date) },
      { label: 'Інструмент', value: item.pair },
      { label: 'Сесія', value: item.session },
      { label: 'Вагомість', value: SEVERITY[item.severity] || item.severity },
      {
        label: 'Ціна',
        value: item.cost ? fmtR(item.cost) : '—',
        tone: item.cost < 0 ? T.bad : T.text3,
      },
      { label: 'За планом', value: <YesNo yes={item.followedPlan} /> },
    ];
    texts = [
      /* Підказка з довідника краща за порожнє місце: у журналі опис
         помилки часто лишають незаповненим. */
      { label: 'Що сталось', value: item.description || meta.hint || '' },
      { label: 'Нотатка до угоди', value: item.note },
    ];
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[240] flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'rgba(8,8,11,0.74)', backdropFilter: 'blur(8px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.99 }}
        transition={{ duration: 0.26, ease: EASE }}
        className="flex max-h-full w-full flex-col overflow-hidden"
        style={{
          maxWidth: 480,
          borderRadius: 18,
          background: T.surface,
          border: `1px solid ${T.line}`,
          boxShadow: '0 40px 100px -34px rgba(0,0,0,0.92)',
        }}
      >
        {/* шапка */}
        <div
          className="flex shrink-0 items-start justify-between"
          style={{ gap: 16, padding: '20px 20px 18px', borderBottom: `1px solid ${T.line}`, background: T.surfaceHi }}
        >
          <div className="min-w-0">
            <div
              className="uppercase"
              style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: '2.2px', color: accent }}
            >
              {KIND[kind]}
            </div>
            <div
              className="truncate"
              style={{
                fontFamily: T.display, marginTop: 7, fontSize: 20,
                fontWeight: 600, letterSpacing: '-0.3px', color: T.text,
              }}
            >
              {title}
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Закрити"
            className="grid shrink-0 place-items-center"
            style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.line}`, color: T.text2, transition: 'all .18s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto" style={{ padding: '6px 20px 20px' }}>
          <div className="grid grid-cols-2" style={{ columnGap: 20 }}>
            {facts.map((f) => <Fact key={f.label} {...f} />)}
          </div>

          {flags.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div
                className="uppercase"
                style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: '1.6px', color: T.text3 }}
              >
                Стан
              </div>
              <div className="flex flex-wrap" style={{ marginTop: 10, gap: 8 }}>
                {flags.map((f) => {
                  const c = f.good ? T.ok : T.warn;
                  return (
                    <span
                      key={f.key}
                      style={{
                        fontFamily: T.sans, padding: '6px 12px', borderRadius: 9,
                        fontSize: 13, fontWeight: 500,
                        background: `${c}1c`, border: `1px solid ${c}55`, color: c,
                      }}
                    >
                      {f.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {texts.map((t) => <Text key={t.label} {...t} />)}

          <Shots images={item.images} />
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={() => { onToggle(); onClose(); }}
            className="flex w-full items-center justify-center"
            style={{
              fontFamily: T.sans, gap: 8, height: 46, borderRadius: 13,
              fontSize: 14, fontWeight: 600, transition: 'all .18s',
              background: selected ? 'transparent' : `rgba(${T.accRgb},0.14)`,
              border: `1px solid ${selected ? T.line : T.lineAcc}`,
              color: selected ? T.text3 : T.acc,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = selected ? T.lineHi : T.acc;
              if (selected) e.currentTarget.style.color = T.text2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = selected ? T.line : T.lineAcc;
              if (selected) e.currentTarget.style.color = T.text2;
            }}
          >
            {selected
              ? <><X size={15} strokeWidth={2.4} /> Прибрати з розбору</>
              : <><Plus size={15} strokeWidth={2.6} /> Додати в розбір</>}
          </button>

          {selected && (
            <p
              className="flex items-center justify-center"
              style={{ fontFamily: T.sans, gap: 6, marginTop: 10, fontSize: 12.5, color: T.ok }}
            >
              <Check size={12} strokeWidth={3} /> вже в розборі
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
