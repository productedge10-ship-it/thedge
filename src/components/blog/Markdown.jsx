import { Fragment } from 'react';
import { inline } from '../../lib/blogMd';
import { resolveSrc } from '../../lib/blogImages';
import ImageSlider from '../ui/ImageSlider';

/* ==================================================================
   БЛОГ — малювання розібраного тексту.

   Парсер (lib/blogMd.js) віддає дерево з простих об'єктів, цей файл
   перетворює його на розмітку. Розділення потрібне не заради краси:
   зміст статті бере заголовки з того самого дерева, тому якорі в
   змісті й у тексті фізично не можуть розійтись.

   Жодних dangerouslySetInnerHTML: текст статті колись поїде з
   адмінки, і єдина причина, чому це буде безпечно, — те, що HTML
   звідти ніколи не потрапляє на сторінку як HTML.
================================================================== */

function Inline({ text }) {
  return (
    <>
      {inline(text).map((tok, i) => {
        if (tok.t === 'b') return <strong key={i}>{tok.text}</strong>;
        if (tok.t === 'i') return <em key={i}>{tok.text}</em>;
        if (tok.t === 'code') return <code key={i}>{tok.text}</code>;
        if (tok.t === 'mark') return <mark key={i} className="bl-mark">{tok.text}</mark>;
        if (tok.t === 'a') {
          /* Зовнішні посилання відкриваються поруч і без передачі
             реферера: стаття не має права забирати вкладку, у якій
             людина читала. */
          const external = /^https?:/.test(tok.href);
          return (
            <a
              key={i}
              href={tok.href}
              {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
            >
              {tok.text}
            </a>
          );
        }
        return <Fragment key={i}>{tok.text}</Fragment>;
      })}
    </>
  );
}

/* ------------------------------------------------------------------
   Ілюстрація.

   Перегляд картинок не свій, а той самий ImageSlider, що в журналі
   угод, розборах і бектестах: клік відкриває кадр на весь екран,
   кнопка (або клавіша Z) вмикає лупу, кілька кадрів гортаються
   стрілками. Писати для блогу другий переглядач означало б, що
   правку в лупі треба робити двічі й у другому місці про неї
   забудуть.

   Заглушки приходять сюди вже картинками (lib/blogImages.js), тому
   слайдер не знає й не має знати, що малюнка ще немає.
------------------------------------------------------------------ */
function Figure({ caption, srcs = [], vars }) {
  const images = srcs.map((s) => resolveSrc(s, { hint: caption, vars }));
  if (!images.length) return null;
  return (
    <figure className="bl-fig">
      <div className="bl-fig-frame">
        <ImageSlider images={images} containerClassName="h-full w-full" />
      </div>
      {(caption || images.length > 1) && (
        <figcaption>
          {images.length > 1 && (
            <span className="bl-fig-badge">СЛАЙДЕР · {images.length}</span>
          )}
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export default function Markdown({ blocks, vars }) {
  return (
    <div className="bl-prose">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h':
            return b.level === 2
              ? <h2 key={i} id={b.id}>{b.text}</h2>
              : <h3 key={i} id={b.id}>{b.text}</h3>;

          case 'p':
            return <p key={i}><Inline text={b.text} /></p>;

          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}
              </ul>
            );

          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}
              </ol>
            );

          case 'quote':
            return <blockquote key={i}><Inline text={b.text} /></blockquote>;

          case 'callout':
            return (
              <aside key={i} className="bl-callout" data-kind={b.kind}>
                {b.title && <span className="bl-callout-t">{b.title}</span>}
                {b.paras.map((p, j) => <p key={j}><Inline text={p} /></p>)}
              </aside>
            );

          case 'figure':
            return <Figure key={i} caption={b.caption} srcs={b.srcs} vars={vars} />;

          case 'table':
            return (
              <div key={i} className="bl-tablewrap">
                <table>
                  <thead>
                    <tr>{b.head.map((c, j) => <th key={j}><Inline text={c} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j}>{row.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'code':
            return <pre key={i}><code>{b.text}</code></pre>;

          case 'hr':
            return <hr key={i} />;

          default:
            return null;
        }
      })}
    </div>
  );
}
