/* ==================================================================
   Після збірки: теги сторінок для пошуковиків і свіжий sitemap.

   Сайт — SPA: на будь-яку адресу сервер віддає один index.html, а
   заголовок, опис і канонічну адресу статті ставить уже JS. Google
   JS виконує, але не одразу й не завжди — і доти бачить у кожної
   статті заголовок і canonical головної. Для нього це «пів сотні
   копій головної сторінки», і статті в пошук не потрапляють.

   Тому під час збірки складаємо карту «адреса → теги й короткий
   текст сторінки» (dist/seo-routes.json). server.mjs підставляє їх у
   index.html ще до відправки, і робот одразу бачить справжню
   сторінку. React потім однаково малює все сам — текст усередині
   #root він просто замінює.

   Тут же генеруємо sitemap.xml, щоб він не відставав від статей:
   раніше його правили руками, і там жила одна головна зі старим
   доменом.

   Джерело даних — ті самі функції з blogContent.js, що й у блозі.
   Переїде блог на базу — зміниться лише імпорт.
================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOG_LANGS, CATEGORIES, postsFor, postsInCategory, langsForPost,
} from '../src/lib/blogContent.js';
import { plainText } from '../src/lib/blogMd.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ORIGIN = 'https://theedgecat.com';
const today = new Date().toISOString().slice(0, 10);

const BLOG_META = {
  uk: {
    title: 'Блог The Edge — психологія, ризик і статистика трейдера',
    description: 'Статті про торгову психологію, ризик-менеджмент, пропфірми й статистику журналу угод. Без води, з прикладами.',
  },
  en: {
    title: 'The Edge blog — trading psychology, risk and journal stats',
    description: 'Articles on trading psychology, risk management, prop firms and trade-journal statistics. No filler, with examples.',
  },
};


/* Текст статті секціями: кожен «## » стає H2 у HTML для робота.
   Раніше вся стаття йшла одним <p>, і аудит бачив сторінку без жодного
   H2 — хоча в самому блозі заголовки є. Обрізаємо сумарно до 6000
   символів: для індексу досить, а HTML не роздувається. */
const sectionsOf = (md, limit = 6000) => {
  const out = [];
  let cur = { h2: '', md: [] };
  for (const line of String(md || '').split('\n')) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) { out.push(cur); cur = { h2: m[1].trim(), md: [] }; } else cur.md.push(line);
  }
  out.push(cur);
  let left = limit;
  return out
    .map((x) => ({ h2: x.h2, text: plainText(x.md.join('\n')).trim() }))
    .filter((x) => x.h2 || x.text)
    .map((x) => { const text = x.text.slice(0, Math.max(0, left)); left -= text.length; return { ...x, text }; })
    .filter((x) => x.h2 || x.text);
};

/* hreflang x-default: куди слати тих, чия мова не серед наших.
   Є англійська версія — на неї, інакше на ту, що є. */
const withXDefault = (alts) => {
  if (!alts?.length) return alts;
  const def = alts.find((a) => a.lang === 'en') || alts[0];
  return [...alts, { lang: 'x-default', href: def.href }];
};

const routes = {};
const sitemap = [];
const addUrl = (loc, priority, changefreq, lastmod) =>
  sitemap.push({ loc: ORIGIN + loc, priority, changefreq, lastmod });

addUrl('/', '1.0', 'weekly', today);

/* Головна. Заголовок і опис уже стоять в index.html — тут тільки
   текст сторінки для робота. Лендінг малює JS, і до його виконання
   пошуковик бачив порожній <div id="root">: жодного слова з того, за
   чим нас шукають («торговий журнал», «журнал трейдера», «автоімпорт
   з MT5»). Текст — стислий переказ того, що справді є на лендінгу,
   без обіцянок, яких там немає. */
routes['/'] = {
  title: 'Торговий журнал трейдера з автоімпортом з MT5 — THE EDGE',
  description: 'Торговий журнал трейдера безкоштовно. Автоімпорт угод з MetaTrader 5 (Pro, 14 днів безкоштовно), статистика в R, win rate, аналітика по сесіях і розбір помилок.',
  canonical: `${ORIGIN}/`,
  lang: 'uk',
  body: {
    h1: 'Торговий журнал трейдера з автоімпортом угод з MetaTrader 5',
    text: 'THE EDGE — щоденник трейдера, який сам рахує статистику: R-мультиплікатор, win rate, profit factor, просадку, результати по сесіях (Азія, Лондон, Нью-Йорк), активах і сетапах.',
    sections: [
      { h2: 'Автоімпорт угод з MetaTrader 5', text: 'Угоди приїжджають у журнал самі — зі стопами, тейками, свічками навколо входу й часом у ринку. Підтримуються проп-фірми FTMO, The5ers, Alpha Capital, Blue Guardian, FundingPips, CryptoFundTrader і будь-який стандартний MT5.' },
      { h2: 'Журнал помилок і бектест', text: 'Журнал помилок показує, які звички зливають депозит; бектест проганяє стратегію по історії з тими самими метриками. Незабаром — AI-кіт, який розбиратиме твої угоди й шукатиме систематичні помилки.' },
      { h2: 'Ціни', text: 'Безкоштовна версія — назавжди. Pro — $15 на місяць, перші 14 днів безкоштовно, лише привʼязка картки.' },
    ],
    links: [
      { href: '/uk/blog', text: 'Блог: психологія, ризик і статистика трейдера' },
      ...postsFor('uk').slice(0, 5).map((p) => ({ href: `/uk/blog/${p.slug}`, text: p.title })),
      { href: '/terms', text: 'Умови, ціни й повернення коштів' },
      { href: '/en', text: 'English version' },
    ],
  },
};

/* Англійська головна. Окрема адреса, а не та сама / з іншим текстом:
   Google показує в кожній країні ту версію, що на неї вказує hreflang,
   а для цього в кожної мови має бути своя адреса. x-default — куди
   вести тих, чия мова не українська й не англійська: на англійську. */
const HOME_ALTERNATES = [
  { lang: 'uk', href: `${ORIGIN}/` },
  { lang: 'en', href: `${ORIGIN}/en` },
  { lang: 'x-default', href: `${ORIGIN}/en` },
];
routes['/'].alternates = HOME_ALTERNATES;

routes['/en'] = {
  title: 'Trading Journal with MetaTrader 5 Auto-Import — THE EDGE',
  description: 'Free trading journal with MetaTrader 5 auto-import: R-multiple stats, win rate, session analytics and mistake tracking. 14-day free Pro trial.',
  canonical: `${ORIGIN}/en`,
  lang: 'en',
  locale: 'en_US',
  imageAlt: 'THE EDGE — trading journal for traders',
  alternates: HOME_ALTERNATES,
  replaceLd: true,
  jsonLd: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organization`,
        name: 'THE EDGE',
        alternateName: 'The Edge trading journal',
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/edge-logo.png`,
        sameAs: ['https://www.instagram.com/theedge.space/', 'https://t.me/theedgejournal'],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'THE EDGE',
        alternateName: 'The Edge trading journal',
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        inLanguage: 'en',
        url: `${ORIGIN}/en`,
        description: 'Trading journal with automatic MetaTrader 5 trade import, analytics by session, asset and setup, prop firm account tracking and an AI coach (in development).',
        offers: [
          { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Pro monthly', price: '15', priceCurrency: 'USD' },
          { '@type': 'Offer', name: 'Pro yearly', price: '144', priceCurrency: 'USD' },
        ],
        publisher: { '@id': `${ORIGIN}/#organization` },
      },
    ],
  },
  body: {
    h1: 'Trading journal with automatic MetaTrader 5 trade import',
    text: 'THE EDGE is a trading journal that does the math for you: R-multiple, win rate, profit factor, drawdown, and results by session (Asia, London, New York), asset and setup.',
    sections: [
      { h2: 'MetaTrader 5 auto-import', text: 'Trades arrive in the journal on their own — with stops, targets, candles around the entry and time in the market. Works with prop firms such as FTMO, The5ers, Alpha Capital, Blue Guardian, FundingPips, CryptoFundTrader and any standard MT5 account. The connection uses the read-only investor password.' },
      { h2: 'Mistakes log and backtesting', text: 'A mistakes log shows which habits drain the account; the backtester runs a strategy over history with the same metrics. Coming soon: an AI cat coach that reviews your trades and finds systematic mistakes.' },
      { h2: 'Pricing', text: 'Free plan — forever. Pro — $15 a month or $144 a year, with the first 14 days free.' },
    ],
    links: [
      { href: '/en/blog', text: 'Blog: trading psychology, risk and journal statistics' },
      ...postsFor('en').slice(0, 5).map((p) => ({ href: `/en/blog/${p.slug}`, text: p.title })),
      { href: '/', text: 'Українська версія' },
    ],
  },
};
addUrl('/en', '1.0', 'weekly', today);

routes['/terms'] = {
  title: 'Умови користування — The Edge',
  description: 'Публічна оферта Edge Journal: підписка, оплата, пробний період і повернення коштів, реквізити продавця.',
  canonical: `${ORIGIN}/terms`,
  lang: 'uk',
  body: {
    h1: 'Умови користування The Edge',
    text: 'Публічна оферта Edge Journal: як працює підписка, оплата й пробний період, як скасувати підписку і повернути кошти, реквізити продавця.',
    links: [{ href: '/', text: 'Головна: торговий журнал THE EDGE' }, { href: '/uk/blog', text: 'Блог' }],
  },
};
addUrl('/terms', '0.3', 'yearly');

for (const lang of BLOG_LANGS) {
  const posts = postsFor(lang);
  const meta = BLOG_META[lang] || BLOG_META.uk;
  const listPath = `/${lang}/blog`;

  routes[listPath] = {
    ...meta,
    canonical: ORIGIN + listPath,
    lang,
    alternates: withXDefault(BLOG_LANGS.map((l) => ({ lang: l, href: `${ORIGIN}/${l}/blog` }))),
    body: {
      h1: meta.title,
      text: meta.description,
      /* Категорії окремим блоком: раніше на них не вело жодне посилання,
         і аудит показував їх «без вхідних посилань». */
      groups: [
        {
          h2: lang === 'en' ? 'Categories' : 'Категорії',
          links: CATEGORIES.filter((c) => (postsInCategory(lang, c.id) || []).length)
            .map((c) => ({ href: `${listPath}/category/${c.slug}`, text: c.title[lang] || c.title.uk })),
        },
        { h2: lang === 'en' ? 'Articles' : 'Статті', links: posts.map((p) => ({ href: `${listPath}/${p.slug}`, text: p.title })) },
      ],
    },
  };
  addUrl(listPath, '0.8', 'weekly', posts[0]?.date || today);

  for (const cat of CATEGORIES) {
    const inCat = postsInCategory(lang, cat.id) || [];
    if (!inCat.length) continue;
    const p = `${listPath}/category/${cat.slug}`;
    const title = cat.title[lang] || cat.title.uk;
    routes[p] = {
      title: `${title} — блог The Edge`,
      description: cat.blurb[lang] || cat.blurb.uk,
      canonical: ORIGIN + p,
      lang,
      body: {
        h1: title,
        text: cat.blurb[lang] || cat.blurb.uk,
        links: inCat.map((x) => ({ href: `${listPath}/${x.slug}`, text: x.title })),
      },
    };
    addUrl(p, '0.5', 'weekly');
  }

  for (const post of posts) {
    const p = `${listPath}/${post.slug}`;
    const title = post.seo?.title || post.title;
    const description = post.seo?.description || post.excerpt;
    // hreflang: сама стаття плюс переклади (translations: { мова: slug }).
    const alternates = langsForPost(post).filter((l) => BLOG_LANGS.includes(l)).map((l) => ({
      lang: l,
      href: `${ORIGIN}/${l}/blog/${l === post.lang ? post.slug : post.translations[l]}`,
    }));

    routes[p] = {
      /* Google обрізає заголовок десь після 60 символів, і аудит лічить
         довші як помилку. Назву бренду дописуємо, лише коли влазить. */
      title: `${title} — The Edge`.length <= 60 ? `${title} — The Edge` : title,
      description: description.length > 158 ? `${description.slice(0, 155).replace(/\s+\S*$/, '')}…` : description,
      canonical: ORIGIN + p,
      lang,
      type: 'article',
      published: post.date,
      alternates: withXDefault(alternates),
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description,
        datePublished: post.date,
        inLanguage: lang,
        mainEntityOfPage: ORIGIN + p,
        publisher: { '@type': 'Organization', name: 'The Edge', url: ORIGIN },
      },
      body: {
        h1: post.title,
        text: post.excerpt,
        // Текст статті — щоб робот бачив зміст, а не лише заголовок.
        // Обрізаємо: для індексу вистачає, а HTML не роздувається.
        sections: sectionsOf(post.body),
        links: [
          ...CATEGORIES.filter((c) => (postsInCategory(lang, c.id) || []).some((x) => x.slug === post.slug))
            .map((c) => ({ href: `${listPath}/category/${c.slug}`, text: c.title[lang] || c.title.uk })),
          { href: listPath, text: lang === 'en' ? 'All articles' : 'Усі статті блогу' },
        ],
      },
    };
    addUrl(p, '0.7', 'monthly', post.date);
  }
}

fs.writeFileSync(path.join(DIST, 'seo-routes.json'), JSON.stringify(routes));

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemap.map((u) => [
    '  <url>',
    `    <loc>${u.loc}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
    `    <changefreq>${u.changefreq}</changefreq>`,
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')),
  '</urlset>',
  '',
].join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml);

console.log(`seo: ${Object.keys(routes).length} сторінок з тегами, ${sitemap.length} адрес у sitemap`);
