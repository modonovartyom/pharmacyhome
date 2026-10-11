import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const names: Record<string, string> = { mama: 'Мама', papa: 'Папа', son: 'Сын' };

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !secret) return response({ error: 'Сервер не настроен' }, 503);
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: { action?: string; slot?: string; pin?: string };
  try { body = await request.json(); } catch { return response({ error: 'Неверный запрос' }, 400); }

  if (body.action === 'status') {
    const { data, error } = await admin.from('family_pin_profiles').select('slot');
    if (error) return response({ error: 'Не удалось загрузить профили' }, 500);
    const configured = new Set((data || []).map(row => row.slot));
    return response({ profiles: Object.fromEntries(Object.keys(names).map(slot => [slot, configured.has(slot)])) });
  }

  const slot = body.slot || '';
  const pin = body.pin || '';
  if (!(slot in names) || !/^\d{4}$/.test(pin)) return response({ error: 'Выберите профиль и введите четыре цифры' }, 400);

  if (body.action === 'claim') {
    const { data: existing } = await admin.from('family_pin_profiles').select('slot').eq('slot', slot).maybeSingle();
    if (existing) return response({ error: 'Код профиля уже создан' }, 409);
    const email = `family-${slot}-${crypto.randomUUID()}@example.com`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true,
      user_metadata: { display_name: names[slot] },
    });
    if (createError || !created.user) return response({ error: 'Не удалось создать профиль' }, 500);
    const userId = created.user.id;
    try {
      const { error: claimError } = await admin.rpc('family_claim_pin', { p_slot: slot, p_user_id: userId, p_pin: pin });
      if (claimError) throw claimError;
      const { data: state, error: stateError } = await admin.from('family_state').select('household_id').eq('singleton', true).maybeSingle();
      if (stateError) throw stateError;
      let householdId = state?.household_id as string | undefined;
      const isFirstHousehold = !householdId;
      if (!householdId) {
        const { data: house, error: houseError } = await admin.from('households')
          .insert({ name: 'Семейная аптечка', owner_id: userId }).select('id').single();
        if (houseError) throw houseError;
        householdId = house.id;
        const { error: setError } = await admin.from('family_state')
          .upsert({ singleton: true, household_id: householdId });
        if (setError) throw setError;
      }
      const { error: memberError } = await admin.from('household_members')
        .upsert({ household_id: householdId, user_id: userId, role: isFirstHousehold ? 'owner' : 'member' }, { onConflict: 'household_id,user_id' });
      if (memberError) throw memberError;
    } catch (error) {
      console.error('family-auth claim:', error instanceof Error ? error.message : String((error as { message?: string })?.message || error));
      await admin.auth.admin.deleteUser(userId);
      return response({ error: 'Не удалось настроить профиль. Попробуйте снова.' }, 500);
    }
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link.properties?.hashed_token) return response({ error: 'Код создан, но вход не удался. Введите код снова.' }, 500);
    return response({ tokenHash: link.properties.hashed_token });
  }

  if (body.action === 'login') {
    const { data: userId, error: verifyError } = await admin.rpc('family_verify_pin', { p_slot: slot, p_pin: pin });
    if (verifyError || !userId) return response({ error: 'Неверный код или временная блокировка после пяти попыток' }, 401);
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData.user?.email) return response({ error: 'Профиль временно недоступен' }, 500);
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: userData.user.email });
    if (linkError || !link.properties?.hashed_token) return response({ error: 'Не удалось войти. Попробуйте позже.' }, 500);
    return response({ tokenHash: link.properties.hashed_token });
  }

  return response({ error: 'Неверное действие' }, 400);
});
