import { useEffect, useRef, useState } from 'react';

/* ==================================================================
   Текст, який «розшифровується».

   Кожна літера спершу мигає випадковим гліфом і аж потім стає собою —
   зліва направо, ніби рядок приходить по каналу і збирається на очах.

   Чому саме так, а не «текст зникає при ховері»: підпис кнопки — це
   єдине, що каже, куди вона веде. Прибрати його заради анімації
   означає на пів секунди залишити людину без відповіді на питання
   «а що станеться, якщо натиснути». Тут підпис нікуди не дівається,
   він лише міняє вигляд — і саме ця зміна і є анімацією.

   Пробіли не шифруємо. Без цього слово перестає бути словом і рядок
   читається як суцільний шум — а шум має бути тлом, не текстом.

   Цикл живе тільки поки він потрібен: `active` змінився — порахували
   свої двадцять кадрів і зупинились. Вічного rAF тут немає, інакше
   кнопка в хедері гріла б батарею просто тим, що існує.
================================================================== */

const GLYPHS = '@#$%&*+=<>/\\|[]{}~^ABCDEFXYZ0123456789';

const rnd = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

export default function AsciiDecode({ text, alt, active = false, step = 26, className, style }) {
  const target = active ? (alt ?? text) : text;
  const [out, setOut] = useState(target);

  /* Ціль тримаємо в ref: цикл читає її щокадру, і якщо людина
     смикнула мишею туди-сюди, він доганяє нову ціль замість того,
     щоб дописати стару й лише потім почати спочатку. */
  const goal = useRef(target);
  const raf = useRef(0);

  useEffect(() => { goal.current = target; }, [target]);

  useEffect(() => {
    let done = 0;
    let last = 0;
    let stop = false;

    const tick = (now) => {
      if (stop) return;
      if (now - last >= step) {
        last = now;
        done += 1;

        const t = goal.current;
        if (done >= t.length) {
          setOut(t);
          return;
        }

        let s = '';
        for (let i = 0; i < t.length; i += 1) {
          s += i < done || t[i] === ' ' ? t[i] : rnd();
        }
        setOut(s);
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      stop = true;
      cancelAnimationFrame(raf.current);
    };
  }, [target, step]);

  return <span className={className} style={style}>{out}</span>;
}
