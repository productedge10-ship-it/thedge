import PropRulesHub from '../components/accounts/PropRulesHub';
import PageHeader from '../components/ui/PageHeader';

/* Лише npm run dev: хаб правил без входу — подивитись дизайн (/dev/prop-hub). */
export default function PropHubPreview() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--edge-bg, #0b0b0f)' }}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader kicker="Рахунки" title="Правила мого пропа" subtitle="Новини, на яких твій проп забороняє торгувати, його правила і що в них змінилось." />
        <PropRulesHub />
      </div>
    </div>
  );
}
