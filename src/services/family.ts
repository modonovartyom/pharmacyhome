import { client } from '../lib/supabase';

export type Slot = 'mama' | 'papa' | 'son';
export type ChatMessage = {
  id: string;
  household_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  medicine_id: string | null;
  created_at: string;
};
export type Source = { title: string; url: string };

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (name !== 'family-auth') {
    const { data: { session }, error } = await client().auth.getSession();
    if (error || !session?.access_token) throw new Error('Войдите в профиль ещё раз');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  let result: Response;
  try {
    result = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверьте подключение к сети.');
  }
  let data: { error?: string };
  try { data = await result.json(); }
  catch { throw new Error(`Сервер вернул неожиданный ответ (${result.status})`); }
  if (!result.ok) throw new Error(data.error || `Ошибка сервера (${result.status})`);
  return data as T;
}

export async function familyStatus(): Promise<Record<Slot, boolean>> {
  const data = await invoke<{ profiles: Record<Slot, boolean> }>('family-auth', { action: 'status' });
  return data.profiles;
}

export async function enterFamilyProfile(slot: Slot, pin: string, firstTime: boolean) {
  const data = await invoke<{ tokenHash: string }>('family-auth', { action: firstTime ? 'claim' : 'login', slot, pin });
  const { data: session, error } = await client().auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' });
  if (error || !session.user) throw new Error(error?.message || 'Не удалось открыть профиль');
  return session.user;
}

export async function getChatMessages(householdId: string): Promise<ChatMessage[]> {
  const { data, error } = await client().from('chat_messages').select('*')
    .eq('household_id', householdId).order('created_at', { ascending: true }).limit(100);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function askAssistant(householdId: string, message: string, medicineId?: string) {
  return invoke<{ content: string; sources: Source[]; purchaseQuery: string | null }>('family-assistant', {
    action: 'chat', householdId, message, medicineId,
  });
}

export async function researchMedicine(householdId: string, medicineId: string) {
  return invoke<{ summary: string; sources: Source[] }>('family-assistant', {
    action: 'research', householdId, medicineId,
  });
}

export async function scanPackage(householdId: string, image: string) {
  return invoke<{ name: string; expiresOn: string | null; warning: string }>('family-assistant', {
    action: 'scan', householdId, image,
  });
}

export type Offer = { name: string; pharmacy: string; price: number | null; cityPrice: number | null; url: string; image: string | null; address: string; localConfirmed: boolean; note: string };
export type MarketPharmacy = { name: string; address: string; hours: string; price: number };
const marketCache = new Map<string, { offers: Offer[]; checkedAt: string; expires: number }>();
const pharmacyCache = new Map<string, { pharmacies: MarketPharmacy[]; checkedAt: string; expires: number }>();
export async function searchMarket(householdId: string, query: string) {
  const key = query.trim().toLocaleLowerCase('ru');
  const cached = marketCache.get(key);
  if (cached && cached.expires > Date.now()) return { offers: cached.offers, checkedAt: cached.checkedAt };
  const result = await invoke<{ offers: Offer[]; checkedAt: string }>('family-assistant', {
    action: 'market', householdId, query,
  });
  marketCache.set(key, { ...result, expires: Date.now() + (result.offers.length ? 15 : 1) * 60_000 });
  return result;
}

export async function getMarketPharmacies(householdId: string, productUrl: string) {
  const cached = pharmacyCache.get(productUrl);
  if (cached && cached.expires > Date.now()) return { pharmacies: cached.pharmacies, checkedAt: cached.checkedAt };
  const result = await invoke<{ pharmacies: MarketPharmacy[]; checkedAt: string }>('family-assistant', {
    action: 'market-pharmacies', householdId, productUrl,
  });
  pharmacyCache.set(productUrl, { ...result, expires: Date.now() + 5 * 60_000 });
  return result;
}
