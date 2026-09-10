import { useEffect } from 'react';

/* ==================================================================
   БЛОГ — теги сторінки.

   Повноцінний SEO буде пізніше, коли сторінки почнуть віддаватись
   з сервера: зараз сайт — SPA, і робот бачить порожній div. Але
   заголовок вкладки, опис, канонічна адреса й hreflang мають бути
   правильними вже тепер — з двох причин.

   Перша: рендерер Google усе-таки виконує JS, і ці теги він
   побачить. Друга й важливіша: коли з'явиться серверний рендер,
   він братиме рівно ці ж поля з даних статті. Тобто зараз ми
   заповнюємо структуру, а не робимо тимчасовий костур.

   Усе, що ставить цей хук, він за собою і прибирає: інакше опис
   статті лишався б висіти на сторінці списку.
================================================================== */

const upsert = (selector, create) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    el.dataset.blogMeta = '1';
    document.head.append(el);
  }
  return el;
};

const meta = (name, content, attr = 'name') => {
  if (!content) return;
  const el = upsert(`meta[${attr}="${name}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute(attr, name);
    return m;
  });
  el.setAttribute('content', content);
};

export function useDocumentMeta({
  title,
  description,
  canonical,
  lang = 'uk',
  type = 'website',
  published,
  alternates = [],
  jsonLd = null,
}) {
  useEffect(() => {
    const prevTitle = document.title;
    const prevLang = document.documentElement.lang;

    if (title) document.title = title;
    document.documentElement.lang = lang;

    meta('description', description);
    meta('og:title', title, 'property');
    meta('og:description', description, 'property');
    meta('og:type', type, 'property');
    meta('twitter:card', 'summary_large_image');
    if (canonical) meta('og:url', canonical, 'property');
    if (published) meta('article:published_time', published, 'property');

    if (canonical) {
      const link = upsert('link[rel="canonical"]', () => {
        const l = document.createElement('link');
        l.rel = 'canonical';
        return l;
      });
      link.href = canonical;
    }

    /* hreflang: перекладів мало, тому щоразу перестворюємо весь
       набір — це дешевше, ніж звіряти наявні теги з новими. */
    document.head.querySelectorAll('link[data-blog-alt]').forEach((n) => n.remove());
    alternates.forEach(({ lang: l, href }) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = l;
      link.href = href;
      link.dataset.blogAlt = '1';
      document.head.append(link);
    });

    /* Розмітка статті для пошуковика. Окремим теґом, який живе рівно
       стільки, скільки сторінка. */
    document.getElementById('blog-jsonld')?.remove();
    if (jsonLd) {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = 'blog-jsonld';
      s.textContent = JSON.stringify(jsonLd);
      document.head.append(s);
    }

    return () => {
      document.title = prevTitle;
      document.documentElement.lang = prevLang;
      document.head.querySelectorAll('link[data-blog-alt]').forEach((n) => n.remove());
      document.getElementById('blog-jsonld')?.remove();
    };
  }, [title, description, canonical, lang, type, published, alternates, jsonLd]);
}

/* Адреса сайту потрібна канонічним посиланням. Беремо з поточного
   походження, щоб прев'ю не показувало продакшн-домен, коли людина
   дивиться локальну збірку. */
export const siteOrigin = () => (typeof window === 'undefined' ? '' : window.location.origin);
