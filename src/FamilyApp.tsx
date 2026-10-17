import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Activity, ArrowLeft, ArrowRight, Bell, Camera, Check, ChevronRight, CircleAlert, Clock3, HeartPulse, Home, MapPin, Package, Pill, Plus, Search, Send, ShieldCheck, ShoppingBag, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { client, configured } from './lib/supabase';
import { expiryStatus, formatDate } from './lib/expiry';
import * as api from './services/api';
import { askAssistant, clearChatMessages, enterFamilyProfile, familyStatus, getChatMessages, getMarketPharmacies, researchMedicine, scanPackage, searchMarket } from './services/family';
import type { ChatMessage, MarketPharmacy, Offer, Slot, Source } from './services/family';
import type { ImportRow, Inventory, Usage } from './types';
import inventorySeed from './data/inventory.json';
import catalogPhotos from './data/catalog-photos.json';
import './family.css';

const family = [
  { slot: 'mama' as Slot, name: 'Мама', icon: '✿', color: 'rose' },
  { slot: 'papa' as Slot, name: 'Папа', icon: '✦', color: 'sage' },
  { slot: 'son' as Slot, name: 'Сын', icon: '★', color: 'blue' },
];
const labelFor = (slot: Slot | null) => family.find(p => p.slot === slot)?.name || 'Семья';
const symptoms = [
  { key: 'head', title: 'Голова', tone: 'lilac' }, { key: 'stomach', title: 'Живот', tone: 'peach' },
  { key: 'cold', title: 'Простуда', tone: 'sky' }, { key: 'throat', title: 'Горло', tone: 'rose' },
  { key: 'fever', title: 'Температура', tone: 'apricot' }, { key: 'nose', title: 'Насморк', tone: 'mint' },
  { key: 'back', title: 'Спина', tone: 'butter' },
] as const;
type Symptom = typeof symptoms[number];
function SymptomArt({ symptom }: { symptom: Symptom }) {
  const common = { stroke: '#355f4e', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return <svg viewBox="0 0 80 80" role="img" aria-label={`Иллюстрация: ${symptom.title}`}>
    <circle cx="40" cy="40" r="33" fill="#ffffff94"/>
    {symptom.key === 'head' && <><path d="M27 53V39c-4-5-3-17 6-22 8-5 21-1 23 10 2 9-2 15-8 19v7" {...common}/><path d="M31 53h19M36 29l5-6-1 7 6-1-7 9" stroke="#b179b7" strokeWidth="3" fill="none" strokeLinecap="round"/></>}
    {symptom.key === 'stomach' && <><path d="M29 20c-3 8-8 10-8 22 0 12 9 20 19 20s19-8 19-20c0-12-5-14-8-22" {...common}/><path d="M31 42c3-4 6-4 9 0s6 4 9 0M30 51c5-3 15-3 20 0" stroke="#d59470" strokeWidth="3" fill="none" strokeLinecap="round"/></>}
    {symptom.key === 'cold' && <><circle cx="40" cy="34" r="17" fill="#f6d4b9" stroke="#355f4e" strokeWidth="2"/><path d="M33 30h2m10 0h2M35 40c3 2 7 2 10 0" {...common}/><path d="M24 55l10-9h12l10 9-8 11H32z" fill="#fff" stroke="#8ab4bf" strokeWidth="2"/><path d="M55 20l2-5m5 11 5-2M18 21l-4-4" stroke="#82adc1" strokeWidth="3" strokeLinecap="round"/></>}
    {symptom.key === 'throat' && <><path d="M29 17c0 11-6 14-6 27 0 12 8 20 17 20s17-8 17-20c0-13-6-16-6-27" {...common}/><path d="M31 34c5 4 13 4 18 0M34 43c4 3 8 3 12 0" stroke="#d97777" strokeWidth="4" strokeLinecap="round" fill="none"/><circle cx="40" cy="50" r="3" fill="#e9a0a0"/></>}
    {symptom.key === 'fever' && <><path d="M36 21a5 5 0 0 1 10 0v24a12 12 0 1 1-10 0z" fill="#fff" stroke="#355f4e" strokeWidth="2.4"/><path d="M41 31v21" stroke="#e87572" strokeWidth="5" strokeLinecap="round"/><circle cx="41" cy="54" r="6" fill="#e87572"/><path d="M52 25h7m-7 8h5" {...common}/></>}
    {symptom.key === 'nose' && <><circle cx="40" cy="35" r="19" fill="#f6d4b9" stroke="#355f4e" strokeWidth="2"/><path d="M31 31h3m12 0h3m-9-2-4 13c2 2 6 2 8 0" {...common}/><path d="M45 50c0 4-2 8-5 8s-5-4-5-8c0-3 5-9 5-9s5 6 5 9z" fill="#82c9d7"/></>}
    {symptom.key === 'back' && <><path d="M28 18c-2 9-8 12-8 24v17h40V42c0-12-6-15-8-24" fill="#fff" stroke="#355f4e" strokeWidth="2.4" strokeLinejoin="round"/><path d="M40 22v34" stroke="#d77d73" strokeWidth="4" strokeLinecap="round"/><circle cx="40" cy="34" r="5" fill="#f4b2a7"/><path d="M29 51h22" {...common}/></>}
  </svg>;
}
const catalogBySourceId = new Map(catalogPhotos.map(photo => [photo.source_id, photo]));
type View = 'home' | 'cabinet' | 'assistant' | 'market' | 'profile' | 'expiry' | 'history';
function dismissSheet(done: () => void) {
  const sheets = document.querySelectorAll('.sheet-backdrop');
  const sheet = sheets[sheets.length - 1];
  if (!sheet) { done(); return; }
  if (sheet.classList.contains('sheet-leaving')) return;
  sheet.classList.add('sheet-leaving');
  window.setTimeout(done, 210);
}

function IconArt({ name, large = false }: { name: string; large?: boolean }) {
  const tone = ['mint', 'peach', 'lilac', 'butter'][Array.from(name).reduce((v, ch) => v + ch.charCodeAt(0), 0) % 4];
  return <div className={`family-med-art ${tone} ${large ? 'large' : ''}`} aria-hidden="true"><div className="family-art-sun"/><div className="family-art-box"><span>{name.slice(0, 1).toUpperCase()}</span><i/><b>✚</b></div><div className="family-art-pill"/></div>;
}

function MedicineArt({ item, large = false, ownPhoto = '' }: { item: Inventory; large?: boolean; ownPhoto?: string }) {
  const catalog = item.source_id ? catalogBySourceId.get(item.source_id) : null;
  const source = ownPhoto || catalog?.path || item.reference_image_url || '';
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [source]);
  if (!source || broken) return <IconArt name={item.name} large={large}/>;
  return <div className={`family-med-photo ${large ? 'large' : ''}`}><img src={source} alt={`Пример упаковки: ${item.name}`} loading={large ? 'eager' : 'lazy'} onError={() => setBroken(true)}/></div>;
}

function PinGate({ onEnter }: { onEnter: (user: User, slot: Slot) => void }) {
  const [profiles, setProfiles] = useState<Record<Slot, boolean> | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<'choose' | 'pin' | 'confirm'>('choose');
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { familyStatus().then(setProfiles).catch(e => setError((e as Error).message)); }, []);
  const choose = (next: Slot) => { setSlot(next); setStep('pin'); setPin(''); setFirst(''); setError(''); };
  const submit = async (digits: string) => {
    if (!slot) return;
    if (!profiles?.[slot] && step === 'pin') { setFirst(digits); setPin(''); setStep('confirm'); return; }
    if (step === 'confirm' && digits !== first) { setPin(''); setError('Коды не совпали. Попробуйте ещё раз.'); return; }
    setBusy(true); setError('');
    try { onEnter(await enterFamilyProfile(slot, digits, !profiles?.[slot]), slot); }
    catch (e) { setError((e as Error).message); setPin(''); }
    finally { setBusy(false); }
  };
  const press = (digit: string) => {
    if (busy) return;
    const next = digit === '⌫' ? pin.slice(0, -1) : `${pin}${digit}`.slice(0, 4);
    setPin(next); setError('');
    if (next.length === 4 && digit !== '⌫') window.setTimeout(() => void submit(next), 190);
  };
  return <div className="family-gate">
    <div className="gate-orb orb-one"/><div className="gate-orb orb-two"/>
    <div className="gate-brand"><span className="gate-mark"><Pill size={30}/></span><span>МОЯ АПТЕЧКА</span></div>
    {step === 'choose' ? <div className="gate-scene scene-in">
      <div className="gate-illustration"><div className="gate-shelf"><span>✚</span><span>✿</span><span>✦</span></div><div className="gate-glow"/></div>
      <span className="eyebrow">Домашняя забота</span><h1>Кто сегодня<br/>у аптечки?</h1><p>Выберите свой профиль. Личные разговоры с помощником останутся только у вас.</p>
      <div className="family-people">{family.map(person => <button key={person.slot} className={`person-card ${person.color}`} onClick={() => choose(person.slot)} disabled={!profiles}><span className="person-portrait">{person.icon}</span><strong>{person.name}</strong><small>{profiles?.[person.slot] ? 'Войти по коду' : 'Придумать код'}</small><ChevronRight size={18}/></button>)}</div>
      {!profiles && !error && <small className="gate-loading">Загружаем профили…</small>}
      {error && <div className="pin-error"><CircleAlert size={16}/>{error}<button onClick={() => { setError(''); void familyStatus().then(setProfiles).catch(e => setError((e as Error).message)); }}>Повторить</button></div>}
    </div> : <div className="gate-pin scene-in">
      <button className="gate-back" onClick={() => { setStep('choose'); setPin(''); setError(''); }}><ArrowLeft size={18}/> Профили</button>
      <div className={`pin-avatar ${family.find(p => p.slot === slot)?.color}`}>{family.find(p => p.slot === slot)?.icon}</div>
      <span className="eyebrow">Профиль {labelFor(slot)}</span>
      <h1>{step === 'confirm' ? 'Повторите код' : profiles?.[slot!] ? 'Ваш код доступа' : 'Придумайте код'}</h1>
      <p>{step === 'confirm' ? 'Введите те же четыре цифры для подтверждения.' : profiles?.[slot!] ? 'Введите свой 4-значный код.' : 'Четыре цифры будут защищать ваш личный профиль.'}</p>
      <div className="pin-dots" aria-label={`Введено цифр: ${pin.length}`}><span className={pin.length > 0 ? 'filled' : ''}/><span className={pin.length > 1 ? 'filled' : ''}/><span className={pin.length > 2 ? 'filled' : ''}/><span className={pin.length > 3 ? 'filled' : ''}/></div>
      <div className="pin-pad">{['1','2','3','4','5','6','7','8','9','✦','0','⌫'].map(d => d === '✦' ? <span key={d} className="pin-deco">✦</span> : <button key={d} onClick={() => press(d)} disabled={busy} aria-label={d === '⌫' ? 'Удалить цифру' : `Цифра ${d}`}>{d}</button>)}</div>
      {error && <div className="pin-error"><CircleAlert size={16}/>{error}</div>}
      {busy && <small className="gate-loading">Открываем профиль…</small>}
    </div>}
  </div>;
}

function BottomNav({ view, setView, openAdd }: { view: View; setView: (view: View) => void; openAdd: () => void }) {
  return <nav className="family-nav" aria-label="Основное меню">
    <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}><Home/><span>Главная</span></button>
    <button className={view === 'cabinet' ? 'active' : ''} onClick={() => setView('cabinet')}><Package/><span>Аптечка</span></button>
    <button className="nav-create" onClick={openAdd} aria-label="Добавить лекарство"><span><Plus/></span><small>Добавить</small></button>
    <button className={view === 'assistant' ? 'active' : ''} onClick={() => setView('assistant')}><Sparkles/><span>Советы</span></button>
    <button className={view === 'market' ? 'active' : ''} onClick={() => setView('market')}><ShoppingBag/><span>Купить</span></button>
  </nav>;
}

function Header({ title, back, action }: { title: string; back?: () => void; action?: ReactNode }) {
  return <header className="family-header">{back && <button className="family-icon-button" onClick={back} aria-label="Назад"><ArrowLeft/></button>}<h1>{title}</h1>{action}</header>;
}

const firstNames: Record<Slot, string> = { mama: 'Лариса', papa: 'Владимир', son: 'Антон' };

function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [items, setItems] = useState<Inventory[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [view, setView] = useState<View>('home');
  const [selected, setSelected] = useState<Inventory | null>(null);
  const [editing, setEditing] = useState<Inventory | null>(null);
  const [chatMedicine, setChatMedicine] = useState<Inventory | null>(null);
  const [marketQuery, setMarketQuery] = useState('');
  const [symptomRequest, setSymptomRequest] = useState<{ id: string; title: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    if (!configured) { setReady(true); return; }
    void client().auth.signOut().finally(() => setReady(true));
    const { data: { subscription } } = client().auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { const yes = () => setOffline(false), no = () => setOffline(true); window.addEventListener('online', yes); window.addEventListener('offline', no); return () => { window.removeEventListener('online', yes); window.removeEventListener('offline', no); }; }, []);

  const refresh = useCallback(async (id: string) => {
    const [inventory, logs] = await Promise.all([api.getInventory(id), api.getUsage(id)]);
    setItems(inventory); setUsage(logs);
    localStorage.setItem(`family-cabinet-${id}`, JSON.stringify(inventory));
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const houses = await api.getHouseholds();
        if (!houses[0]) throw new Error('Общая аптечка пока недоступна');
        const id = houses[0].id;
        if (!active) return;
        setHouseholdId(id);
        await api.importRows(id, inventorySeed as ImportRow[]);
        if (active) await refresh(id);
      } catch (e) { if (active) setToast((e as Error).message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [user, refresh]);
  useEffect(() => { if (offline && householdId) { try { const cache = JSON.parse(localStorage.getItem(`family-cabinet-${householdId}`) || 'null'); if (Array.isArray(cache)) setItems(cache); } catch { /* ignore bad cache */ } } }, [offline, householdId]);
  useEffect(() => {
    if (!slot || !items.length || offline || !('Notification' in window) || Notification.permission !== 'granted') return;
    const count = items.flatMap(item => item.batches).filter(batch => Number(batch.quantity) > 0 && expiryStatus(batch.expires_on) === 'soon').length;
    const key = `family-expiry-${slot}-${new Date().toISOString().slice(0, 10)}`;
    if (count && !sessionStorage.getItem(key)) {
      try { new Notification('Моя аптечка', { body: `У ${count} упаковок скоро закончится срок годности`, icon: '/icon-192.png' }); sessionStorage.setItem(key, '1'); } catch { /* browser may block notifications */ }
    }
  }, [items, offline, slot]);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 4600); };
  const run = async (fn: () => Promise<unknown>, success: string) => {
    if (offline) { notify('Для изменений нужно подключение к сети'); return; }
    try { await fn(); await refresh(householdId); notify(success); }
    catch (e) { notify((e as Error).message); }
  };
  const switchProfile = async () => { await client().auth.signOut(); setUser(null); setSlot(null); setItems([]); setHouseholdId(''); setView('home'); };
  if (!ready) return <div className="family-center"><div className="family-spinner"/>Загружаем аптечку…</div>;
  if (!configured) return <div className="family-center"><Package size={44}/><h1>Нужно подключить Supabase</h1><p>Заполните публичные параметры в файле .env и перезапустите приложение.</p></div>;
  if (!user || !slot) return <PinGate onEnter={(nextUser, nextSlot) => { setUser(nextUser); setSlot(nextSlot); }} />;
  return <div className="family-shell">
    <main className="family-content">
      {offline && <div className="family-offline">Нет сети · данные доступны только для просмотра</div>}
      {loading ? <div className="family-center"><div className="family-spinner"/>Собираем домашнюю аптечку…</div> : <div className="view-enter" key={view}>
        {view === 'home' && <HomeView slot={slot} items={items} setView={setView} setSelected={setSelected} openAdd={() => setAdding(true)} onSymptom={title => { setSymptomRequest({ id: crypto.randomUUID(), title }); setView('assistant'); }} />}
        {view === 'cabinet' && <CabinetView items={items} setSelected={setSelected} setView={setView} openAdd={() => setAdding(true)} />}
        {view === 'assistant' && <ChatView user={user} householdId={householdId} items={items} symptomRequest={symptomRequest} onSymptomHandled={() => setSymptomRequest(null)} onMedicine={setSelected} onBuy={query => { setMarketQuery(query); setView('market'); }} />}
        {view === 'market' && <MarketView householdId={householdId} initialQuery={marketQuery} />}
        {view === 'profile' && <ProfileView slot={slot} count={items.length} switchProfile={switchProfile} />}
        {view === 'expiry' && <ExpiryView items={items} back={() => setView('home')} setSelected={setSelected} />}
        {view === 'history' && <HistoryView items={items} usage={usage.filter(log => log.used_by === user.id)} back={() => setView('home')} />}
      </div>}
    </main>
    <BottomNav view={view} setView={setView} openAdd={() => setAdding(true)} />
    {selected && <MedicineSheet key={selected.id} item={items.find(i => i.id === selected.id) || selected} householdId={householdId} user={user} close={() => dismissSheet(() => setSelected(null))} talk={() => { setChatMedicine(selected); setSelected(null); }} edit={() => { setEditing(selected); setSelected(null); }} run={run} />}
    {chatMedicine && <div className="sheet-backdrop" onClick={() => dismissSheet(() => setChatMedicine(null))}><div className="chat-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle"/><Header title={`Совет о ${chatMedicine.name}`} action={<button className="family-icon-button" onClick={() => dismissSheet(() => setChatMedicine(null))} aria-label="Закрыть"><X/></button>}/><ChatView user={user} householdId={householdId} items={items} medicineId={chatMedicine.id} compact onMedicine={m => { setChatMedicine(null); setSelected(m); }} onBuy={query => { setMarketQuery(query); setChatMedicine(null); setView('market'); }}/></div></div>}
    {adding && <AddSheet householdId={householdId} user={user} close={() => dismissSheet(() => setAdding(false))} run={run} />}
    {editing && <AddSheet key={editing.id} householdId={householdId} user={user} item={items.find(i => i.id === editing.id) || editing} close={() => dismissSheet(() => setEditing(null))} run={run} />}
    {toast && <button className="family-toast" onClick={() => setToast('')}>{toast}<X size={16}/></button>}
  </div>;
}

function HomeView({ slot, items, setView, setSelected, openAdd, onSymptom }: { slot: Slot; items: Inventory[]; setView: (v: View) => void; setSelected: (m: Inventory) => void; openAdd: () => void; onSymptom: (title: string) => void }) {
  return <>
    <div className="family-home-top"><div><h1>Привет, {firstNames[slot]} <span>✦</span></h1><p>Всё нужное под рукой, когда важно.</p></div><button className="profile-bubble" onClick={() => setView('profile')} aria-label="Открыть профиль"><UserRound size={23}/></button></div>
    <button className="home-search" onClick={() => setView('cabinet')}><Search size={19}/><span>Найти лекарство дома</span><ArrowRight size={17}/></button>
    <button className="family-hero" onClick={() => setView('assistant')}><div className="hero-copy"><span className="hero-kicker"><Sparkles size={13}/> ПОМОЩНИК РЯДОМ</span><h2>Давайте разберёмся<br/>вместе</h2><p>Расскажите, что беспокоит. Подскажу, что можно сделать.</p><span className="hero-cta">Спросить совета <ArrowRight size={16}/></span></div><div className="hero-character" aria-hidden="true"><div className="character-hair"/><div className="character-face"><span>• ᴗ •</span></div><div className="character-body"><HeartPulse size={34}/></div><i className="floating-star a">✦</i><i className="floating-star b">✿</i></div></button>
    <div className="home-title"><h2>Что беспокоит?</h2><small>Подскажет помощник</small></div>
    <div className="symptom-grid">{symptoms.map(symptom => <button key={symptom.key} className={`symptom-card ${symptom.tone}`} onClick={() => onSymptom(symptom.title)}><SymptomArt symptom={symptom}/><strong>{symptom.title}</strong><ArrowRight size={14}/></button>)}</div>
    <div className="home-title"><h2>Моя аптечка</h2><button onClick={() => setView('cabinet')}>Все лекарства <ChevronRight size={16}/></button></div>
    <div className="featured-grid">{items.slice(0, 3).map(m => <button key={m.id} onClick={() => setSelected(m)}><MedicineArt item={m}/><strong>{m.name}</strong><small>{m.batches[0]?.expires_on ? `До ${formatDate(m.batches[0].expires_on, m.batches[0].expiry_precision)}` : m.form || 'В аптечке'}</small></button>)}</div>
    <button className="home-add-link" onClick={openAdd}><Plus size={18}/> Добавить лекарство</button>
  </>;
}

function CabinetView({ items, setSelected, setView, openAdd }: { items: Inventory[]; setSelected: (m: Inventory) => void; setView: (v: View) => void; openAdd: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'soon' | 'green' | 'lower'>('all');
  const list = useMemo(() => items.filter(m => {
    const matches = `${m.name} ${m.dosage || ''} ${m.form || ''}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'));
    if (!matches) return false;
    return filter === 'all' || (filter === 'soon' && m.batches.some(b => expiryStatus(b.expires_on) === 'soon')) || (filter === 'green' && m.batches.some(b => b.storage_location === 'Зелёный ящик')) || (filter === 'lower' && m.batches.some(b => b.storage_location === 'Нижний ящик'));
  }), [items, query, filter]);
  return <><div className="sticky-view-header"><Header title="Моя аптечка" action={<button className="family-icon-button" onClick={openAdd} aria-label="Добавить"><Plus/></button>}/></div><p className="family-subtitle">Всё, что уже есть дома — в одном месте.</p>
    <div className="cabinet-search"><Search size={20}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Название лекарства" aria-label="Поиск по аптечке"/>{query && <button onClick={() => setQuery('')}><X size={17}/></button>}</div>
    <div className="family-filters">{([['all','Все'],['soon','Сроки'],['green','Зелёный ящик'],['lower','Нижний ящик']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>
    <div className="list-caption">Найдено: {list.length} из {items.length}</div>
    <div className="family-med-list">{list.map(m => <button className="family-med-row" key={m.id} onClick={() => setSelected(m)}><MedicineArt item={m}/><span><strong>{m.name}</strong><small>{[m.dosage, m.form].filter(Boolean).join(' · ') || 'Упаковка дома'}</small></span>{m.batches.find(b => b.expires_on) && <em>{formatDate(m.batches.find(b => b.expires_on)!.expires_on, m.batches.find(b => b.expires_on)!.expiry_precision)}</em>}<ChevronRight size={18}/></button>)}</div>
    {!list.length && <div className="family-empty"><Search size={35}/><h3>Ничего не найдено</h3><p>Попробуйте другое название или добавьте препарат.</p><button className="family-secondary" onClick={openAdd}>Добавить</button></div>}
    <button className="cabinet-market" onClick={() => setView('market')}><ShoppingBag size={18}/> Нет дома? Найти в аптеках Кузнечиков <ArrowRight size={16}/></button>
  </>;
}

function MedicineSheet({ item, householdId, user, close, talk, edit, run }: { item: Inventory; householdId: string; user: User; close: () => void; talk: () => void; edit: () => void; run: (fn: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [photo, setPhoto] = useState('');
  const catalog = item.source_id ? catalogBySourceId.get(item.source_id) : null;
  const [researching, setResearching] = useState(false);
  const [useQty, setUseQty] = useState(false);
  const [quantity, setQuantity] = useState(1);
  useEffect(() => { if (item.photo_path) void api.photoUrl(item.photo_path).then(setPhoto).catch(() => setPhoto('')); }, [item.photo_path]);
  const batch = item.batches.find(b => Number(b.quantity) > 0 && expiryStatus(b.expires_on) !== 'expired');
  const knownCount = item.batches.reduce((v, b) => v + Number(b.quantity), 0);
  const unknown = item.batches.some(b => b.quantity_unknown);
  const checkInfo = async () => { setResearching(true); try { await run(() => researchMedicine(householdId, item.id), 'Справка обновлена'); } finally { setResearching(false); } };
  return <div className="sheet-backdrop" onClick={close}><div className="medicine-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle"/><button className="sheet-close" onClick={close} aria-label="Закрыть"><X/></button>
    <div className="medicine-visual"><MedicineArt item={item} large ownPhoto={photo}/></div>
    <div className="sheet-scroll"><div className="sheet-title"><span className="eyebrow">ДОМАШНЯЯ АПТЕЧКА</span><h2>{item.name}</h2><p>{[item.dosage, item.form].filter(Boolean).join(' · ') || 'Данные с упаковки не указаны'}</p></div>
      {catalog && !photo && <a className="catalog-credit" href={catalog.source} target="_blank" rel="noopener noreferrer">Фото товара из каталога · ваша упаковка может отличаться ↗</a>}
      <div className="medicine-facts"><div><Package size={18}/><strong>{unknown ? `${knownCount || 'Неизвестно'}${knownCount ? ' + ?' : ''}` : knownCount}</strong><small>Остаток</small></div><div><MapPin size={18}/><strong>{item.batches[0]?.storage_location || 'Не указано'}</strong><small>Где лежит</small></div>{item.batches[0]?.expires_on && <div><Clock3 size={18}/><strong>{formatDate(item.batches[0].expires_on, item.batches[0].expiry_precision)}</strong><small>Срок годности</small></div>}</div>
      <div className="medicine-info"><div><h3>Для чего применяют</h3>{item.info_checked_at && <small>Справка проверена {new Date(item.info_checked_at).toLocaleDateString('ru-RU')}</small>}</div><p>{item.info_summary || 'Пока нет проверенной справки для этой записи. Название или упаковка могут требовать уточнения.'}</p><button onClick={() => void checkInfo()} disabled={researching}><Search size={16}/>{researching ? 'Ищем источник…' : item.info_summary ? 'Обновить справку' : 'Найти сведения'}</button>{item.info_sources?.map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">↗ {s.title}</a>)}</div>
      <div className="medicine-info"><h3>Упаковки</h3>{item.batches.map(b => <div className="sheet-batch" key={b.id}><span><strong>{b.quantity_unknown ? 'Количество не указано' : `${b.quantity} ${b.unit}`}</strong><small>{b.storage_location || 'Место не указано'}</small></span>{b.expires_on && <small>{formatDate(b.expires_on, b.expiry_precision)}</small>}</div>)}</div>
      {item.source_text && <details className="source-detail"><summary>Исходная запись из Excel</summary>{item.source_text}</details>}
      <div className="sheet-actions"><button className="family-primary" onClick={talk}><Sparkles size={18}/> Посоветоваться с агентом</button><button className="family-secondary" onClick={edit}><Pill size={17}/> Изменить запись</button><label className="family-secondary photo-attach"><Camera size={17}/> Фото упаковки<input type="file" accept="image/*" capture="environment" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void run(() => api.uploadPhoto(item, file), 'Фото добавлено'); }}/></label></div>
      {batch && <button className="use-link" onClick={() => setUseQty(!useQty)}><Check size={17}/> Отметить использование</button>}
      {useQty && batch && <div className="use-card"><label>Сколько использовали?<input type="number" min="0.001" step="any" max={batch.quantity} value={quantity} onChange={e => setQuantity(Number(e.target.value))}/></label><button className="family-primary" disabled={quantity <= 0 || quantity > batch.quantity} onClick={() => void run(async () => { await api.useMedicine(householdId, batch.id, quantity, '', crypto.randomUUID()); setUseQty(false); }, 'Использование записано')}>Записать</button></div>}
      <button className="delete-link" onClick={() => { if (window.confirm(`Удалить «${item.name}» из общей аптечки?`)) void run(async () => { await api.deleteMedicine(item); close(); }, 'Лекарство удалено'); }}><Trash2 size={16}/> Удалить из аптечки</button>
      <small className="medicine-owner">Данные общей аптечки видны всей семье. Вы вошли как {user.user_metadata?.display_name || 'член семьи'}.</small>
    </div>
  </div></div>;
}

function AddSheet({ householdId, user, item, close, run }: { householdId: string; user: User; item?: Inventory; close: () => void; run: (fn: () => Promise<unknown>, success: string) => Promise<void> }) {
  const batch = item?.batches[0];
  const [name, setName] = useState(item?.name || '');
  const [dosage, setDosage] = useState(item?.dosage || '');
  const [form, setForm] = useState(item?.form || '');
  const [expiry, setExpiry] = useState(batch?.expires_on || '');
  const [location, setLocation] = useState(batch?.storage_location || 'Зелёный ящик');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!photo) { setPreview(''); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  const scan = async () => {
    if (!photo) return;
    setScanning(true);
    try {
      const compressed = await api.compressPhoto(photo);
      const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(compressed); });
      const result = await scanPackage(householdId, image);
      if (result.name) setName(result.name);
      if (result.expiresOn) setExpiry(result.expiresOn);
      setScanNote(result.warning || 'Сверьте распознанные данные с упаковкой.');
    } catch (e) { setScanNote(`${(e as Error).message}. Заполните название и срок вручную.`); }
    finally { setScanning(false); }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!name.trim() || (!item && !expiry)) return;
    setSaving(true);
    await run(async () => {
      const id = await api.saveMedicine(householdId, user.id, {
        name: name.trim(), dosage: dosage.trim() || null, form: form.trim() || null, inn: item?.inn || null,
        categories: item?.categories || [], indications: item?.indications || [], instructions: item?.instructions || null,
        contraindications: item?.contraindications || null, needs_review: Boolean(item?.needs_review || scanNote),
        review_note: scanNote || item?.review_note || null, favorite: item?.favorite || false,
      }, {
        quantity: batch?.quantity ?? 1, quantity_unknown: batch?.quantity_unknown || false,
        unit: batch?.unit || 'упаковка', expires_on: expiry || null,
        expiry_precision: expiry === batch?.expires_on ? batch?.expiry_precision || null : expiry ? scanNote.includes('только месяц') ? 'месяц' : 'день' : 'не указан',
        storage_location: location, notes: batch?.notes || null,
      }, item?.id, batch?.id);
      if (photo) await api.uploadPhoto({ id, household_id: householdId, name: name.trim(), photo_path: item?.photo_path || null } as Inventory, photo);
      close();
    }, item ? 'Запись обновлена' : 'Лекарство добавлено в общую аптечку');
    setSaving(false);
  };
  return <div className="sheet-backdrop" onClick={close}><div className="add-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle"/><Header title={item ? 'Изменить запись' : 'Добавить лекарство'} action={<button className="family-icon-button" onClick={close} aria-label="Закрыть"><X/></button>}/><p>{item ? 'Исправьте данные по упаковке. Неизвестные сведения можно оставить пустыми.' : 'Достаточно названия и срока годности. Остальное можно уточнить позднее.'}</p>
    <form onSubmit={e => void save(e)}><label className="photo-drop">{preview ? <img src={preview} alt="Выбранная упаковка"/> : <span><Camera size={29}/><strong>Добавить по фото</strong><small>Сфотографируйте упаковку или выберите снимок</small></span>}<input type="file" accept="image/*" capture="environment" hidden onChange={e => setPhoto(e.target.files?.[0] || null)}/></label>
      {photo && <button type="button" className="family-secondary" onClick={() => void scan()} disabled={scanning}><Sparkles size={17}/>{scanning ? 'Читаем упаковку…' : 'Распознать название и срок'}</button>}
      {scanNote && <div className="sheet-warning"><CircleAlert size={18}/><small>{scanNote}</small></div>}
      <label>Название<input value={name} onChange={e => setName(e.target.value)} placeholder="Например, Парацетамол" maxLength={200} required/></label>
      <div className="add-form-row"><label>Дозировка<input value={dosage} onChange={e => setDosage(e.target.value)} placeholder="Если известна"/></label><label>Форма<input value={form} onChange={e => setForm(e.target.value)} placeholder="Таблетки, капли…"/></label></div>
      <label>Срок годности<input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} required={!item}/></label>
      <label>Место хранения<select value={location} onChange={e => setLocation(e.target.value)}><option>Зелёный ящик</option><option>Нижний ящик</option><option value="">Не указано</option></select></label>
      <button className="family-primary" disabled={saving || !name.trim() || (!item && !expiry)}><Plus size={18}/>{saving ? 'Сохраняем…' : item ? 'Сохранить изменения' : 'Добавить в аптечку'}</button>
    </form>
  </div></div>;
}

function AssistantAvatar() {
  return <span className="assistant-avatar" aria-label="Помощник"><HeartPulse size={17}/><i>✦</i></span>;
}

function AssistantAnswer({ content, buy, onBuy }: { content: string; buy: string | null; onBuy: (query: string) => void }) {
  const marker = content.match(/(?:^|\n)ПОКУПКА:\s*([^\n]+)/i);
  const product = marker?.[1]?.trim() || buy;
  const clean = content.replace(/(?:^|\n)ПОКУПКА:\s*[^\n]+/i, '').trim();
  const inline = (value: string) => value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    const bold = part.startsWith('**') && part.endsWith('**');
    const text = bold ? part.slice(2, -2) : part;
    if (product && text.toLocaleLowerCase('ru').includes(product.toLocaleLowerCase('ru'))) {
      const at = text.toLocaleLowerCase('ru').indexOf(product.toLocaleLowerCase('ru'));
      return <span key={index}>{text.slice(0, at)}<button className="answer-medicine-link" onClick={() => onBuy(product)} title={`Найти ${product} в Кузнечиках`}>{text.slice(at, at + product.length)} <ShoppingBag size={12}/></button>{text.slice(at + product.length)}</span>;
    }
    return bold ? <strong key={index}>{text}</strong> : <span key={index}>{text}</span>;
  });
  return <div className="answer-content">{clean.split(/\n+/).filter(Boolean).map((line, index) => {
    if (/^#{1,3}\s/.test(line)) return <h3 key={index}>{inline(line.replace(/^#{1,3}\s*/, ''))}</h3>;
    if (/^[-*•]\s/.test(line)) return <p className="answer-bullet" key={index}>{inline(line.replace(/^[-*•]\s*/, ''))}</p>;
    return <p key={index}>{inline(line)}</p>;
  })}{product && <button className="answer-buy" onClick={() => onBuy(product)}><ShoppingBag size={15}/> Найти {product} в Кузнечиках <ArrowRight size={14}/></button>}</div>;
}

function ChatView({ user, householdId, items, medicineId, compact = false, symptomRequest, onSymptomHandled, onMedicine, onBuy }: { user: User; householdId: string; items: Inventory[]; medicineId?: string; compact?: boolean; symptomRequest?: { id: string; title: string } | null; onSymptomHandled?: () => void; onMedicine: (m: Inventory) => void; onBuy: (query: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latestSources, setLatestSources] = useState<Source[]>([]);
  const [purchaseQuery, setPurchaseQuery] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const handledRequest = useRef<string | null>(null);
  useEffect(() => { if (householdId) void getChatMessages(householdId).then(setMessages).catch(e => setError((e as Error).message)); }, [householdId, user.id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  const sendMessage = useCallback(async (value: string) => {
    const message = value.trim(); if (!message || busy || clearing) return;
    setDraft(''); setBusy(true); setError('');
    const temporary: ChatMessage = { id: crypto.randomUUID(), household_id: householdId, user_id: user.id, role: 'user', content: message, medicine_id: medicineId || null, created_at: new Date().toISOString() };
    setMessages(current => [...current, temporary]);
    try { const result = await askAssistant(householdId, message, medicineId); setLatestSources(result.sources); setPurchaseQuery(result.purchaseQuery); setMessages(await getChatMessages(householdId)); }
    catch (err) { setMessages(current => current.filter(m => m.id !== temporary.id)); setDraft(message.startsWith('Меня беспокоит:') ? message.split('.')[0] + '.' : message); setError((err as Error).message); }
    finally { setBusy(false); }
  }, [busy, clearing, householdId, medicineId, user.id]);
  useEffect(() => {
    if (!symptomRequest || handledRequest.current === symptomRequest.id) return;
    handledRequest.current = symptomRequest.id;
    onSymptomHandled?.();
    void sendMessage(`Меня беспокоит: ${symptomRequest.title.toLocaleLowerCase('ru')}. Сначала посмотри мою аптечку и кратко скажи, какие имеющиеся лекарства могут относиться к этой жалобе, не считая их автоматически подходящими или безопасными. Затем задай несколько важных уточняющих вопросов о симптомах, возрасте и противопоказаниях, чтобы подобрать безопасный следующий шаг.`);
  }, [symptomRequest, onSymptomHandled, sendMessage]);
  const send = (e: FormEvent) => { e.preventDefault(); void sendMessage(draft); };
  useEffect(() => {
    if (!confirmClear) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !clearing) setConfirmClear(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmClear, clearing]);
  const clearChat = async () => {
    if (busy || clearing) return;
    setClearing(true); setError('');
    try {
      await clearChatMessages(householdId);
      setMessages([]); setLatestSources([]); setPurchaseQuery(null); setDraft(''); setConfirmClear(false);
    } catch (cause) { setError((cause as Error).message); setConfirmClear(false); }
    finally { setClearing(false); }
  };
  const clearButton = <button className="chat-clear-button" type="button" onClick={() => setConfirmClear(true)} disabled={!messages.length || busy || clearing} aria-label="Очистить историю чата"><Trash2 size={17}/><span>Очистить</span></button>;
  return <div className={`family-chat ${compact ? 'compact' : ''}`}>{!compact ? <><div className="sticky-view-header"><Header title="Советы помощника" action={clearButton}/></div><div className="chat-intro"><AssistantAvatar/><div><strong>Личный помощник {user.user_metadata?.display_name || ''}</strong><p>Помогу разобраться в самочувствии и вашей домашней аптечке.</p></div></div></> : <div className="chat-compact-actions">{clearButton}</div>}
    <div className="chat-messages">{messages.length === 0 && <div className="chat-empty"><span>✦</span><h2>О чём поговорим?</h2><p>Спросите о самочувствии или конкретном лекарстве. История остаётся только в этом профиле.</p><button onClick={() => setDraft('Что можно сделать при головной боли?')}>Головная боль</button><button onClick={() => setDraft('Расскажи, что есть в моей аптечке')}>Что есть дома?</button>{items.slice(0, 2).map(item => <button key={item.id} onClick={() => onMedicine(item)}>Посмотреть {item.name}</button>)}</div>}
      {messages.map((m, index) => <div key={m.id} className={`chat-bubble ${m.role}`}>{m.role === 'assistant' ? <AssistantAvatar/> : <span>{labelFor((family.find(p => p.name === user.user_metadata?.display_name)?.slot || null) as Slot | null).slice(0, 1)}</span>}{m.role === 'assistant' ? <AssistantAnswer content={m.content} buy={index === messages.length - 1 ? purchaseQuery : null} onBuy={onBuy}/> : <p>{m.content}</p>}</div>)}
      {busy && <div className="chat-bubble assistant thinking"><AssistantAvatar/><div className="thinking-stage"><div className="thinking-orbit"><HeartPulse size={22}/><i/><i/><i/></div><strong>Помощник разбирается в вопросе</strong><span>Сверяю сведения и вашу аптечку…</span><div className="thinking-progress"><i/></div></div></div>}
      {latestSources.length > 0 && <div className="chat-sources"><strong>Источники последнего ответа</strong>{latestSources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">↗ {s.title}</a>)}</div>}
      {error && <div className="chat-error"><CircleAlert size={17}/>{error}</div>}
      <div ref={end}/>
    </div>
    <form className="chat-composer" onSubmit={e => void send(e)}><input value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} placeholder="Напишите, что вас беспокоит…" aria-label="Сообщение помощнику"/><button disabled={busy || clearing || !draft.trim()} aria-label="Отправить"><Send size={19}/></button></form>
    {!compact && <small className="chat-disclaimer">Советы носят справочный характер. При выборе лекарства уточните применение у врача или фармацевта.</small>}
    {confirmClear && <div className="chat-clear-backdrop" onClick={() => { if (!clearing) setConfirmClear(false); }}><div className="chat-clear-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-chat-title" onClick={event => event.stopPropagation()}><div className="chat-clear-icon"><Trash2 size={23}/></div><h2 id="clear-chat-title">Очистить чат?</h2><p>Все сообщения и память помощника для этого профиля будут удалены. Чаты других членов семьи останутся на месте.</p><div className="chat-clear-actions"><button type="button" onClick={() => setConfirmClear(false)} disabled={clearing}>Отмена</button><button type="button" onClick={() => void clearChat()} disabled={clearing}>{clearing ? 'Очищаем…' : 'Удалить историю'}</button></div></div></div>}
  </div>;
}

const localPharmacies = [
  { name: 'Мегаптека', address: 'Поиск по аптекам Подольска', url: 'https://megapteka.ru/podolsk', logo: '/pharmacies/megapteka.png' },
  { name: 'ЕАПТЕКА · Планета Здоровья', address: 'ул. Академика Доллежаля, 42', url: 'https://www.eapteka.ru/company/pickup/msc_4052/', logo: '/pharmacies/eapteka.svg' },
  { name: 'Здравсити', address: 'Кузнечики · выбор пункта выдачи', url: 'https://zdravcity.ru/catalog/', logo: '/pharmacies/zdravcity.svg' },
];
function pharmacyLogo(name: string, url: string) {
  const value = `${name} ${url}`.toLowerCase();
  return value.includes('megapteka') || value.includes('мегаптека') ? '/pharmacies/megapteka.png'
    : value.includes('eapteka') || value.includes('еаптека') ? '/pharmacies/eapteka.svg'
      : value.includes('zdravcity') || value.includes('здравсити') ? '/pharmacies/zdravcity.svg' : null;
}
function MarketView({ householdId, initialQuery }: { householdId: string; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(initialQuery);
  const [editing, setEditing] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [nearbyPharmacies, setNearbyPharmacies] = useState<MarketPharmacy[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const pharmacyRequest = useRef(0);
  const lookup = useCallback(async (value: string) => { const term = value.trim(); if (term.length < 2) return; setQuery(term); setDraft(term); setEditing(false); setBusy(true); setError(''); setSearched(true); setOffers([]); try { setOffers((await searchMarket(householdId, term)).offers); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }, [householdId]);
  useEffect(() => { if (initialQuery.trim().length > 1) void lookup(initialQuery); }, [initialQuery, lookup]);
  useEffect(() => { if (!editing) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setEditing(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [editing]);
  const search = (e: FormEvent) => { e.preventDefault(); void lookup(draft); };
  const closeLocations = () => { pharmacyRequest.current += 1; setSelectedOffer(null); };
  const openOffer = async (offer: Offer) => {
    if (!/^https:\/\/podolsk\.asna\.ru\/cards\//.test(offer.url)) { window.open(offer.url, '_blank', 'noopener,noreferrer'); return; }
    const request = ++pharmacyRequest.current;
    setSelectedOffer(offer); setNearbyPharmacies([]); setLocalError(''); setLocalBusy(true);
    try { const result = await getMarketPharmacies(householdId, offer.url); if (request === pharmacyRequest.current) setNearbyPharmacies(result.pharmacies); }
    catch (cause) { if (request === pharmacyRequest.current) setLocalError((cause as Error).message); }
    finally { if (request === pharmacyRequest.current) setLocalBusy(false); }
  };
  const choosePharmacy = (pharmacy: MarketPharmacy) => {
    if (!selectedOffer) return;
    if (navigator.clipboard) void navigator.clipboard.writeText(pharmacy.address).catch(() => undefined);
    window.open(selectedOffer.url, '_blank', 'noopener,noreferrer');
  };
  return <><Header title="Найти и купить"/><p className="family-subtitle">Проверяйте предложения рядом с домом в Кузнечиках.</p><button className="market-search market-search-trigger" onClick={() => { setDraft(query); setEditing(true); }}><Search size={19}/><span>{query || 'Название препарата'}</span><b>{busy ? 'Ищем…' : 'Найти'}</b></button>
    <div className="market-note"><MapPin size={20}/><span><strong>Кузнечики, Подольск</strong><small>Стоимость и наличие зависят от выбранной упаковки и аптеки.</small></span></div>
    {searched && <div className="home-title"><h2>Варианты лекарства</h2><small>{offers.length ? `${offers.length} найдено` : ''}</small></div>}
    {busy && <div className="market-loading"><span className="market-loading-pulse"><Search size={18}/></span><div><strong>Ищем местные пункты</strong><small>Можно открыть аптеку ниже, пока уточняются товар и наличие.</small></div></div>}
    {query && <a className="market-quick-link" href={`https://www.eapteka.ru/search/?q=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer"><img src="/pharmacies/eapteka.svg" alt=""/><span><strong>Быстро открыть поиск «{query}»</strong><small>ЕАПТЕКА · пункт выдачи на Доллежаля, 42</small></span><ArrowRight size={17}/></a>}
    {offers.map((offer, index) => <button className="offer-card market-product" key={`${offer.url}-${index}`} onClick={() => void openOffer(offer)}><span className="offer-icon">{offer.image ? <img src={offer.image} alt="" loading="lazy"/> : pharmacyLogo(offer.pharmacy, offer.url) ? <img src={pharmacyLogo(offer.pharmacy, offer.url)!} alt=""/> : <ShoppingBag/>}</span><span><strong>{offer.name}</strong><small>{offer.pharmacy}</small><em className={offer.localConfirmed ? 'local-confirmed' : ''}>{offer.localConfirmed ? `● ${offer.address}` : offer.note}</em><b>{offer.price ? `${offer.price.toLocaleString('ru-RU')} ₽ · Кузнечики` : offer.cityPrice ? `от ${offer.cityPrice.toLocaleString('ru-RU')} ₽ · Подольск` : 'Цена на сайте'}</b></span><ArrowRight size={16}/></button>)}
    {searched && !offers.length && !busy && <div className="market-empty"><Search size={28}/><strong>Варианты пока не загрузились</strong><p>Попробуйте короткое название без дозировки или откройте поиск аптеки ниже.</p></div>}
    {error && <p className="market-error">{error}</p>}
    <div className="home-title"><h2>Проверить в сервисах</h2></div><div className="pharmacy-list">{localPharmacies.map(pharmacy => <a href={pharmacy.name.startsWith('ЕАПТЕКА') && query.trim() ? `https://www.eapteka.ru/search/?q=${encodeURIComponent(query.trim())}` : pharmacy.url} target="_blank" rel="noopener noreferrer" className="pharmacy-card" key={pharmacy.name}><span className={pharmacy.name === 'Здравсити' ? 'zdravcity-logo' : ''}><img src={pharmacy.logo} alt=""/></span><div><strong>{pharmacy.name}</strong><small>{pharmacy.name.startsWith('ЕАПТЕКА') && query.trim() ? `Открыть поиск «${query.trim()}» · ${pharmacy.address}` : pharmacy.address}</small></div><ArrowRight size={18}/></a>)}</div>
    <p className="market-footnote">Варианты и цены по Подольску не означают наличие в Кузнечиках. Зелёным адресом отмечена цена найденного местного пункта. Откройте карточку, проверьте наличие и добавьте нужную упаковку в корзину аптеки.</p>
    {selectedOffer && <div className="sheet-backdrop market-location-backdrop" onClick={closeLocations}><div className="market-location-sheet" onClick={event => event.stopPropagation()}><div className="sheet-handle"/><button className="sheet-close" onClick={closeLocations} aria-label="Закрыть"><X/></button><span className="market-location-kicker">КУЗНЕЧИКИ · ПОДОЛЬСК</span><h2>Где забрать?</h2><p className="market-location-product">{selectedOffer.name}</p><div className="market-location-scroll">{localBusy && <div className="market-loading"><span className="market-loading-pulse"><MapPin size={18}/></span><div><strong>Проверяем аптеки рядом</strong><small>Сравниваем адреса и цены этой упаковки.</small></div></div>}{nearbyPharmacies.map((pharmacy, index) => <div className="market-location-card" key={`${pharmacy.address}-${index}`}><div className="market-location-card-top"><strong>{pharmacy.name}</strong><b>{pharmacy.price.toLocaleString('ru-RU')} ₽</b></div><p>{pharmacy.address}</p><small>{pharmacy.hours}</small><div className="market-location-actions"><a href={`https://yandex.ru/maps/?text=${encodeURIComponent(pharmacy.address)}`} target="_blank" rel="noopener noreferrer"><MapPin size={15}/> На карте</a><button onClick={() => choosePharmacy(pharmacy)}>К товару и заказу <ArrowRight size={15}/></button></div></div>)}{!localBusy && !nearbyPharmacies.length && <div className="market-empty"><MapPin size={24}/><strong>Местные пункты для этой упаковки не найдены</strong><p>{localError || 'Проверьте другие варианты или пункты выдачи на сайте аптеки.'}</p></div>}</div><a className="market-all-link" href={selectedOffer.url} target="_blank" rel="noopener noreferrer">Открыть карточку товара на сайте аптеки <ArrowRight size={15}/></a><p className="market-location-footnote">При переходе приложение попробует скопировать адрес аптеки. На сайте подтвердите этот пункт выдачи в корзине.</p></div></div>}
    {editing && <div className="market-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(false); }}><form className="market-overlay-panel" onSubmit={search}><button type="button" className="market-overlay-close" onClick={() => setEditing(false)} aria-label="Закрыть поиск"><X size={21}/></button><span className="market-overlay-kicker">ПОИСК ЛЕКАРСТВ</span><h2>Что ищем?</h2><div className="market-overlay-input"><Search size={23}/><input autoFocus value={draft} onChange={event => setDraft(event.target.value)} placeholder="Название препарата" aria-label="Название препарата"/></div><button className="family-primary" type="submit" disabled={draft.trim().length < 2}>Показать аптеки <ArrowRight size={17}/></button><small>Кузнечики · Подольск</small></form></div>}
  </>;
}

function ExpiryView({ items, back, setSelected }: { items: Inventory[]; back: () => void; setSelected: (m: Inventory) => void }) {
  const soon = items.flatMap(m => m.batches.filter(b => b.quantity > 0 && ['soon', 'expired'].includes(expiryStatus(b.expires_on))).map(b => ({ m, b }))).sort((a, b) => (a.b.expires_on || '').localeCompare(b.b.expires_on || ''));
  return <><Header title="Сроки годности" back={back}/><p className="family-subtitle">Проверьте эти упаковки в первую очередь.</p><div className="expiry-count"><Clock3 size={28}/><strong>{soon.length}</strong><span>упаковок требуют внимания</span></div><div className="family-med-list">{soon.map(({ m, b }) => <button key={b.id} className="family-med-row" onClick={() => setSelected(m)}><MedicineArt item={m}/><span><strong>{m.name}</strong><small>{b.storage_location || 'Место не указано'}</small></span><em>{formatDate(b.expires_on, b.expiry_precision)}</em><ChevronRight size={17}/></button>)}</div>{!soon.length && <div className="family-empty"><Check size={35}/><h3>Всё спокойно</h3><p>Ближайших сроков годности нет.</p></div>}</>;
}

function HistoryView({ items, usage, back }: { items: Inventory[]; usage: Usage[]; back: () => void }) {
  return <><Header title="Моя история" back={back}/><p className="family-subtitle">Личные записи об использовании лекарств.</p><div className="history-list">{usage.map(entry => <div className="history-card" key={entry.id}><span><Activity size={18}/></span><div><strong>{items.find(m => m.id === entry.medicine_id)?.name || 'Лекарство'}</strong><small>{new Date(entry.used_at).toLocaleString('ru-RU')}</small></div><b>−{entry.quantity} {entry.unit}</b></div>)}</div>{!usage.length && <div className="family-empty"><Activity size={35}/><h3>Записей пока нет</h3><p>Здесь появятся лекарства, которые вы отметите как использованные.</p></div>}</>;
}

function ProfileView({ slot, count, switchProfile }: { slot: Slot; count: number; switchProfile: () => Promise<void> }) {
  const profile = family.find(p => p.slot === slot)!;
  return <><Header title="Мой профиль"/><div className="my-profile"><span className={`pin-avatar ${profile.color}`}>{profile.icon}</span><div><span className="eyebrow">СЕЙЧАС В АПТЕЧКЕ</span><h2>{profile.name}</h2><p>Личные советы и история защищены кодом.</p></div></div><div className="profile-explain"><ShieldCheck size={23}/><span><strong>Общая аптечка, личный помощник</strong><p>Все {count} записей о лекарствах доступны семье. Ваши диалоги с ИИ видны только в этом профиле.</p></span></div><button className="family-primary switch-profile" onClick={() => void switchProfile()}><UserRound size={18}/> Выбрать другой профиль</button><div className="profile-help"><h3>Уведомления о сроках</h3><p>При открытии приложения напомним о лекарствах, срок которых скоро истечёт.</p><button className="family-secondary profile-notify" onClick={() => { if ('Notification' in window) void Notification.requestPermission(); }}><Bell size={17}/> Разрешить уведомления</button></div><div className="profile-help"><h3>Установить на телефон</h3><p>На iPhone откройте меню «Поделиться» в Safari и выберите «На экран Домой». На Android выберите «Установить приложение» в меню браузера.</p></div><div className="profile-help"><h3>О защите кода</h3><p>Код состоит из четырёх цифр. После пяти неверных попыток вход временно блокируется на 15 минут.</p></div></>;
}

export default App;
