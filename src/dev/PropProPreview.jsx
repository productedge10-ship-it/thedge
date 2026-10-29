import PropRulesPro from '../components/accounts/PropRulesPro';
import PageHeader from '../components/ui/PageHeader';

/* Лише npm run dev: вітрина Pro без входу — подивитись дизайн (/dev/prop-pro). */
export default function PropProPreview() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--edge-bg, #0b0b0f)' }}>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader kicker="Рахунки" title="Правила мого пропа" subtitle="Новини, на яких твій проп забороняє торгувати, ліміти рахунку і перевірка угод." />
        <PropRulesPro />
      </div>
    </div>
  );
}
