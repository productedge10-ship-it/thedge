import { useEffect, useState } from 'react';
import { List, Type, X } from 'lucide-react';
import {
  READER_THEMES, FONT_SIZES, FAMILIES, WIDTHS, LEADINGS,
} from '../../lib/blogReader';
import { Seg } from './BlogChrome';

/* ==================================================================
   БЛОГ — інструменти читання.

   Зміст живе на самій сторінці, окремою колонкою ліворуч від тексту:
   так він видно постійно й видно, де ти зараз, без жодного кліку.
   Плаваюче віконце змісту лишилось тільки для вузьких екранів, де
   для колонки просто немає місця, — і ховається чистим CSS, а не
   умовою в JS, щоб при зміні ширини вікна нічого не перемонтовувалось.

   Налаштування читання лишаються віконцем: їх відкривають двічі за
   статтю, і постійна панель заради цього з'їдала б місце в тексті.

   Смуга прогресу тонка й без цифр: вона відповідає на питання
   «скільки ще», а не «на скільки відсотків я молодець».
================================================================== */

const SWATCH = { dark: '#0e0e14', light: '#faf5ff', book: '#ede6d9' };

/* ------------------------------------------------------------------
   Активний заголовок.

   Через offsetTop, а не IntersectionObserver: спостерігач каже
   «заголовок у полі зору», а треба інше — «останній заголовок, який
   ми проминули». Різниця помітна на довгих розділах, де в екрані
   немає жодного заголовка й підсвітка гасла б повністю.

   96 — висота липкого хедера плюс повітря: заголовок, що тільки-но
   підліз під хедер, уже вважається пройденим.
------------------------------------------------------------------ */
export function useActiveHeading(headings) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!headings.length) return undefined;
    const onScroll = () => {
      let current = headings[0].id;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= 96) current = h.id;
      }
      setActive(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [headings]);

  return active;
}

function useReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setPct(h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return pct;
}

/* Плавний перехід до розділу з оновленням адреси: посилання на
   конкретний розділ статті має копіюватись із рядка браузера. */
const goTo = (e, id) => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.history.replaceState(null, '', `#${id}`);
};

function TocLinks({ headings, active, onPick }) {
  return (
    <nav className="bl-toc">
      {headings.map((h) => (
        <a
          key={h.id}
          href={`#${h.id}`}
          onClick={(e) => { goTo(e, h.id); onPick?.(); }}
          className={`${h.level === 3 ? 'lvl3' : ''}${h.id === active ? ' is-on' : ''}`}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}

const L = {
  uk: { toc: 'Зміст', reading: 'Читання', theme: 'Тема', size: 'Розмір', family: 'Шрифт', width: 'Ширина', leading: 'Інтервал', reset: 'Скинути до типових' },
  ru: { toc: 'Содержание', reading: 'Чтение', theme: 'Тема', size: 'Размер', family: 'Шрифт', width: 'Ширина', leading: 'Интервал', reset: 'Сбросить' },
  en: { toc: 'Contents', reading: 'Reading', theme: 'Theme', size: 'Size', family: 'Font', width: 'Width', leading: 'Spacing', reset: 'Reset' },
};

/* Колонка змісту на сторінці. */
export function SideToc({ headings, active, lang = 'uk' }) {
  if (headings.length < 2) return null;
  const t = L[lang] || L.uk;
  return (
    <aside className="bl-toc-side">
      <h2 className="bl-toc-h">{t.toc}</h2>
      <TocLinks headings={headings} active={active} />
    </aside>
  );
}

export default function ReadingTools({ headings = [], active, prefs, setPref, reset, lang = 'uk' }) {
  const [open, setOpen] = useState(null); /* null | 'toc' | 'reader' */
  const pct = useReadingProgress();
  const t = L[lang] || L.uk;

  /* Escape закриває віконце: воно перекриває текст, і людина, яка
     хоче читати далі, тягнеться саме до цієї клавіші. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const row = (label, items, value, onPick) => (
    <div className="bl-row">
      <div className="bl-row-t">{label}</div>
      <Seg items={items} value={value} onPick={onPick} label={label} />
    </div>
  );

  return (
    <>
      <div className="bl-progress" style={{ width: `${(pct * 100).toFixed(2)}%` }} />

      <div className="bl-fabs">
        {headings.length > 1 && (
          <button
            type="button"
            className={`bl-fab bl-fab-toc${open === 'toc' ? ' is-on' : ''}`}
            onClick={() => setOpen(open === 'toc' ? null : 'toc')}
            title={t.toc}
            aria-label={t.toc}
          >
            <List size={19} />
          </button>
        )}
        <button
          type="button"
          className={open === 'reader' ? 'bl-fab is-on' : 'bl-fab'}
          onClick={() => setOpen(open === 'reader' ? null : 'reader')}
          title={t.reading}
          aria-label={t.reading}
        >
          <Type size={19} />
        </button>
      </div>

      {open === 'toc' && (
        <div className="bl-panel" role="dialog" aria-label={t.toc}>
          <div className="bl-panel-h">
            <span>{t.toc}</span>
            <button type="button" className="bl-panel-x" onClick={() => setOpen(null)}><X size={15} /></button>
          </div>
          <TocLinks headings={headings} active={active} onPick={() => setOpen(null)} />
        </div>
      )}

      {open === 'reader' && (
        <div className="bl-panel" role="dialog" aria-label={t.reading}>
          <div className="bl-panel-h">
            <span>{t.reading}</span>
            <button type="button" className="bl-panel-x" onClick={() => setOpen(null)}><X size={15} /></button>
          </div>

          {row(
            t.theme,
            READER_THEMES.map((th) => ({
              id: th.id,
              title: th.label[lang] || th.label.uk,
              node: (
                <>
                  <span className="bl-sw" style={{ background: SWATCH[th.id] }} />
                  {th.label[lang] || th.label.uk}
                </>
              ),
            })),
            prefs.theme,
            (v) => setPref('theme', v),
          )}

          {row(
            t.size,
            FONT_SIZES.map((s, i) => ({ id: s.id, title: `${s.px}px`, node: <span className={`bl-a${i + 1}`}>A</span> })),
            prefs.size,
            (v) => setPref('size', v),
          )}

          {row(
            t.family,
            FAMILIES.map((f) => ({
              id: f.id,
              title: f.label[lang] || f.label.uk,
              node: (
                <span style={f.id === 'serif' ? { fontFamily: "'Literata',Georgia,serif" } : undefined}>
                  {f.label[lang] || f.label.uk}
                </span>
              ),
            })),
            prefs.family,
            (v) => setPref('family', v),
          )}

          {row(
            t.width,
            WIDTHS.map((w) => ({ id: w.id, title: `${w.px}px`, node: w.label[lang] || w.label.uk })),
            prefs.width,
            (v) => setPref('width', v),
          )}

          {row(
            t.leading,
            LEADINGS.map((l) => ({ id: l.id, title: String(l.value), node: l.label[lang] || l.label.uk })),
            prefs.leading,
            (v) => setPref('leading', v),
          )}

          <button type="button" className="bl-btn bl-btn--ghost bl-btn--wide" style={{ marginTop: 14 }} onClick={reset}>
            {t.reset}
          </button>
        </div>
      )}
    </>
  );
}
