import { C, F, Cat } from './base';
import Steps from './Steps';
import Difference from './Difference';
import AutoImport from './AutoImport';
import Product from './Product';
import Coach from './Coach';
import { Rhythm, NotDoing, Pricing, FinalFaq } from './Closing';
import { OWNER } from '../../../lib/terms';

/* ==================================================================
   Усе, що нижче першого екрана.

   Винесено сюди з однієї причини: на телефоні браузер не малював
   нічого, поки React не збирав усю сторінку цілком — а це дев'ять
   секцій і майже тисяча вузлів. Перший піксель через це чекав
   чотири секунди на повільному 4G, хоча людина в цей момент бачила
   б тільки заголовок.

   Тепер герой малюється сам по собі, а ці блоки приходять окремим
   шматком і рендеряться після першого кадру.

   Чому не по скролу, як роблять зазвичай: пошуковий робот не гортає
   сторінку. Зав'язати появу на IntersectionObserver означало б
   сховати від нього ціни, питання й опис продукту. Тому блоки
   приходять самі, просто трохи згодом — для читача різниці немає,
   бо все одно лежать за межею екрана.

   Підвал теж тут: якби він малювався одразу, то на секунду встав би
   упритул під героєм, а потім поїхав вниз, коли приїде решта.
================================================================== */

const FOOTER_COLS = [
  { title: 'ПРОДУКТ', links: [['#product', 'Що всередині'], ['#autoimport', 'Автоімпорт'], ['#coach', 'AI-коуч']] },
  { title: 'ТАРИФИ', links: [['#pricing', 'Ціни'], ['#pricing', 'Free'], ['#pricing', 'Pro']] },
  { title: 'ДОВІДКА', links: [['#faq', 'Питання'], ['/uk/blog', 'Блог'], ['#autoimport', 'Твої дані'], ['#faq', 'Підключення MT5']] },
  /* Окрема колонка, а не рядок дрібним шрифтом унизу. Умови шукають
     тоді, коли вже щось сталося, — і знаходити їх мають там, де
     шукають решту посилань, а не в підвалі підвалу. */
  { title: 'ПРАВО', links: [['/terms', 'Публічна оферта'], ['/terms#billing', 'Оплата і повернення коштів'], ['/terms#contacts', 'Контакти']] },
];

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', background: '#0a0a0e' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 32px', display: 'flex', gap: 44, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 1 250px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Cat size={34} />
            <div>
              <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 14.5, letterSpacing: '2.2px', color: '#fff' }}>
                THE <span style={{ color: C.acc }}>EDGE</span>
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '1.5px', color: C.dim, marginTop: 3 }}>
                PLAN THE TRADE — TRADE THE PLAN
              </div>
            </div>
          </div>
        </div>

        {FOOTER_COLS.map((col) => (
          <div key={col.title} style={{ flex: '0 1 150px' }}>
            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '1.6px', color: C.dim, marginBottom: 14 }}>{col.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.links.map(([href, label]) => (
                <a
                  key={label}
                  href={href}
                  style={{ fontFamily: F.sans, fontSize: 13.5, color: '#8a8a9c', transition: 'color .16s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.accSoft; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#8a8a9c'; }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        ))}

        <div style={{ flex: '0 1 150px', textAlign: 'right', fontFamily: F.mono, fontSize: 12, color: C.dim }}>
          © 2026 Edge Journal
        </div>
      </div>

      {/* Реквізити продавця. Платіжні сервіси й банки перевіряють їх
          на сайті перед підключенням, а покупцю вони потрібні, щоб
          знати, з ким укладає договір. Показуємо лише заповнене:
          заглушка {{…}} на сайті гірша за відсутній рядок. */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px 28px', fontFamily: F.sans, fontSize: 12, lineHeight: 1.7, color: '#5d5d70' }}>
        {[
          OWNER.name,
          OWNER.code && `РНОКПП ${OWNER.code}`,
          OWNER.tax,
          OWNER.address,
          OWNER.iban && `IBAN ${OWNER.iban}`,
          OWNER.email,
          OWNER.phone,
        ].filter((v) => v && !String(v).includes('{{')).join(' · ')}
      </div>
    </footer>
  );
}

export default function BelowFold() {
  return (
    <>
      <Steps />
      <Difference />
      <AutoImport />
      <Product />
      <Coach />
      <Rhythm />
      <NotDoing />
      <Pricing />
      <FinalFaq />
      <Footer />
    </>
  );
}
