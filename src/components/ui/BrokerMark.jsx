import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';

/* Знак проп-фірми: свій svg з public/props → іконка з brokers.js → монограма.
   Винесено з SettingsModal, щоб ним користувалась і сторінка правил пропа. */
const MARK_SOURCES = [
  /* Свій файл завжди головніший: поклав вектор — він і показується. */
  (b) => `/props/${b.id}.svg`,
  /* Далі те, що вказано для цієї конкретної фірми. Спільного правила
     тут навмисно немає — див. коментар у brokers.js. */
  (b) => b.icon || null,
];

export default function BrokerMark({ broker, size = 26 }) {
  const [step, setStep] = useState(0);

  /* Скидаємо при зміні пропа: інакше один відсутній логотип назавжди
     вимикав би картинку для всіх наступних. */
  useEffect(() => setStep(0), [broker.id]);

  /* Наступне джерело, яке взагалі має що дати. Пропи без домену
     проскакують одразу до монограми, не витрачаючи двох запитів у
     нікуди. */
  const src = (() => {
    for (let i = step; i < MARK_SOURCES.length; i += 1) {
      const url = MARK_SOURCES[i](broker);
      if (url) return { url, at: i };
    }
    return null;
  })();

  if (!src) {
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.3,
          background: `${broker.tint}22`,
          border: `1px solid ${broker.tint}55`,
          fontFamily: T.sans,
          fontSize: size * 0.42,
          fontWeight: 800,
          letterSpacing: '-.02em',
          color: broker.tint,
        }}
      >
        {broker.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: broker.plate === 'light' ? '#fff' : T.sunken,
        border: `1px solid ${broker.plate === 'light' ? 'rgba(255,255,255,0.12)' : T.line}`,
      }}
    >
      <img
        key={src.at}
        src={src.url}
        alt=""
        loading="lazy"
        onError={() => setStep(src.at + 1)}
        style={{
          /* Світлий знак майже на всю плашку: у таких логотипів уже є
             власні поля, і додавати до них наші означає отримати
             крихітну цятку посеред білого квадрата.

             Темна плашка — навпаки, як було: там знак уже має власний
             фон, і впритул до країв він виглядав би обрізаним. */
          width: broker.plate === 'light' ? size - 5 : size - 8,
          height: broker.plate === 'light' ? size - 5 : size - 8,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </span>
  );
}
