import { useEffect, useState } from 'react';
import { Inbox, Plug, PenLine, Eye, Zap, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import useOnboardAnswers from '../../hooks/useOnboardAnswers';
import { openSettings } from '../../lib/settings';
import { T } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/pulse';
import { noAutoImport, platformName, demoUrl, markDemoSeen } from '../../lib/onboard';
import Button from '../ui/Button';
import QuickTrade from './QuickTrade';
import { openTableImport } from '../journal/TableImportModal';

/* Журнал без жодної угоди: замість «нічого не знайдено» — перша дія.
   Для MT5 головна кнопка «Підключити», для інших платформ — ручне
   внесення. Якщо MT5 уже підключено, чесно кажемо, що угоди їдуть. */
export default function JournalEmpty({ onAdd, onSaved, quickOpen = false }) {
  const { user } = useAuth();
  const answers = useOnboardAnswers();
  const [mt5, setMt5] = useState(0);
  const [quick, setQuick] = useState(quickOpen);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('mt5_accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => setMt5(count || 0)).catch(() => {});
  }, [user?.id]);

  const manual = noAutoImport(answers);
  const demo = () => { markDemoSeen(); track('demo_opened', { from: 'journal_empty' }); window.location.assign(demoUrl('analytics')); };

  let title = tx('Тут з\'являться твої угоди', 'Your trades will appear here');
  let text = tx('Підключи MT5, і вони підтягнуться самі.', 'Connect MT5 and they will sync on their own.');
  if (mt5) text = tx('MT5 підключено. Перші угоди підтягнуться за кілька хвилин, а поки можеш внести угоду вручну.', 'MT5 is connected. The first trades will sync in a few minutes; meanwhile you can log a trade manually.');
  else if (manual) text = tx(`Автоімпорту з ${platformName(answers.platform)} поки немає. Внеси угоду вручну: це хвилина. Повідомимо, коли підключимо твою платформу.`, `There is no auto-import from ${platformName(answers.platform)} yet. Log a trade manually, it takes a minute. We will let you know when we add your platform.`);

  const mt5First = !manual && !mt5;

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Inbox size={30} strokeWidth={1.6} style={{ color: T.text3 }} />
      <div className="text-[18px] font-bold" style={{ fontFamily: T.display, color: T.text }}>{title}</div>
      <p className="m-0 max-w-[440px] text-[14px] leading-[1.6]" style={{ fontFamily: T.sans, color: T.text3 }}>{text}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {mt5First && <Button variant="primary" icon={Plug} onClick={() => openSettings('connect')}>{tx('Підключити MT5', 'Connect MT5')}</Button>}
        {/* Без MT5 швидка форма — головна дія: повна форма з розбором
            для першої угоди занадто довга. */}
        {!quick && <Button variant={mt5First ? 'secondary' : 'primary'} icon={Zap} onClick={() => setQuick(true)}>{tx('Швидка угода', 'Quick trade')}</Button>}
        <Button variant="ghost" icon={PenLine} onClick={onAdd}>{tx('Повна форма', 'Full form')}</Button>
        {/* Хто вже вів журнал деінде — переносить історію файлом. */}
        <Button variant="ghost" icon={Upload} onClick={() => { track('table_import_open', { from: 'journal_empty' }); openTableImport(); }}>{tx('З Notion чи таблиці', 'From Notion or a sheet')}</Button>
        <Button variant="ghost" icon={Upload} onClick={() => window.dispatchEvent(new Event('edge:import-trades'))}>{tx('Звіт MT5 / брокера', 'MT5 / broker report')}</Button>
        <Button variant="ghost" icon={Eye} onClick={demo}>{tx('Подивитись приклад', 'See an example')}</Button>
      </div>
      {quick && <QuickTrade onSaved={onSaved} />}
    </div>
  );
}
