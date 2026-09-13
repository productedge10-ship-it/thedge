import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ImageSlider from '../ui/ImageSlider';
import { resolveSrc } from '../../lib/blogImages';
import { BlogCat, EdgeWordmark } from './BlogLogo';

/* ==================================================================
   БЛОГ — оболонка й стилі.

   Тут навмисно CSS у теґу style, а не інлайнові стилі, якими набраний
   лендінг. Причина проста: стаття — це багато однотипного тексту з
   ховерами, медіазапитами й трьома темами. Інлайн такого не вміє:
   ховер довелося б тримати станом у кожному посиланні, а зміну теми —
   прокидати пропсом у кожен абзац.

   Тому теми тут — набір CSS-змінних на корені блогу (див.
   lib/blogReader.js), а вся розмітка описана класами bl-*. Один
   перемикач теми перефарбовує сторінку цілком, включно з тим, до
   чого інлайн не дотягується: маркерами списків, рамками таблиці,
   виділенням тексту.

   Кнопки повторюють ті, що вже стоять на нотатках, аналітиці,
   розборах і бектестах: висота 42, радіус 12, жирний чотирнадцятий
   кегль, рамка в акценті й ледь помітне тло, яке світлішає на
   ховері. Різниця лише в тому, що кольори взяті зі змінних теми
   блогу, — інакше в книжковій темі кнопка лишилась би чорною.

   Префікс bl- на кожному класі, бо в проєкті є Tailwind, і клас
   виду .card рано чи пізно перетнувся б із чужим.
================================================================== */

export const blogPath = (lang, rest = '') => `/${lang}/blog${rest}`;

const MONTHS = {
  uk: ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/* Дата словами, а не 08.09.2026: у стрічці статей цифри читаються
   як номер версії, а не як «позавчора». */
export const fmtDate = (iso, lang = 'uk') => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const months = MONTHS[lang] || MONTHS.uk;
  if (lang === 'en') return `${months[m - 1]} ${d}, ${y}`;
  return `${d} ${months[m - 1]} ${y}`;
};

export const MIN_WORD = {
  uk: (n) => `${n} хв читання`,
  ru: (n) => `${n} мин чтения`,
  en: (n) => `${n} min read`,
};

/* ------------------------------------------------------------------
   Тло сторінки.

   Глобальний body у проєкті прибитий до #111 — це правильно для
   застосунку, який завжди темний, і неправильно для блогу, який
   вміє бути паперовим. Тому блог на час свого життя підмінює тло
   й повертає його назад, коли людина йде в застосунок.

   Разом із тлом ставимо плавний перехід: без нього перемикання теми
   виглядає як блимання лампи, а має — як зміна освітлення.
------------------------------------------------------------------ */
export function useBlogBackground(bg) {
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevTr = document.body.style.transition;
    document.body.style.transition = 'background-color .32s ease';
    document.body.style.backgroundColor = bg;
    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.transition = prevTr;
    };
  }, [bg]);
}

/* ------------------------------------------------------------------
   Обкладинка.

   Поки що заглушка: не порожній прямокутник, а слот, який чесно
   каже, що тут має бути намальовано. Так у сітці видно ритм
   майбутніх картинок, а не сірі дірки.

   Коли з'являться справжні SVG, у даних статті замість tone/hint
   з'явиться src — і компонент намалює картинку, не змінюючи нічого
   навколо.
------------------------------------------------------------------ */
export function Cover({ cover, title, big = false, zoomable = false, vars }) {
  /* Обкладинка статті клікабельна: той самий перегляд, що в журналі
     угод — лупа, фулскрін, стрілки. У картці списку зуму немає
     навмисно: там картинка веде в статтю, а не в себе. */
  if (zoomable) {
    return (
      <div className={big ? 'bl-cover bl-cover--big' : 'bl-cover'}>
        <ImageSlider
          images={[resolveSrc(cover?.src, { tone: cover?.tone, hint: cover?.hint, vars })]}
          containerClassName="h-full w-full"
        />
      </div>
    );
  }
  if (cover?.src) {
    return (
      <div className={big ? 'bl-cover bl-cover--big' : 'bl-cover'}>
        <img src={cover.src} alt={title} loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className={big ? 'bl-cover bl-cover--big bl-cover--ph' : 'bl-cover bl-cover--ph'}
      data-tone={cover?.tone || 'violet'}
      aria-hidden
    >
      <span className="bl-cover-grid" />
      <span className="bl-cover-hint">{cover?.hint || 'ілюстрація'}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Перемикач у стилі застосунку.

   Рівно та сама конструкція, що перемикач періоду на аналітиці:
   заглиблена доріжка з рамкою, всередині кнопки, активна підсвічена
   акцентом. Використовується і для теми, і для мови, і у віконці
   налаштувань читання — щоб на сайті був один спосіб вибирати з
   кількох варіантів, а не три різні.
------------------------------------------------------------------ */
export function Seg({ items, value, onPick, label }) {
  return (
    <div className="bl-seg" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={it.id === value ? 'is-on' : ''}
          onClick={() => onPick(it.id)}
          title={it.title}
          aria-label={it.title}
        >
          {it.node}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   Хедер блогу.

   Замість набраного напису — сам логотип: векторна версія, залита
   currentColor, тому в темній темі вона біла, а в книжковій темніє
   разом із текстом. Поруч живий кіт без рамки.

   Слова «Блог» у хедері немає навмисно. Воно вже стоїть у заголовку
   сторінки й у хлібних крихтах, а втретє — це коли одне слово
   дивиться на людину з трьох місць одночасно.
------------------------------------------------------------------ */
export function BlogHeader({ lang, children, nav = true }) {
  return (
    <header className="bl-head">
      <div className="bl-head-in">
        <Link to={blogPath(lang)} className="bl-brand" aria-label="The Edge">
          <BlogCat size={42} />
          <EdgeWordmark height={36} className="bl-word" />
        </Link>

        {nav && (
          <nav className="bl-head-nav">
            <Link to={blogPath(lang)}>Усі статті</Link>
            <a href="/#product">Продукт</a>
            <a href="/#pricing">Ціни</a>
          </nav>
        )}

        <div className="bl-head-right">
          {children}
          <a className="bl-btn bl-btn--head" href="/auth">Почати безкоштовно</a>
        </div>
      </div>
    </header>
  );
}

export function BlogFooter({ lang }) {
  return (
    <footer className="bl-foot">
      <div className="bl-foot-in">
        <div>
          <span className="bl-brand" style={{ marginBottom: 12 }}>
            <BlogCat size={40} />
            <EdgeWordmark height={32} className="bl-word" />
          </span>
          <p className="bl-foot-note">
            Журнал трейдера: план, угоди, аналітика й розбори в одному місці.
          </p>
        </div>
        <nav className="bl-foot-links">
          <Link to={blogPath(lang)}>Усі статті</Link>
          <a href="/">Продукт</a>
          <a href="/#pricing">Ціни</a>
          <a href="/auth">Вхід</a>
        </nav>
      </div>
      <div className="bl-foot-bottom">© {new Date().getFullYear()} The Edge</div>
    </footer>
  );
}

/* Хлібні крихти. Окремим компонентом, бо вони є і в розділі, і в
   статті, і в тегах — з різною глибиною. На корені блогу їх немає:
   там вони складались би з одного слова, яке й так стоїть поруч у
   заголовку. */
export function Crumbs({ items }) {
  return (
    <nav className="bl-crumbs">
      {items.map((it, idx) => (
        <span key={it.to || it.label}>
          {idx > 0 && <span className="bl-crumb-sep">›</span>}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* ==================================================================
   Стилі.
================================================================== */
export const BLOG_CSS = `
/* Ширина сторінки — 80% вікна. Не «на весь монітор»: рядок на 1900
   пікселів око не тримає, воно губить початок наступного. І не
   фіксовані 1200: на великому екрані сайт починає виглядати як
   вставлений у рамку. Одне значення тут, усі смуги нижче беруть
   його звідси. */
.bl-root{
  --bl-shell:min(80%,1720px);
  min-height:100vh;
  background:var(--bl-bg);
  color:var(--bl-text);
  font-family:var(--edge-sans,'Roboto',system-ui,sans-serif);
  -webkit-font-smoothing:antialiased;
}
.bl-root *{box-sizing:border-box}
.bl-root a{color:inherit;text-decoration:none}
.bl-root ::selection{background:var(--bl-mark)}

/* Перемикання теми як зміна освітлення, а не як блимання лампи.
   Перелік властивостей, а не all: інакше в анімацію потрапляє ще й
   ширина смуги прогресу, і вона починає відставати від скролу. */
.bl-root,.bl-head,.bl-card,.bl-side-box,.bl-rail-box,.bl-promo,.bl-panel,
.bl-tag,.bl-foot,.bl-callout,.bl-tablewrap,.bl-fab,.bl-btn,.bl-seg,
.bl-prose,.bl-search input,.bl-cover,.bl-toc-side{
  transition:background-color .32s ease,border-color .32s ease,color .32s ease,box-shadow .32s ease;
}

@keyframes blUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes blFade{from{opacity:0}to{opacity:1}}
@keyframes blPop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
@keyframes blBar{from{transform:scaleY(0)}to{transform:scaleY(1)}}

/* ---------- хедер ---------- */
.bl-head{
  position:sticky;top:0;z-index:50;
  background:var(--bl-scrim);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-bottom:1px solid var(--bl-line);
}
.bl-head-in{
  width:var(--bl-shell);margin:0 auto;height:66px;
  display:flex;align-items:center;gap:26px;
}
.bl-brand{display:inline-flex;align-items:center;gap:10px;flex:none}
.bl-word{color:var(--bl-text);transition:color .32s ease,transform .3s cubic-bezier(.22,.61,.36,1),filter .3s}
.bl-brand:hover .bl-word{transform:translateY(-1px);filter:drop-shadow(0 0 12px var(--bl-acc-line))}
/* «THE» над знаком з'являється трохи пізніше за самі літери —
   логотип не просто виникає, а збирається. */
.bl-logo-the{animation:blFade .7s .25s backwards}

/* Кіт із сайдбара живе тут без своєї рамки: у застосунку вона
   відділяє його від панелі, а в хедері поруч із логотипом два
   прямокутники підряд читаються як помилка верстки. Рамку малює сам
   компонент інлайном, тому знімається вона тільки так. */
.bl-cat>span>div{background:none !important;border:0 !important;box-shadow:none !important}
.bl-cat [class*="inset-0"][class*="rounded-[15px]"]{background:none !important}

.bl-head-nav{display:flex;align-items:center;gap:24px;font-size:14.5px;color:var(--bl-text3)}
.bl-head-nav a{position:relative;padding:4px 0;transition:color .18s}
.bl-head-nav a::after{
  content:'';position:absolute;left:0;right:0;bottom:0;height:1px;
  background:var(--bl-acc);transform:scaleX(0);transform-origin:left;
  transition:transform .26s cubic-bezier(.22,.61,.36,1);
}
.bl-head-nav a:hover{color:var(--bl-text)}
.bl-head-nav a:hover::after{transform:scaleX(1)}
.bl-head-right{display:flex;align-items:center;gap:12px;margin-left:auto}

/* ---------- кнопки: словник із нотаток, аналітики, розборів ---------- */
.bl-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  height:42px;padding:0 20px;border-radius:12px;
  font:inherit;font-size:14px;font-weight:700;white-space:nowrap;cursor:pointer;
  background:var(--bl-btn-bg);
  border:1px solid var(--bl-acc-line-hi);
  color:var(--bl-text);
  transition:background-color .2s ease,border-color .2s ease,transform .18s ease;
}
.bl-btn:hover{background:var(--bl-btn-bg-hi);border-color:var(--bl-acc)}
.bl-btn:active{transform:scale(.98)}
.bl-btn--head{height:38px;padding:0 16px;font-size:13.5px}
.bl-btn--solid{background:var(--bl-acc);border-color:var(--bl-acc);color:var(--bl-on-acc)}
.bl-btn--solid:hover{background:var(--bl-acc);filter:brightness(1.08)}
.bl-btn--soft{
  background:var(--bl-acc-soft);border-color:var(--bl-acc-line);color:var(--bl-acc-text);
}
.bl-btn--soft:hover{background:var(--bl-acc-soft);border-color:var(--bl-acc)}
.bl-btn--ghost{background:transparent;border-color:var(--bl-line);color:var(--bl-text3);font-weight:500}
.bl-btn--ghost:hover{color:var(--bl-text);border-color:var(--bl-acc-line);background:transparent}
.bl-btn--wide{width:100%}

/* ---------- перемикач (аналітика: період) ---------- */
.bl-seg{
  display:inline-flex;align-items:center;gap:4px;padding:4px;border-radius:10px;
  background:var(--bl-bg2);border:1px solid var(--bl-line);
}
.bl-seg button{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  border:1px solid transparent;background:transparent;cursor:pointer;font:inherit;
  font-size:12.5px;color:var(--bl-text3);padding:5px 11px;border-radius:8px;
  transition:background-color .18s,color .18s,border-color .18s,transform .18s;
}
.bl-seg button:hover{color:var(--bl-text)}
.bl-seg button:active{transform:scale(.96)}
.bl-seg button.is-on{background:var(--bl-acc-soft);border-color:var(--bl-acc-line);color:var(--bl-text);font-weight:600}
.bl-sw{width:13px;height:13px;border-radius:4px;border:1px solid var(--bl-line);display:block;flex:none}

/* ---------- каркас ---------- */
.bl-wrap{width:var(--bl-shell);margin:0 auto;padding:30px 0 64px}
.bl-cols{display:grid;grid-template-columns:246px minmax(0,1fr) 292px;gap:34px;align-items:start}
.bl-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;color:var(--bl-text3);margin-bottom:16px}
.bl-crumbs a{color:var(--bl-acc-text);transition:opacity .18s}
.bl-crumbs a:hover{opacity:.75;text-decoration:underline}
.bl-crumb-sep{margin:0 6px;color:var(--bl-text4)}

.bl-h1{
  font-size:clamp(30px,3.4vw,46px);line-height:1.05;letter-spacing:-1.5px;
  font-weight:700;margin:0 0 12px;text-wrap:balance;
  animation:blUp .5s cubic-bezier(.22,.61,.36,1) backwards;
}
.bl-lede{
  font-size:17px;line-height:1.55;color:var(--bl-text2);margin:0 0 26px;max-width:760px;
  animation:blUp .5s .06s cubic-bezier(.22,.61,.36,1) backwards;
}

/* ---------- ліве меню розділів ---------- */
.bl-side{position:sticky;top:92px}
.bl-side-box{background:var(--bl-surface);border:1px solid var(--bl-line);border-radius:16px;padding:8px;box-shadow:var(--bl-shadow)}
.bl-side-title{
  font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--bl-text4);
  padding:10px 12px 8px;font-weight:700;
}
.bl-side-item{
  position:relative;display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:9px 12px;border-radius:10px;font-size:14px;color:var(--bl-text2);
  border:1px solid transparent;cursor:pointer;
  transition:background-color .18s,color .18s,border-color .18s,padding-left .18s;
}
.bl-side-item:hover{background:var(--bl-surface-hi);color:var(--bl-text);padding-left:15px}
.bl-side-item.is-on{background:var(--bl-acc-soft);border-color:var(--bl-acc-line);color:var(--bl-text);font-weight:600}
.bl-side-item.is-on::before{
  content:'';position:absolute;left:0;top:9px;bottom:9px;width:2px;border-radius:2px;
  background:var(--bl-acc);animation:blBar .28s ease-out;
}
.bl-side-count{font-size:12px;color:var(--bl-text4);font-variant-numeric:tabular-nums}
.bl-side-item.is-on .bl-side-count{color:var(--bl-acc-text)}

/* ---------- пошук ---------- */
.bl-search{position:relative;margin-bottom:20px}
.bl-search input{
  width:100%;height:42px;padding:0 40px;
  background:var(--bl-surface);border:1px solid var(--bl-line);border-radius:12px;
  color:var(--bl-text);font:inherit;font-size:14px;outline:none;
}
.bl-search input::placeholder{color:var(--bl-text4)}
.bl-search input:focus{border-color:var(--bl-acc-line);box-shadow:0 0 0 3px var(--bl-acc-soft)}
.bl-search-ico{position:absolute;left:13px;top:12px;color:var(--bl-text4);pointer-events:none}
.bl-search-clear{
  position:absolute;right:7px;top:7px;width:28px;height:28px;border:0;border-radius:8px;
  background:transparent;color:var(--bl-text3);cursor:pointer;display:grid;place-items:center;
  transition:background-color .16s,color .16s;
}
.bl-search-clear:hover{background:var(--bl-surface-hi);color:var(--bl-text)}

/* ---------- сітка карток ---------- */
.bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:20px}
.bl-card{
  display:flex;flex-direction:column;overflow:hidden;
  background:var(--bl-surface);border:1px solid var(--bl-line);border-radius:16px;
  animation:blUp .5s cubic-bezier(.22,.61,.36,1) backwards;
  animation-delay:calc(var(--i,0) * 55ms);
}
.bl-card:hover{transform:translateY(-4px);border-color:var(--bl-acc-line);box-shadow:var(--bl-shadow)}
.bl-card{transition:transform .22s cubic-bezier(.22,.61,.36,1),border-color .22s,box-shadow .22s,background-color .32s}
.bl-card:hover .bl-cover-grid{transform:scale(1.06)}
.bl-card:hover .bl-card-title{color:var(--bl-acc-text)}
.bl-card-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}
.bl-card-title{
  font-size:16.5px;line-height:1.3;font-weight:600;letter-spacing:-.3px;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
  transition:color .2s;
}
.bl-card-ex{
  font-size:13.5px;line-height:1.5;color:var(--bl-text3);flex:1;
  display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;
}
.bl-card-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--bl-text4);margin-top:2px}
.bl-card-meta i{width:3px;height:3px;border-radius:999px;background:currentColor;display:block}

.bl-chip{
  display:inline-flex;align-items:center;gap:6px;align-self:flex-start;
  padding:3px 9px;border-radius:8px;font-size:11.5px;font-weight:600;
  letter-spacing:.3px;background:var(--bl-acc-soft);color:var(--bl-acc-text);
  border:1px solid var(--bl-acc-line);
}
.bl-chip[data-tone="green"]{background:var(--bl-ok-soft);color:var(--bl-ok);border-color:transparent}
.bl-chip[data-tone="amber"]{background:var(--bl-warn-soft);color:var(--bl-warn);border-color:transparent}

/* ---------- обкладинки ---------- */
.bl-cover{position:relative;aspect-ratio:16/9;overflow:hidden;background:var(--bl-bg2)}
.bl-cover img{width:100%;height:100%;object-fit:cover;display:block}
/* Обкладинка ширша за текст, але не на весь екран: на 1600 колонка
   статті — 1200 пікселів, і картинка 21:9 у ній стає стіною у пів
   екрана заввишки, крізь яку треба прокрутитись до першого слова. */
.bl-cover--big{aspect-ratio:21/9;border-radius:18px;border:1px solid var(--bl-line);max-width:min(100%,calc(var(--bl-measure,780px) + 220px))}
.bl-cover--ph{display:flex;align-items:flex-end;padding:12px}
.bl-cover--ph[data-tone="violet"]{background:linear-gradient(135deg,#8b7bff33,#4a3bf522 60%,transparent),var(--bl-bg2)}
.bl-cover--ph[data-tone="green"]{background:linear-gradient(135deg,#2fbf8f33,#1c7a6022 60%,transparent),var(--bl-bg2)}
.bl-cover--ph[data-tone="blue"]{background:linear-gradient(135deg,#cfe9f955,#60a5fa22 60%,transparent),var(--bl-bg2)}
.bl-cover--ph[data-tone="amber"]{background:linear-gradient(135deg,#f5a33b33,#a5641422 60%,transparent),var(--bl-bg2)}
.bl-cover--ph[data-tone="lavender"]{background:linear-gradient(135deg,#afafe255,#8b7bff22 60%,transparent),var(--bl-bg2)}
.bl-cover-grid{
  position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(var(--bl-line-soft) 1px,transparent 1px),linear-gradient(90deg,var(--bl-line-soft) 1px,transparent 1px);
  background-size:26px 26px;
  transition:transform .5s cubic-bezier(.22,.61,.36,1);
}
.bl-cover-hint{
  position:relative;font-family:ui-monospace,'SF Mono',Menlo,monospace;
  font-size:10.5px;line-height:1.35;letter-spacing:.4px;color:var(--bl-text3);
  background:var(--bl-scrim);border:1px dashed var(--bl-line);border-radius:8px;
  padding:5px 8px;max-width:100%;
}

/* ---------- правий стовпчик ---------- */
.bl-rail{position:sticky;top:92px;display:flex;flex-direction:column;gap:18px}
.bl-promo{
  border:1px solid var(--bl-acc-line);border-radius:16px;padding:18px;
  background:linear-gradient(160deg,var(--bl-acc-soft),transparent 70%),var(--bl-surface);
}
.bl-promo h4{margin:0 0 6px;font-size:16.5px;font-weight:700;letter-spacing:-.3px}
.bl-promo p{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:var(--bl-text3)}
.bl-rail-box{background:var(--bl-surface);border:1px solid var(--bl-line);border-radius:16px;padding:16px}
.bl-rail-box h4{margin:0 0 12px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--bl-text4);font-weight:700}
.bl-rail-list{display:flex;flex-direction:column;gap:12px}
.bl-rail-item{font-size:13.5px;line-height:1.4;color:var(--bl-text2);transition:color .18s,transform .18s;display:block}
.bl-rail-item:hover{color:var(--bl-acc-text);transform:translateX(3px)}
.bl-rail-item span{display:block;font-size:11.5px;color:var(--bl-text4);margin-top:3px}

/* ---------- теги ---------- */
.bl-tags{display:flex;flex-wrap:wrap;gap:8px}
.bl-tag{
  padding:6px 11px;border-radius:999px;border:1px solid var(--bl-line);
  font-size:12.5px;color:var(--bl-text3);background:var(--bl-surface);
  transition:border-color .18s,color .18s,transform .18s,background-color .18s;
}
.bl-tag:hover{border-color:var(--bl-acc-line);color:var(--bl-acc-text);transform:translateY(-2px)}
.bl-tag.is-on{background:var(--bl-acc-soft);border-color:var(--bl-acc-line);color:var(--bl-acc-text)}
.bl-tag b{font-weight:500;color:var(--bl-text4);margin-left:4px}

/* Згортання. Через grid-template-rows, а не max-height: висота
   вмісту заздалегідь невідома, а вгадана максимальна або обрізає
   довгий список, або лишає порожній хвіст у кінці анімації. */
.bl-collapse{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .36s cubic-bezier(.22,.61,.36,1),opacity .3s ease}
.bl-collapse.is-open{grid-template-rows:1fr;opacity:1}
.bl-collapse>div{overflow:hidden;min-height:0}
.bl-chev{transition:transform .3s cubic-bezier(.22,.61,.36,1)}
.bl-chev.is-open{transform:rotate(180deg)}

.bl-seo{margin-top:46px;padding-top:24px;border-top:1px solid var(--bl-line)}
.bl-seo-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.bl-seo h3{margin:0;font-size:13px;font-weight:700;color:var(--bl-text2);letter-spacing:.02em}
.bl-seo p{margin:16px 0 0;font-size:13px;line-height:1.6;color:var(--bl-text4);max-width:900px}

/* ---------- порожній стан ---------- */
.bl-empty{
  border:1px dashed var(--bl-line);border-radius:16px;padding:40px 26px;text-align:center;color:var(--bl-text3);
  animation:blFade .4s;
}
.bl-empty b{display:block;color:var(--bl-text);font-size:16px;margin-bottom:6px}

/* ---------- футер ---------- */
.bl-foot{border-top:1px solid var(--bl-line);background:var(--bl-bg2);margin-top:40px}
.bl-foot-in{
  width:var(--bl-shell);margin:0 auto;padding:36px 0 22px;
  display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;
}
.bl-foot-note{margin:12px 0 0;font-size:13px;color:var(--bl-text4);max-width:340px;line-height:1.5}
.bl-foot-links{display:flex;gap:22px;flex-wrap:wrap;font-size:13.5px;color:var(--bl-text3);align-items:flex-start}
.bl-foot-links a{transition:color .18s}
.bl-foot-links a:hover{color:var(--bl-acc-text)}
.bl-foot-bottom{width:var(--bl-shell);margin:0 auto;padding:0 0 26px;font-size:12px;color:var(--bl-text4)}

/* ==================================================================
   Стаття
================================================================== */
.bl-progress{position:fixed;top:0;left:0;height:2px;background:var(--bl-acc);z-index:60;transition:width .1s linear}
.bl-article{width:var(--bl-shell);margin:0 auto;padding:30px 0 40px}

/* Дві колонки: зміст ліворуч на самій сторінці, стаття праворуч.
   Плаваюче віконце змісту лишається тільки там, де для колонки
   немає місця, — на вузькому екрані. */
.bl-art-cols{display:grid;grid-template-columns:250px minmax(0,1fr);gap:44px;align-items:start}
/* Колонка статті ширша за саму колонку тексту рівно настільки, щоб
   у неї влазили таблиця й картинка. Далі йде поле — сторінка не
   зобов'язана заповнювати монітор до країв. */
.bl-art-cols>article{max-width:calc(var(--bl-measure,780px) + 240px)}
.bl-toc-side{position:sticky;top:92px;max-height:calc(100vh - 130px);overflow-y:auto;padding-right:6px}
.bl-toc-h{
  font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--bl-text4);
  font-weight:700;margin:0 0 10px;padding-left:12px;
}
.bl-art-head{margin:0 0 26px}
.bl-art-meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:13px;color:var(--bl-text4);margin-top:14px}

/* Тіло статті керується змінними з віконця налаштувань. Ширина
   колонки живе тут, а не в компоненті, тому що її має бачити ще й
   картинка, яка вміє вилазити за колонку. */
.bl-prose{
  max-width:var(--bl-measure,760px);
  font-family:var(--bl-family);
  font-size:var(--bl-fs,18.5px);
  line-height:var(--bl-lh,1.75);
  color:var(--bl-text2);
  transition:font-size .26s ease,line-height .26s ease,max-width .3s ease,color .32s ease;
}
.bl-prose>*{margin:0 0 1.15em}
.bl-prose h2{
  font-family:var(--edge-sans,'Roboto',sans-serif);
  font-size:1.42em;line-height:1.22;letter-spacing:-.6px;font-weight:700;
  color:var(--bl-text);margin:2em 0 .7em;scroll-margin-top:96px;
}
.bl-prose h3{
  font-family:var(--edge-sans,'Roboto',sans-serif);
  font-size:1.15em;line-height:1.3;font-weight:600;
  color:var(--bl-text);margin:1.7em 0 .6em;scroll-margin-top:96px;
}
.bl-prose strong{color:var(--bl-text);font-weight:600}
.bl-prose em{font-style:italic}
.bl-prose a{color:var(--bl-acc-text);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;transition:background-color .18s}
.bl-prose a:hover{background:var(--bl-acc-soft)}
/* Підсвітка ==текст==. Не жовтий маркер, а м'яка підкладка акцентом
   із товстішим накресленням: у трьох темах читання (світлій, темній і
   сепії) жовтий або губиться, або кричить, а акцент уже перевірений
   в усіх трьох. */
.bl-prose mark.bl-mark{
  background:var(--bl-acc-soft);color:var(--bl-text);
  font-weight:600;padding:1px 4px;border-radius:5px;
  box-decoration-break:clone;-webkit-box-decoration-break:clone;
}
.bl-prose code{
  font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:.86em;
  background:var(--bl-acc-soft);padding:2px 5px;border-radius:5px;color:var(--bl-text)
}
.bl-prose pre{
  background:var(--bl-bg2);border:1px solid var(--bl-line);border-radius:12px;
  padding:14px 16px;overflow-x:auto;font-size:.85em;line-height:1.6;
}
.bl-prose ul,.bl-prose ol{padding-left:1.3em}
.bl-prose li{margin:.45em 0}
.bl-prose li::marker{color:var(--bl-acc-text)}
.bl-prose blockquote{
  margin:1.6em 0;padding:2px 0 2px 20px;border-left:2px solid var(--bl-acc);
  color:var(--bl-text);font-size:1.06em;line-height:1.55;
}
.bl-prose hr{border:0;border-top:1px solid var(--bl-line);margin:2.2em 0}

.bl-tablewrap{overflow-x:auto;margin:1.6em 0;border:1px solid var(--bl-line);border-radius:12px}
.bl-prose table{width:100%;border-collapse:collapse;font-size:.9em;font-family:var(--edge-sans,'Roboto',sans-serif)}
.bl-prose th,.bl-prose td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--bl-line-soft);vertical-align:top}
.bl-prose th{background:var(--bl-bg2);color:var(--bl-text);font-weight:600;font-size:.92em;letter-spacing:.2px}
.bl-prose tr:last-child td{border-bottom:0}

.bl-fig{margin:1.9em 0}
.bl-fig .bl-cover{border-radius:14px;border:1px solid var(--bl-line);aspect-ratio:16/8}
/* Рамка кадру: сам перегляд (стрілки, лупа, фулскрін) приходить із
   застосунку, тут лише розмір і закруглення, щоб картинка в статті
   не відрізнялась від картинки в журналі угод. */
.bl-fig-frame{
  position:relative;aspect-ratio:16/9;border-radius:14px;overflow:hidden;
  border:1px solid var(--bl-line);background:var(--bl-bg2);
}
.bl-fig-badge{
  display:inline-flex;align-items:center;gap:5px;margin-right:8px;
  padding:2px 8px;border-radius:6px;font-weight:700;letter-spacing:.08em;
  font-size:.92em;background:var(--bl-acc-soft);color:var(--bl-acc-text);
  border:1px solid var(--bl-acc-line);
}
.bl-fig figcaption{
  margin-top:9px;font-size:.78em;line-height:1.45;color:var(--bl-text4);
  font-family:var(--edge-sans,'Roboto',sans-serif);text-align:center;
}

.bl-callout{
  margin:1.7em 0;padding:15px 17px;border-radius:14px;
  border:1px solid var(--bl-acc-line);background:var(--bl-acc-soft);
  font-size:.94em;line-height:1.6;
}
.bl-callout[data-kind="warn"]{border-color:var(--bl-warn);background:var(--bl-warn-soft)}
.bl-callout[data-kind="ok"]{border-color:var(--bl-ok);background:var(--bl-ok-soft)}
.bl-callout-t{
  display:block;font-family:var(--edge-sans,'Roboto',sans-serif);
  font-weight:700;font-size:.94em;color:var(--bl-text);margin-bottom:5px;
}
.bl-callout p{margin:0 0 .6em}
.bl-callout p:last-child{margin:0}

/* ---------- підвал статті ---------- */
.bl-art-foot{max-width:var(--bl-measure,760px);margin:44px 0 0}
.bl-art-cta{
  margin-top:30px;padding:26px;border-radius:18px;text-align:center;
  border:1px solid var(--bl-acc-line);
  background:linear-gradient(160deg,var(--bl-acc-soft),transparent 75%),var(--bl-surface);
}
.bl-art-cta h3{margin:0 0 8px;font-size:20px;font-weight:700;letter-spacing:-.4px;color:var(--bl-text)}
.bl-art-cta p{margin:0 0 18px;font-size:14px;color:var(--bl-text3)}
.bl-related{width:var(--bl-shell);margin:0 auto;padding:0 0 56px}
.bl-related>h3{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--bl-text4);margin:0 0 16px;font-weight:700}

/* ==================================================================
   Плаваючі кнопки й віконця
================================================================== */
.bl-fabs{position:fixed;right:22px;bottom:22px;z-index:55;display:flex;flex-direction:column;gap:10px}
.bl-fab{
  width:46px;height:46px;border-radius:12px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  background:var(--bl-btn-bg);border:1px solid var(--bl-acc-line-hi);
  color:var(--bl-text2);box-shadow:var(--bl-shadow);
  transition:background-color .2s,border-color .2s,color .2s,transform .2s;
}
.bl-fab:hover{color:var(--bl-text);border-color:var(--bl-acc);transform:translateY(-2px)}
.bl-fab:active{transform:scale(.96)}
.bl-fab.is-on{background:var(--bl-acc-soft);border-color:var(--bl-acc);color:var(--bl-acc-text)}
.bl-fab-toc{display:none}

.bl-panel{
  position:fixed;right:22px;bottom:80px;z-index:56;width:318px;
  background:var(--bl-surface);border:1px solid var(--bl-line);border-radius:18px;
  box-shadow:var(--bl-shadow);padding:16px;
  animation:blPop .2s cubic-bezier(.22,.61,.36,1);
}
.bl-panel-h{
  display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;
  font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--bl-text4);font-weight:700;
}
.bl-panel-x{
  border:0;background:transparent;color:var(--bl-text3);cursor:pointer;
  display:grid;place-items:center;width:26px;height:26px;border-radius:8px;
  transition:background-color .16s,color .16s;
}
.bl-panel-x:hover{background:var(--bl-surface-hi);color:var(--bl-text)}
.bl-row{margin-bottom:15px}
.bl-row:last-child{margin-bottom:0}
.bl-row-t{font-size:12px;color:var(--bl-text4);margin-bottom:7px}
.bl-row .bl-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;width:100%}
.bl-a1{font-size:12px}.bl-a2{font-size:15px}.bl-a3{font-size:18px}.bl-a4{font-size:21px}

/* ---------- зміст ---------- */
.bl-toc{display:flex;flex-direction:column;gap:2px}
.bl-toc a{
  position:relative;display:block;padding:8px 10px 8px 14px;border-radius:9px;
  font-size:13.5px;line-height:1.35;color:var(--bl-text3);
  transition:background-color .2s,color .2s,padding-left .2s;
}
.bl-toc a::before{
  content:'';position:absolute;left:0;top:7px;bottom:7px;width:2px;border-radius:2px;
  background:var(--bl-acc);transform:scaleY(0);transform-origin:center;
  transition:transform .26s cubic-bezier(.22,.61,.36,1);
}
.bl-toc a:hover{background:var(--bl-surface-hi);color:var(--bl-text);padding-left:17px}
.bl-toc a.lvl3{padding-left:26px;font-size:12.8px}
.bl-toc a.lvl3:hover{padding-left:29px}
.bl-toc a.is-on{color:var(--bl-text);background:var(--bl-acc-soft)}
.bl-toc a.is-on::before{transform:scaleY(1)}
.bl-panel .bl-toc{max-height:min(58vh,440px);overflow-y:auto}

/* ==================================================================
   Адаптив
================================================================== */
@media (max-width:1320px){
  .bl-cols{grid-template-columns:230px minmax(0,1fr)}
  .bl-rail{display:none}
  .bl-head-nav{display:none}
}
@media (max-width:1180px){
  .bl-root{--bl-shell:92%}
  .bl-art-cols{grid-template-columns:minmax(0,1fr)}
  .bl-toc-side{display:none}
  .bl-fab-toc{display:flex}
  .bl-prose,.bl-art-foot,.bl-art-head{margin-left:auto;margin-right:auto}
}
@media (max-width:860px){
  .bl-root{--bl-shell:calc(100% - 36px)}
  .bl-head-in{height:58px;gap:12px}
  .bl-wrap{padding:22px 0 48px}
  .bl-article{padding:22px 0 34px}
  .bl-cols{grid-template-columns:minmax(0,1fr)}
  .bl-side{position:static}
  .bl-side-box{display:flex;gap:6px;overflow-x:auto;padding:6px;margin-bottom:16px;scrollbar-width:none}
  .bl-side-box::-webkit-scrollbar{display:none}
  .bl-side-title{display:none}
  .bl-side-item{white-space:nowrap;padding:8px 12px}
  .bl-side-item:hover{padding-left:12px}
  .bl-side-count{display:none}
  .bl-grid{grid-template-columns:minmax(0,1fr)}
  .bl-btn--head{display:none}
  .bl-panel{right:14px;left:14px;width:auto;bottom:76px}
  .bl-fabs{right:14px;bottom:14px}
}

@media (prefers-reduced-motion: reduce){
  .bl-root *,.bl-root *::before,.bl-root *::after{animation:none !important;transition:none !important}
  .bl-card:hover{transform:none}
}
`;

export function BlogStyles() {
  return <style>{BLOG_CSS}</style>;
}
