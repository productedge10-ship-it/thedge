import { useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useEdgeFonts } from '../lib/theme';
import {
  AUTHOR, BLOG_LANGS, categoryById,
  postBySlug, readMinutes, relatedPosts,
} from '../lib/blogContent';
import { parse } from '../lib/blogMd';
import {
  colorScheme, themeVars, textVars, useReaderPrefs, READER_THEMES,
} from '../lib/blogReader';
import { useDocumentMeta, siteOrigin } from '../lib/blogSeo';
import {
  BlogFooter, BlogHeader, BlogStyles, Cover, Crumbs, MIN_WORD, Seg,
  blogPath, fmtDate, useBlogBackground,
} from '../components/blog/BlogChrome';
import Markdown from '../components/blog/Markdown';
import ReadingTools, { SideToc, useActiveHeading } from '../components/blog/ReadingTools';

/* ==================================================================
   БЛОГ — сторінка статті.

   Дві колонки: зміст ліворуч на самій сторінці, стаття праворуч на
   всю доступну ширину. Зміст видно постійно й видно, де ти зараз, —
   без кліків. На вузькому екрані колонка ховається, і замість неї
   лишається плаваюча кнопка.

   Текст розбирається один раз, і з одного дерева малюється і стаття,
   і зміст: тому якорі в змісті й у тексті фізично не можуть
   розійтись.

   Перемикач мови веде на переклад, якщо він є, і в корінь блогу,
   якщо його немає: викидати людину на порожню сторінку 404 через
   те, що статтю ще не переклали, — найгірший із можливих варіантів.
================================================================== */

const SWATCH = { dark: '#0e0e14', light: '#faf5ff', book: '#ede6d9' };

const TXT = {
  uk: { blog: 'Блог', related: 'Читати далі', ctaTitle: 'Перевір це на своїх угодах', ctaText: 'Журнал сам порахує R, профіт-фактор і покаже, які рішення тобі платять. Безкоштовний тариф — назавжди.', cta: 'Почати безкоштовно' },
  ru: { blog: 'Блог', related: 'Читать дальше', ctaTitle: 'Проверь это на своих сделках', ctaText: 'Журнал сам посчитает R, профит-фактор и покажет, какие решения тебе платят. Бесплатный тариф — навсегда.', cta: 'Начать бесплатно' },
  en: { blog: 'Blog', related: 'Read next', ctaTitle: 'Check it on your own trades', ctaText: 'The journal counts R and profit factor for you and shows which decisions pay. Free tier, forever.', cta: 'Start free' },
};

export default function BlogPost() {
  useEdgeFonts();
  const { lang, slug } = useParams();
  const navigate = useNavigate();
  const { prefs, setPref, reset } = useReaderPrefs();

  const vars = themeVars(prefs.theme);
  useBlogBackground(vars['--bl-bg']);

  const okLang = BLOG_LANGS.includes(lang);
  const post = okLang ? postBySlug(lang, slug) : null;
  const t = TXT[lang] || TXT.uk;

  /* Кожна стаття відкривається згори. Без цього перехід із картки в
     кінці списку показує середину нової статті. */
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  const blocks = useMemo(() => (post ? parse(post.body) : []), [post]);
  const headings = useMemo(
    () => blocks.filter((b) => b.type === 'h').map(({ id, text, level }) => ({ id, text, level })),
    [blocks],
  );
  const active = useActiveHeading(headings);
  const related = useMemo(() => (post ? relatedPosts(post) : []), [post]);

  const canonical = post ? `${siteOrigin()}${blogPath(lang, `/${post.slug}`)}` : '';
  const alternates = useMemo(() => {
    if (!post) return [];
    const out = [{ lang: post.lang, href: `${siteOrigin()}${blogPath(post.lang, `/${post.slug}`)}` }];
    Object.entries(post.translations || {}).forEach(([l, s]) => {
      out.push({ lang: l, href: `${siteOrigin()}${blogPath(l, `/${s}`)}` });
    });
    return out;
  }, [post]);

  const jsonLd = useMemo(() => (post ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    datePublished: post.date,
    inLanguage: post.lang,
    author: { '@type': 'Organization', name: AUTHOR[post.lang] || AUTHOR.uk },
    publisher: { '@type': 'Organization', name: 'The Edge' },
    mainEntityOfPage: canonical,
    articleSection: categoryById(post.category)?.title[post.lang],
    keywords: post.tags.join(', '),
  } : null), [post, canonical]);

  useDocumentMeta({
    title: post ? `${post.seo?.title || post.title} — The Edge` : 'The Edge',
    description: post ? (post.seo?.description || post.excerpt) : '',
    canonical,
    lang: okLang ? lang : 'uk',
    type: 'article',
    published: post?.date,
    alternates,
    jsonLd,
  });

  if (!okLang) return <Navigate to={blogPath('uk')} replace />;
  if (!post) return <Navigate to={blogPath(lang)} replace />;

  const cat = categoryById(post.category);

  /* Перемикач мови: якщо переклад є — на нього, якщо ні — у список
     тією мовою. */
  const switchLang = (l) => {
    if (l === post.lang) return;
    const tr = post.translations?.[l];
    navigate(tr ? blogPath(l, `/${tr}`) : blogPath(l));
  };

  const themeItems = READER_THEMES.map((th) => ({
    id: th.id,
    title: th.label[lang] || th.label.uk,
    node: <span className="bl-sw" style={{ background: SWATCH[th.id] }} />,
  }));
  const langItems = BLOG_LANGS.map((l) => ({ id: l, title: l.toUpperCase(), node: l.toUpperCase() }));

  return (
    <div
      className="bl-root"
      style={{ ...vars, ...textVars(prefs), colorScheme: colorScheme(prefs.theme) }}
    >
      <BlogStyles />

      <BlogHeader lang={lang} nav={false}>
        <Seg items={themeItems} value={prefs.theme} onPick={(v) => setPref('theme', v)} label="Тема" />
        <Seg items={langItems} value={lang} onPick={switchLang} label="Мова" />
      </BlogHeader>

      <ReadingTools
        headings={headings}
        active={active}
        prefs={prefs}
        setPref={setPref}
        reset={reset}
        lang={lang}
      />

      <div className="bl-article">
        <div className="bl-art-cols">
          <SideToc headings={headings} active={active} lang={lang} />

          <article>
            <header className="bl-art-head">
              <Crumbs
                items={[
                  { label: t.blog, to: blogPath(lang) },
                  { label: cat?.title[lang] || cat?.title.uk, to: blogPath(lang, `/category/${cat?.slug}`) },
                ]}
              />
              <h1 className="bl-h1">{post.title}</h1>
              <p className="bl-lede">{post.excerpt}</p>
              <div className="bl-art-meta">
                <span className="bl-chip" data-tone={cat?.tone}>{cat?.title[lang] || cat?.title.uk}</span>
                <span>{fmtDate(post.date, lang)}</span>
                <span>·</span>
                <span>{(MIN_WORD[lang] || MIN_WORD.uk)(readMinutes(post))}</span>
                <span>·</span>
                <span>{AUTHOR[lang] || AUTHOR.uk}</span>
              </div>
            </header>

            <div style={{ margin: '0 0 34px' }}>
              <Cover cover={post.cover} title={post.title} big zoomable vars={vars} />
            </div>

            <Markdown blocks={blocks} vars={vars} />

            <footer className="bl-art-foot">
              <div className="bl-tags">
                {post.tags.map((tg) => (
                  <Link key={tg} to={blogPath(lang, `/tag/${encodeURIComponent(tg)}`)} className="bl-tag">
                    {tg}
                  </Link>
                ))}
              </div>

              <div className="bl-art-cta">
                <h3>{t.ctaTitle}</h3>
                <p>{t.ctaText}</p>
                <a className="bl-btn bl-btn--solid" href="/auth">{t.cta}</a>
              </div>
            </footer>
          </article>
        </div>
      </div>

      {related.length > 0 && (
        <section className="bl-related">
          <h3>{t.related}</h3>
          <div className="bl-grid">
            {related.map((p, i) => {
              const c = categoryById(p.category);
              return (
                <Link key={p.slug} to={blogPath(lang, `/${p.slug}`)} className="bl-card" style={{ '--i': i }}>
                  <Cover cover={p.cover} title={p.title} />
                  <div className="bl-card-body">
                    <span className="bl-chip" data-tone={c?.tone}>{c?.title[lang] || c?.title.uk}</span>
                    <h3 className="bl-card-title">{p.title}</h3>
                    <div className="bl-card-meta">
                      <span>{fmtDate(p.date, lang)}</span>
                      <i />
                      <span>{(MIN_WORD[lang] || MIN_WORD.uk)(readMinutes(p))}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <BlogFooter lang={lang} />
    </div>
  );
}
