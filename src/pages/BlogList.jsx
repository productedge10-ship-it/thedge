import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Fuse from 'fuse.js';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEdgeFonts } from '../lib/theme';
import {
  BLOG_LANGS, CATEGORIES, categoryBySlug, categoryCounts,
  postsFor, readMinutes, tagCloud,
} from '../lib/blogContent';
import { plainText } from '../lib/blogMd';
import { colorScheme, themeVars, useReaderPrefs, READER_THEMES } from '../lib/blogReader';
import { useDocumentMeta, siteOrigin } from '../lib/blogSeo';
import {
  BlogFooter, BlogHeader, BlogStyles, Cover, Crumbs, MIN_WORD, Seg,
  blogPath, fmtDate, useBlogBackground,
} from '../components/blog/BlogChrome';

/* ==================================================================
   БЛОГ — список статей.

   Одна сторінка на три адреси: усі статті, розділ, тег. Вони
   відрізняються лише набором статей і хлібними крихтами, тому
   тримати три майже однакові компоненти означало б правити кожну
   зміну втричі.

   Пошук клієнтський і по всьому тексту, не лише по заголовках:
   людина шукає «профіт-фактор», а не назву статті. Поки статей
   десятки, це дешевше й чесніше за будь-який серверний пошук.
================================================================== */

const PAGE = 12;

const SWATCH = { dark: '#0e0e14', light: '#faf5ff', book: '#ede6d9' };

const TXT = {
  uk: {
    blog: 'Блог',
    title: 'Блог The Edge',
    lede: 'Психологія, розбори тижня, плани й база — те, що видно в журналі, коли записуєш кожну угоду.',
    search: 'Пошук по статтях',
    sections: 'Розділи',
    all: 'Усі статті',
    nothing: 'Нічого не знайшлось',
    nothingSub: 'Спробуй інше слово або подивись усі статті розділу.',
    soon: 'Тут поки порожньо',
    soonSub: 'Статті цією мовою ще пишуться. Українською вже є що почитати.',
    more: 'Показати ще',
    popular: 'Свіже',
    tags: 'Теги',
    tagsHint: 'Показати',
    tagsHide: 'Сховати',
    about: 'Про що це',
    promoTitle: 'Журнал, який рахує за тебе',
    promoText: 'План, угоди, аналітика й розбори в одному місці. Безкоштовний тариф — назавжди.',
    promoCta: 'Почати безкоштовно',
    tagPrefix: 'Тег',
    toUk: 'Українською',
  },
  ru: {
    blog: 'Блог', title: 'Блог The Edge',
    lede: 'Психология, разборы недели, планы и база — то, что видно в журнале, когда записываешь каждую сделку.',
    search: 'Поиск по статьям', sections: 'Разделы', all: 'Все статьи',
    nothing: 'Ничего не нашлось', nothingSub: 'Попробуй другое слово или посмотри все статьи раздела.',
    soon: 'Здесь пока пусто', soonSub: 'Статьи на этом языке ещё пишутся.',
    more: 'Показать ещё', popular: 'Свежее', tags: 'Теги', tagsHint: 'Показать', tagsHide: 'Скрыть',
    about: 'О чём это',
    promoTitle: 'Журнал, который считает за тебя',
    promoText: 'План, сделки, аналитика и разборы в одном месте. Бесплатный тариф — навсегда.',
    promoCta: 'Начать бесплатно', tagPrefix: 'Тег', toUk: 'На украинском',
  },
  en: {
    blog: 'Blog', title: 'The Edge blog',
    lede: 'Psychology, weekly reviews, plans and fundamentals — what a journal shows when every trade is written down.',
    search: 'Search articles', sections: 'Sections', all: 'All articles',
    nothing: 'Nothing found', nothingSub: 'Try another word or browse the whole section.',
    soon: 'Nothing here yet', soonSub: 'English pieces are still being written.',
    more: 'Show more', popular: 'Latest', tags: 'Tags', tagsHint: 'Show', tagsHide: 'Hide',
    about: 'What this is about',
    promoTitle: 'A journal that does the maths',
    promoText: 'Plan, trades, analytics and reviews in one place. Free tier, forever.',
    promoCta: 'Start free', tagPrefix: 'Tag', toUk: 'In Ukrainian',
  },
};

function Card({ post, lang, index }) {
  const cat = CATEGORIES.find((c) => c.id === post.category);
  return (
    <Link
      to={blogPath(lang, `/${post.slug}`)}
      className="bl-card"
      style={{ '--i': index }}
    >
      <Cover cover={post.cover} title={post.title} />
      <div className="bl-card-body">
        <span className="bl-chip" data-tone={cat?.tone}>{cat?.title[lang] || cat?.title.uk}</span>
        <h3 className="bl-card-title">{post.title}</h3>
        <p className="bl-card-ex">{post.excerpt}</p>
        <div className="bl-card-meta">
          <span>{fmtDate(post.date, lang)}</span>
          <i />
          <span>{(MIN_WORD[lang] || MIN_WORD.uk)(readMinutes(post))}</span>
        </div>
      </div>
    </Link>
  );
}

export default function BlogList() {
  useEdgeFonts();
  const { lang, cat: catSlug, tag } = useParams();
  const navigate = useNavigate();
  const { prefs, setPref } = useReaderPrefs();
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  /* Теги згорнуті за замовчуванням: розгорнута хмара з двох десятків
     слів забирає екран і відсуває футер, а потрібна вона рідко. */
  const [tagsOpen, setTagsOpen] = useState(false);

  const vars = themeVars(prefs.theme);
  useBlogBackground(vars['--bl-bg']);

  const okLang = BLOG_LANGS.includes(lang);
  const t = TXT[lang] || TXT.uk;
  const category = catSlug ? categoryBySlug(catSlug) : null;
  const activeTag = tag ? decodeURIComponent(tag) : null;

  const all = useMemo(() => (okLang ? postsFor(lang) : []), [lang, okLang]);
  const counts = useMemo(() => (okLang ? categoryCounts(lang) : {}), [lang, okLang]);
  const tags = useMemo(() => (okLang ? tagCloud(lang) : []), [lang, okLang]);

  /* Індекс пошуку будується один раз на мову: перебудовувати його на
     кожне натискання клавіші — найпростіший спосіб зробити пошук
     повільним рівно там, де він має бути миттєвим. */
  const fuse = useMemo(() => new Fuse(
    all.map((p) => ({ ...p, plain: plainText(p.body) })),
    {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'excerpt', weight: 2 },
        { name: 'tags', weight: 2 },
        { name: 'plain', weight: 1 },
      ],
      threshold: 0.34,
      ignoreLocation: true,
      minMatchCharLength: 3,
    },
  ), [all]);

  const list = useMemo(() => {
    let out = all;
    if (category) out = out.filter((p) => p.category === category.id);
    if (activeTag) out = out.filter((p) => p.tags.some((x) => x.toLowerCase() === activeTag.toLowerCase()));
    if (q.trim().length >= 2) {
      const hits = new Set(fuse.search(q.trim()).map((r) => r.item.slug));
      out = out.filter((p) => hits.has(p.slug));
    }
    return out;
  }, [all, category, activeTag, q, fuse]);

  const heading = category
    ? category.title[lang] || category.title.uk
    : (activeTag ? `${t.tagPrefix}: ${activeTag}` : t.title);

  const lede = category ? (category.blurb[lang] || category.blurb.uk) : t.lede;

  const canonical = `${siteOrigin()}${blogPath(lang, category ? `/category/${category.slug}` : '')}`;
  const alternates = useMemo(
    () => BLOG_LANGS.map((l) => ({ lang: l, href: `${siteOrigin()}${blogPath(l)}` })),
    [],
  );

  useDocumentMeta({
    title: `${heading} — The Edge`,
    description: lede,
    canonical,
    lang: okLang ? lang : 'uk',
    alternates,
  });

  /* Невідома мова в адресі — не помилка користувача, а стара або
     обрізана адреса. Мовчки ведемо в український блог. */
  if (!okLang) return <Navigate to={blogPath('uk')} replace />;
  if (catSlug && !category) return <Navigate to={blogPath(lang)} replace />;

  const visible = list.slice(0, shown);
  const themeItems = READER_THEMES.map((th) => ({
    id: th.id,
    title: th.label[lang] || th.label.uk,
    node: <span className="bl-sw" style={{ background: SWATCH[th.id] }} />,
  }));
  const langItems = BLOG_LANGS.map((l) => ({ id: l, title: l.toUpperCase(), node: l.toUpperCase() }));

  return (
    <div className="bl-root" style={{ ...vars, colorScheme: colorScheme(prefs.theme) }}>
      <BlogStyles />

      <BlogHeader lang={lang}>
        <Seg items={themeItems} value={prefs.theme} onPick={(v) => setPref('theme', v)} label="Тема" />
        <Seg items={langItems} value={lang} onPick={(l) => navigate(blogPath(l))} label="Мова" />
      </BlogHeader>

      <div className="bl-wrap">
        {/* Крихти лише там, де є куди повертатись. На корені блогу
            вони складались би з одного слова, яке й так стоїть у
            заголовку нижче. */}
        {(category || activeTag) && (
          <Crumbs
            items={[
              { label: t.blog, to: blogPath(lang) },
              { label: category ? (category.title[lang] || category.title.uk) : `${t.tagPrefix}: ${activeTag}` },
            ]}
          />
        )}

        <h1 className="bl-h1">{heading}</h1>
        <p className="bl-lede">{lede}</p>

        <div className="bl-cols">
          {/* ---- розділи ---- */}
          <aside className="bl-side">
            <div className="bl-side-box">
              <div className="bl-side-title">{t.sections}</div>
              <Link to={blogPath(lang)} className={!category && !activeTag ? 'bl-side-item is-on' : 'bl-side-item'}>
                <span>{t.all}</span>
                <span className="bl-side-count">{all.length}</span>
              </Link>
              {CATEGORIES.map((c) => (
                <Link
                  key={c.id}
                  to={blogPath(lang, `/category/${c.slug}`)}
                  className={category?.id === c.id ? 'bl-side-item is-on' : 'bl-side-item'}
                >
                  <span>{c.title[lang] || c.title.uk}</span>
                  <span className="bl-side-count">{counts[c.id] || 0}</span>
                </Link>
              ))}
            </div>
          </aside>

          {/* ---- стрічка ---- */}
          <main>
            <div className="bl-search">
              <Search size={17} className="bl-search-ico" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setShown(PAGE); }}
                placeholder={t.search}
                aria-label={t.search}
              />
              {q && (
                <button type="button" className="bl-search-clear" onClick={() => setQ('')} aria-label="×">
                  <X size={15} />
                </button>
              )}
            </div>

            {visible.length > 0 ? (
              <>
                {/* key на сітці: при зміні розділу, тега чи запиту
                    картки з'являються заново, а не підмінюються на
                    місці — видно, що список інший. */}
                <div className="bl-grid" key={`${category?.id || 'all'}|${activeTag || ''}|${q.trim()}`}>
                  {visible.map((p, i) => <Card key={p.slug} post={p} lang={lang} index={i} />)}
                </div>
                {list.length > shown && (
                  <button type="button" className="bl-btn bl-btn--wide" style={{ marginTop: 22 }} onClick={() => setShown((s) => s + PAGE)}>
                    {t.more}
                  </button>
                )}
              </>
            ) : (
              <div className="bl-empty">
                <b>{all.length === 0 ? t.soon : t.nothing}</b>
                {all.length === 0 ? t.soonSub : t.nothingSub}
                <div style={{ marginTop: 18 }}>
                  {all.length === 0 ? (
                    <Link className="bl-btn bl-btn--solid" to={blogPath('uk')}>{t.toUk}</Link>
                  ) : (
                    <button type="button" className="bl-btn" onClick={() => setQ('')}>{t.all}</button>
                  )}
                </div>
              </div>
            )}
          </main>

          {/* ---- правий стовпчик ---- */}
          <aside className="bl-rail">
            <div className="bl-promo">
              <h4>{t.promoTitle}</h4>
              <p>{t.promoText}</p>
              <a className="bl-btn bl-btn--solid bl-btn--wide" href="/auth">{t.promoCta}</a>
            </div>

            {all.length > 0 && (
              <div className="bl-rail-box">
                <h4>{t.popular}</h4>
                <div className="bl-rail-list">
                  {all.slice(0, 4).map((p) => (
                    <Link key={p.slug} to={blogPath(lang, `/${p.slug}`)} className="bl-rail-item">
                      {p.title}
                      <span>{fmtDate(p.date, lang)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* ---- теги: і навігація, і сигнал пошуковику ---- */}
        {tags.length > 0 && (
          <section className="bl-seo">
            <div className="bl-seo-head">
              <h3>{t.tags} · {tags.length}</h3>
              <button
                type="button"
                className="bl-btn bl-btn--ghost"
                onClick={() => setTagsOpen((v) => !v)}
                aria-expanded={tagsOpen}
              >
                {tagsOpen ? t.tagsHide : t.tagsHint}
                <ChevronDown size={15} className={tagsOpen ? 'bl-chev is-open' : 'bl-chev'} />
              </button>
            </div>

            <div className={tagsOpen ? 'bl-collapse is-open' : 'bl-collapse'}>
              <div>
                <div className="bl-tags" style={{ paddingTop: 16 }}>
                  {tags.map(({ tag: tg, count }) => (
                    <Link
                      key={tg}
                      to={blogPath(lang, `/tag/${encodeURIComponent(tg)}`)}
                      className={activeTag === tg ? 'bl-tag is-on' : 'bl-tag'}
                    >
                      {tg}<b>{count}</b>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <p>
              {t.about}: {CATEGORIES.map((c) => c.title[lang] || c.title.uk).join(' · ')}. {t.lede}
            </p>
          </section>
        )}
      </div>

      <BlogFooter lang={lang} />
    </div>
  );
}
