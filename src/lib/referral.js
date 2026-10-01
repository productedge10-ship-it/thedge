import { supabase } from './supabase';

/* ==================================================================
   Реферальна програма — клієнтська частина.

   Гроші тут не рахуються: суму оплати зі знижкою чи кредитом
   вирішує сервер (_mono.mjs → referralTerms), відсоток запрошувачу
   нараховує база (referral_on_paid). Браузер лише:
     1. запамʼятовує код з адреси ?ref=XXXX до моменту входу;
     2. після входу один раз закріплює його (claim_referral);
     3. показує людині її посилання й шкалу.
================================================================== */

const KEY = 'edge_ref';
/* Скільки код живе в браузері. Прийшов за посиланням, подумав
   тиждень і зареєструвався — це все ще той самий запрошувач. */
const TTL_MS = 30 * 24 * 3600 * 1000;
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

/* Ставка звичайного юзера — завжди 10% з першої оплати друга.
   Дзеркало ref_tier_percent у supabase/2026-10-01_referrals.sql. */
export const REF_USER_PERCENT = 10;

export const refLink = (code) =>
  `${typeof window !== 'undefined' ? window.location.origin : 'https://theedgecat.com'}/?ref=${code}`;

/* Викликається один раз при старті застосунку, до будь-яких
   редиректів (лендінг перекидає на /en і губить адресу). */
export function captureRef() {
  try {
    const raw = new URLSearchParams(window.location.search).get('ref');
    const code = String(raw || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) return;
    /* Перший запрошувач не перезаписується другим посиланням за
       кілька хвилин — інакше виграє той, чиє посилання людина
       відкрила останнім, а не той, хто її привів. */
    const prev = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (prev?.code && Date.now() - prev.at < TTL_MS) return;
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch { /* без сховища — без реферала, це не біда */ }
}

let claiming = false;

/* Після входу. Код прибираємо, щойно база дала остаточну відповідь
   (закріплено або «не можна»), і лишаємо лише на мережевий збій. */
export async function claimPendingRef() {
  if (claiming) return;
  let item = null;
  try { item = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return; }
  if (!item?.code) return;
  if (Date.now() - item.at > TTL_MS) { try { localStorage.removeItem(KEY); } catch { /* */ } return; }

  claiming = true;
  try {
    const { data, error } = await supabase.rpc('claim_referral', { p_code: item.code });
    /* PGRST202 — функції ще немає (SQL не запущено): код лишаємо,
       закріпимо після міграції. */
    if (error && error.code === 'PGRST202') return;
    if (!error || data) localStorage.removeItem(KEY);
  } catch { /* мережа — спробуємо наступного разу */ } finally {
    claiming = false;
  }
}

export async function readMyReferral() {
  const { data, error } = await supabase.rpc('my_referral');
  if (error) throw error;
  return data;
}
