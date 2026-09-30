import { C, F, Cat } from './base';
import Steps from './Steps';
import Difference from './Difference';
import AutoImport from './AutoImport';
import Product from './Product';
import Coach from './Coach';
import { Rhythm, NotDoing, Pricing, FinalFaq } from './Closing';
import { OWNER } from '../../../lib/terms';
import { useLang, useTx, pick } from './lang';

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

const FOOTER_COLS = {
  uk: [
  { title: 'ПРОДУКТ', links: [['#product', 'Що всередині'], ['#autoimport', 'Автоімпорт'], ['#coach', 'AI-коуч']] },
  { title: 'ТАРИФИ', links: [['#pricing', 'Ціни'], ['#pricing', 'Free'], ['#pricing', 'Pro']] },
  { title: 'ДОВІДКА', links: [['#faq', 'Питання'], ['/uk/blog', 'Блог'], ['#autoimport', 'Твої дані'], ['#faq', 'Підключення MT5']] },
  /* Окрема колонка, а не рядок дрібним шрифтом унизу. Умови шукають
     тоді, коли вже щось сталося, — і знаходити їх мають там, де
     шукають решту посилань, а не в підвалі підвалу. */
  { title: 'ПРАВО', links: [['/terms', 'Публічна оферта'], ['/terms#billing', 'Оплата і повернення коштів'], ['/terms#contacts', 'Контакти']] },
  ],
  /* Умови поки лише українською — підпис чесно каже про це. */
  en: [
    { title: 'PRODUCT', links: [['#product', 'What’s inside'], ['#autoimport', 'Auto-import'], ['#coach', 'AI coach']] },
    { title: 'PLANS', links: [['#pricing', 'Pricing'], ['#pricing', 'Free'], ['#pricing', 'Pro']] },
    { title: 'HELP', links: [['#faq', 'FAQ'], ['/en/blog', 'Blog'], ['#autoimport', 'Your data'], ['#faq', 'Connecting MT5']] },
    { title: 'LEGAL', links: [['/terms', 'Terms of service (UA)'], ['/terms#billing', 'Payments and refunds (UA)'], ['/terms#contacts', 'Contacts']] },
  ],
};

/* Де нас знайти. Іконки намальовані тут, а не взяті з lucide: у
   першій версії бібліотеки логотипи брендів прибрали зовсім.

   Кнопки з підписом, а не голі значки: дві іконки Telegram поруч
   (канал і підтримка) без тексту неможливо розрізнити. */
const TG_PATH = 'M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.7.2 1.4 1.4Z';

const SOCIAL = [
  {
    href: 'https://t.me/theedgejournal',
    label: 'Telegram-канал',
    labelEn: 'Telegram channel',
    track: 'footer.telegram',
    icon: <path d={TG_PATH} fill="currentColor" />,
  },
  {
    href: 'https://www.instagram.com/theedge.space/',
    label: 'Instagram',
    labelEn: 'Instagram',
    track: 'footer.instagram',
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  {
    href: 'https://t.me/thedgesupport',
    label: 'Підтримка',
    labelEn: 'Support',
    track: 'footer.support',
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <path d="M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2ZM20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
        <path d="M17 18c0 1.7-1.8 3-5 3" />
      </g>
    ),
  },
];

function Social() {
  const lang = useLang();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      {SOCIAL.map((s) => (
        <a
          key={s.href}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          data-track={s.track}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            width: 'fit-content',
            padding: '7px 12px 7px 10px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.08)',
            background: 'rgba(255,255,255,.02)',
            fontFamily: F.sans,
            fontSize: 13,
            color: '#a6a6b8',
            transition: 'color .16s, border-color .16s, background .16s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.borderColor = 'rgba(139,123,255,.45)';
            e.currentTarget.style.background = 'rgba(139,123,255,.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#a6a6b8';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)';
            e.currentTarget.style.background = 'rgba(255,255,255,.02)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">{s.icon}</svg>
          {lang === 'en' ? s.labelEn : s.label}
        </a>
      ))}
    </div>
  );
}

function Footer() {
  const lang = useLang();
  const tx = useTx();
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
          <Social />
        </div>

        {pick(lang, FOOTER_COLS).map((col) => (
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
          OWNER.code && `${tx('РНОКПП', 'Tax ID')} ${OWNER.code}`,
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
