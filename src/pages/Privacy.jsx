import { LegalPage } from './Terms';
import { PRIVACY, PRIVACY_VERSION } from '../lib/privacy';

/* Політика конфіденційності — та сама верстка, що й Умови. */
export default function Privacy() {
  return (
    <LegalPage
      sections={PRIVACY}
      version={PRIVACY_VERSION}
      title="Політика конфіденційності"
      summary="Ми зберігаємо лише те, що потрібно для роботи журналу. Не продаємо дані й не передаємо їх рекламодавцям. Пароль MT5 інвесторський і зашифрований. Видалити акаунт і всі дані можна на запит у будь-який момент."
    />
  );
}
