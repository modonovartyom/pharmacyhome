import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
const allowedHosts = ['grls.rosminzdrav.ru', 'vidal.ru', 'www.vidal.ru', 'rlsnet.ru', 'www.rlsnet.ru', 'eapteka.ru', 'www.eapteka.ru', 'apteka.ru', 'www.apteka.ru', 'zdravcity.ru', 'www.zdravcity.ru', 'megapteka.ru', 'www.megapteka.ru', 'podolsk.asna.ru'];
const hosts = new Set(allowedHosts);
const validUrl = (value: unknown) => { try { const u = new URL(String(value)); return u.protocol === 'https:' && hosts.has(u.hostname); } catch { return false; } };
const redFlags = [/боль в груди|давление в груди/i, /не могу дышать|затрудн.*дыхани|удушье/i, /потер.*сознани|обморок/i, /перекос.*лиц|невнятн.*реч|онемени.*половин/i, /сильн.*кровотеч/i, /суицид|покончить с собой/i];
type Source = { title: string; url: string };
function parseObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}
function citations(message: { annotations?: unknown[] }): Source[] {
  if (!Array.isArray(message.annotations)) return [];
  const seen = new Set<string>();
  return message.annotations.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as { url?: unknown; title?: unknown; url_citation?: { url?: unknown; title?: unknown } };
    const url = String(record.url_citation?.url || record.url || '');
    if (!validUrl(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ title: String(record.url_citation?.title || record.title || new URL(url).hostname).slice(0, 160), url }];
  }).slice(0, 5);
}
const translit: Record<string, string> = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
const asnaSlug = (value: string) => Array.from(value.toLocaleLowerCase('ru').split(/\s+/)[0] || '').map(char => translit[char] ?? (/[a-z0-9-]/.test(char) ? char : '')).join('');
const localStreet = /Кузнечики|Доллежаля|65-летия Победы|Варенникова|Стрельбицкого/i;
async function asnaVariants(query: string) {
  const slug = asnaSlug(query);
  if (slug.length < 3) return [];
  const url = `https://podolsk.asna.ru/product/${slug}/`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return [];
    const html = await response.text();
    const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (!raw) return [];
    const state = JSON.parse(raw)?.props?.initialState?.product?.product;
    const products = Array.isArray(state?.data) ? state.data as Record<string, unknown>[] : [];
    const pharmacies = Array.isArray(state?.pharmacies) ? state.pharmacies as Record<string, unknown>[] : [];
    const local = pharmacies.find(place => localStreet.test(String(place.address || '')));
    const words = query.toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
    return products.filter(item => words.every(word => String(item.name || '').toLocaleLowerCase('ru').includes(word))).slice(0, 24).map(item => {
      const ownPrice = item.price && typeof item.price === 'object' ? Number((item.price as Record<string, unknown>).price) : NaN;
      const localPrice = local?.price && typeof local.price === 'object' ? Number((local.price as Record<string, unknown>).price) : NaN;
      const confirmed = item.id === products[0]?.id && !!local && Number.isFinite(localPrice) && localPrice > 0;
      const productSlug = String(item.url_name || '');
      const productUrl = /^[a-z0-9_-]+$/.test(productSlug) ? `https://podolsk.asna.ru/cards/${productSlug}.html` : url;
      return { name: String(item.name || '').slice(0, 190), pharmacy: 'ASNA · аптеки Подольска', price: confirmed ? localPrice : null, cityPrice: Number.isFinite(ownPrice) && ownPrice > 0 ? ownPrice : null, url: productUrl, image: /^https:\/\/imgs\.asna\.ru\//.test(String(item.image || '')) ? String(item.image) : null, address: confirmed ? String(local.address).slice(0, 160) : '', localConfirmed: confirmed, note: confirmed ? 'Цена для указанной аптеки · проверьте наличие перед заказом' : 'Выберите пункт выдачи в Кузнечиках на сайте аптеки' };
    });
  } catch { return []; }
}
async function referencePhoto(name: string, dosage: string | null, sources: Source[]): Promise<string | null> {
  const nameParts = name.toLocaleLowerCase('ru').replace(/[^а-яёa-z0-9 ]/gi, ' ').split(/\s+/).filter(part => part.length > 2);
  for (const source of sources) {
    const page = new URL(source.url);
    if (!['eapteka.ru', 'www.eapteka.ru'].includes(page.hostname) || !/^\/goods\/id\d+\//.test(page.pathname)) continue;
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) continue;
      const html = await response.text();
      const alt = html.match(/<meta\s+name=["']og:image:alt["']\s+content=["']([^"']+)/i)?.[1]?.toLocaleLowerCase('ru') || '';
      if (!nameParts.every(part => alt.includes(part))) continue;
      if (dosage && !dosage.toLocaleLowerCase('ru').split(/\s+/).filter(part => /\d/.test(part)).every(part => alt.includes(part))) continue;
      const image = html.match(/<meta\s+name=["']og:image["']\s+content=["']([^"']+)/i)?.[1];
      if (!image) continue;
      const imageUrl = new URL(image.replace(/&amp;/g, '&'));
      if (imageUrl.protocol === 'https:' && imageUrl.hostname === 'cdn.eapteka.ru') return imageUrl.toString();
    } catch { /* continue to another exact product page */ }
  }
  return null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const publishable = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return json({ error: 'Нужен вход в профиль' }, 401);
  const db = createClient(url, publishable, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return json({ error: 'Сессия недействительна' }, 401);
  let body: { action?: string; householdId?: string; message?: string; medicineId?: string; image?: string; query?: string; productUrl?: string };
  try { body = await req.json(); } catch { return json({ error: 'Неверный запрос' }, 400); }
  const householdId = body.householdId;
  if (!householdId) return json({ error: 'Не выбрана аптечка' }, 400);
  const { data: membership } = await db.from('household_members').select('user_id').eq('household_id', householdId).eq('user_id', user.id).maybeSingle();
  if (!membership) return json({ error: 'Нет доступа к аптечке' }, 403);
  const { data: vaultKey } = await admin.rpc('read_family_openrouter_key');
  const key = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('OPEN_ROUTER_API_KEY') || vaultKey;
  if (!key) return json({ error: 'ИИ-помощник пока не настроен' }, 503);

  async function complete(messages: { role: string; content: unknown }[], options: { web?: boolean; json?: boolean; market?: boolean } = {}) {
    const result = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('OPENROUTER_MODEL') || 'openai/gpt-4o-mini', temperature: 0.2,
        max_tokens: options.market ? 850 : options.json ? 600 : 900,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        ...(options.web ? { tools: [{ type: 'openrouter:web_search', parameters: { max_results: options.market ? 6 : 4 } }] } : {}),
        messages }),
    });
    if (!result.ok) throw new Error(`OpenRouter ${result.status}`);
    const payload = await result.json();
    const message = payload.choices?.[0]?.message;
    if (typeof message?.content !== 'string' || !message.content.trim()) throw new Error('Empty response');
    return { text: message.content.trim(), sources: citations(message) };
  }

  try {
    if (body.action === 'chat') {
      const text = body.message?.trim() || '';
      if (text.length < 2 || text.length > 2000) return json({ error: 'Напишите вопрос от 2 до 2000 символов' }, 400);
      if (redFlags.some(pattern => pattern.test(text))) {
        const urgent = 'Это может быть неотложная ситуация. Немедленно обратитесь за медицинской помощью или вызовите скорую помощь. Не откладывайте обращение ради советов приложения.';
        await admin.from('chat_messages').insert([{ household_id: householdId, user_id: user.id, role: 'user', content: text, medicine_id: null }, { household_id: householdId, user_id: user.id, role: 'assistant', content: urgent, medicine_id: null }]);
        return json({ content: urgent, sources: [], purchaseQuery: null });
      }
      const [{ data: history }, { data: medicines }, { data: batches }] = await Promise.all([
        db.from('chat_messages').select('role,content').eq('household_id', householdId).eq('user_id', user.id).order('created_at', { ascending: false }).limit(16),
        db.from('medicines').select('id,name,inn,dosage,form,indications,contraindications,needs_review,info_summary').eq('household_id', householdId),
        db.from('inventory_batches').select('medicine_id,quantity,expires_on').eq('household_id', householdId),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const available = (medicines || []).filter(m => (batches || []).some(b => b.medicine_id === m.id && Number(b.quantity) > 0 && (!b.expires_on || b.expires_on >= today))).slice(0, 150);
      const contextMed = available.find(m => m.id === body.medicineId);
      const system = `Ты осторожный медицинский консультант для семейной домашней аптечки. Отвечай по-русски, понятным языком. Помоги понять вероятные причины жалоб, меры самопомощи и когда нужен врач. При недостатке данных сначала спроси возраст (особенно для ребёнка), длительность, температуру, аллергию и важные болезни. Не ставь окончательный диагноз. Допускается обсуждать безрецептурные лекарства и объяснять, почему они могут подходить; не назначай индивидуальную дозу и не советуй рецептурные препараты без врача. Если лекарство из аптечки просрочено, его нет в списке доступных. Не выдумывай состав или показания; данные из домашнего списка могут быть неполными. При опасных симптомах сразу направляй за неотложной помощью. Если вопрос требует актуальных фактов о препарате, используй веб-поиск и укажи источники. Завершай значимые советы фразой, что применение лекарства нужно уточнить у врача или фармацевта. Нельзя читать или раскрывать разговоры других профилей. Оформляй ответ короткими абзацами, списками с маркером - и выделяй важные слова **жирным**. Если прямо рекомендуешь купить конкретный безрецептурный товар, в самом конце отдельной строкой напиши ПОКУПКА: точное название товара. Во всех остальных случаях строку ПОКУПКА не пиши.`;
      const chat = [{ role: 'system', content: system }, { role: 'system', content: JSON.stringify({ profile: user.user_metadata?.display_name || 'Член семьи', availableMedicines: available, openedMedicine: contextMed || null }) }, ...((history || []).reverse().map(h => ({ role: h.role, content: h.content }))), { role: 'user', content: text }];
      const result = await complete(chat, { web: true });
      let answer = result.text;
      let purchaseQuery: string | null = null;
      const purchaseLine = answer.match(/(?:^|\n)ПОКУПКА:\s*([^\n]+)/i);
      if (purchaseLine?.[1] && purchaseLine[1].trim().length >= 2) {
        purchaseQuery = purchaseLine[1].trim().slice(0, 120);
        answer = answer.replace(purchaseLine[0], '').trim();
      }
      const { error: saveError } = await admin.from('chat_messages').insert([
        { household_id: householdId, user_id: user.id, role: 'user', content: text, medicine_id: body.medicineId || null },
        { household_id: householdId, user_id: user.id, role: 'assistant', content: `${answer}${purchaseQuery ? `\nПОКУПКА: ${purchaseQuery}` : ''}`.slice(0, 6000), medicine_id: body.medicineId || null },
      ]);
      if (saveError) return json({ error: 'Ответ получен, но историю сохранить не удалось' }, 500);
      return json({ content: answer.slice(0, 6000), sources: result.sources, purchaseQuery });
    }

    if (body.action === 'research') {
      const { data: med } = await db.from('medicines').select('id,name,dosage,form,needs_review').eq('household_id', householdId).eq('id', body.medicineId).maybeSingle();
      if (!med) return json({ error: 'Лекарство не найдено' }, 404);
      const result = await complete([{ role: 'system', content: 'Ты составляешь краткую справку о лекарстве. Ищи действующие инструкции или карточки именно этого препарата через веб-поиск. Если точную упаковку и дозировку не удаётся сопоставить, скажи об этом. Не придумывай показания. Ответ 2–4 предложения на русском, без дозировок и индивидуальных назначений.' }, { role: 'user', content: `Для чего используется: ${med.name}, ${med.dosage || 'дозировка неизвестна'}, ${med.form || 'форма неизвестна'}? Ищи источники на grls.rosminzdrav.ru, vidal.ru, rlsnet.ru или сайтах аптек.` }], { web: true });
      if (!result.sources.length) return json({ error: 'Не удалось найти подтверждённый источник для справки' }, 422);
      const summary = result.text.slice(0, 1500);
      const image = await referencePhoto(med.name, med.dosage, result.sources);
      const { error: updateError } = await admin.from('medicines').update({ info_summary: summary, info_sources: result.sources, info_checked_at: new Date().toISOString(), ...(image ? { reference_image_url: image } : {}) }).eq('id', med.id).eq('household_id', householdId);
      if (updateError) return json({ error: 'Справка найдена, но сохранить её не удалось' }, 500);
      return json({ summary, sources: result.sources, image });
    }

    if (body.action === 'scan') {
      if (!body.image || !/^data:image\/(jpeg|png|webp);base64,/.test(body.image) || body.image.length > 5_000_000) return json({ error: 'Выберите фото до 4 МБ' }, 400);
      const result = await complete([{ role: 'system', content: 'Считай с фото упаковки только название лекарства и срок годности. Верни JSON с полями name (строка), expiresOn (YYYY-MM-DD или null), warning (строка). Если срок указан месяцем, используй последний день месяца и в warning явно напиши, что на упаковке указан только месяц. Если текст неразборчив, оставь name пустым и expiresOn null. Не выдумывай данные.' }, { role: 'user', content: [{ type: 'text', text: 'Распознай название и срок годности на упаковке.' }, { type: 'image_url', image_url: { url: body.image } }] }], { json: true });
      const parsed = parseObject(result.text);
      return json({ name: typeof parsed.name === 'string' ? parsed.name.slice(0, 200) : '', expiresOn: typeof parsed.expiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiresOn) ? parsed.expiresOn : null, warning: String(parsed.warning || 'Сверьте распознанные данные с упаковкой').slice(0, 400) });
    }

    if (body.action === 'market-pharmacies') {
      const productUrl = body.productUrl || '';
      if (!validUrl(productUrl) || !/^https:\/\/podolsk\.asna\.ru\/cards\/[a-z0-9_-]+\.html$/.test(productUrl)) return json({ error: 'Неверная ссылка на товар' }, 400);
      const response = await fetch(productUrl, { signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) return json({ error: 'Не удалось получить аптеки для этого товара' }, 502);
      const html = await response.text();
      const clean = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
      const pharmacies = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(match => {
        const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => clean(cell[1]));
        if (cells.length < 4 || !/Кузнечики/i.test(cells[1])) return [];
        const price = Number(cells[3].replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]);
        if (!Number.isFinite(price) || price <= 0) return [];
        return [{ name: cells[0].slice(0, 90), address: cells[1].slice(0, 180), hours: cells[2].slice(0, 90), price }];
      }).sort((a, b) => a.price - b.price).slice(0, 20);
      return json({ pharmacies, checkedAt: new Date().toISOString() });
    }

    if (body.action === 'market') {
      const query = body.query?.trim() || '';
      if (query.length < 2 || query.length > 120) return json({ error: 'Введите название лекарства' }, 400);
      const direct = await asnaVariants(query);
      if (direct.length) return json({ offers: direct, checkedAt: new Date().toISOString() });
      const result = await complete([{ role: 'system', content: 'Найди 4–8 разных товарных карточек препарата в аптеках Подольска: megapteka.ru/podolsk/catalog, podolsk.asna.ru/product, eapteka.ru/goods/id или zdravcity.ru/p_. Покажи варианты дозировки, формы и упаковки; наличие в конкретном пункте Кузнечиков не выдумывай. Верни только JSON: {"offers":[{"name":"точное название товара","pharmacy":"аптека","url":"https://..."}]}.' }, { role: 'user', content: `Товар: ${query}. Подольск, микрорайон Кузнечики.` }], { web: true, market: true });
      const parsed = parseObject(result.text);
      const offers = (Array.isArray(parsed.offers) ? parsed.offers : []).flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const item = value as Record<string, unknown>;
        const offerUrl = String(item.url || '');
        if (!validUrl(offerUrl) || !/^(?:www\.)?(?:eapteka\.ru|megapteka\.ru|zdravcity\.ru)$|^podolsk\.asna\.ru$/.test(new URL(offerUrl).hostname) || !/\/goods\/id\d+|\/podolsk\/catalog\/|\/product\/|\/p_/.test(new URL(offerUrl).pathname)) return [];
        const name = String(item.name || '').slice(0, 190);
        if (!name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru').split(/\s+/)[0])) return [];
        return [{ name, pharmacy: String(item.pharmacy || new URL(offerUrl).hostname).slice(0, 70), price: null, cityPrice: null, url: offerUrl, image: null, address: '', localConfirmed: false, note: 'Выберите пункт выдачи в Кузнечиках на сайте аптеки' }];
      }).slice(0, 8);
      return json({ offers, checkedAt: new Date().toISOString() });
    }
    return json({ error: 'Неверное действие' }, 400);
  } catch (error) {
    console.error('family-assistant:', error instanceof Error ? error.message : String(error));
    return json({ error: 'Сервис временно недоступен. Попробуйте позже.' }, 502);
  }
});
