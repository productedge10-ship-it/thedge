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

const routes = {};
const sitemap = [];
const addUrl = (loc, priority, changefreq, lastmod) =>
  sitemap.push({ loc: ORIGIN + loc, priority, changefreq, lastmod });

addUrl('/', '1.0', 'weekly', today);

routes['/terms'] = {
  title: 'Умови користування — The Edge',
  description: 'Публічна оферта Edge Journal: підписка, оплата, пробний період і повернення коштів, реквізити продавця.',
  canonical: `${ORIGIN}/terms`,
  lang: 'uk',
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
    alternates: BLOG_LANGS.map((l) => ({ lang: l, href: `${ORIGIN}/${l}/blog` })),
    body: {
      h1: meta.title,
      text: meta.description,
      links: posts.map((p) => ({ href: `${listPath}/${p.slug}`, text: p.title })),
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
      title: `${title} — The Edge`,
      description,
      canonical: ORIGIN + p,
      lang,
      type: 'article',
      published: post.date,
      alternates,
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
        article: plainText(post.body || '').slice(0, 6000),
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
