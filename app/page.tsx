'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────
interface PantryItem {
  id: string; name: string; emoji: string; cat: string;
  qty: number; unit: string; price: number;
  expiry: string; expDays: number; src: string;
}
interface FamilyMember { id: number; name: string; role: string; age: number; avatar: string; }
interface Meal {
  id: string; name: string; emoji: string; time_minutes: number;
  servings: number; calories: number; protein: number; carbs: number; fat: number;
  kid_safe: boolean; uses_expiring: boolean;
  ingredients_used: {name: string; qty: string}[];
  steps: string[]; notes: string;
}
interface Profile {
  name: string; city: string; isVeg: boolean; eatsEggs: boolean;
  hasToddler: boolean; toddlerName: string; toddlerAge: number;
  familySize: number; allergies: string[];
  notifTimes: Record<string, string>;
  cuisines: string[];
}
interface CookLog { id: string; name: string; period: string; date: string; }
interface ItemLog  { id: string; name: string; emoji: string; price: number; date: string; }
interface Region   { symbol: string; avgTakeout: number; groceryApps: string[]; monthlyPrice: string; monthlyPriceNum: number; avgOrderSize: number; priceMultiplier: number; }

// ── Region / currency map ──────────────────────────────────────────
const REGIONS: Record<string,Region> = {
  //                              per-meal  monthly     monthly#   avg grocery  price vs
  //                              saving    price       (number)   order size   demo scale
  IN: { symbol:'₹',   avgTakeout:300, monthlyPrice:'₹99',    monthlyPriceNum:99,   avgOrderSize:800,  priceMultiplier:1,     groceryApps:['Swiggy Instamart','Blinkit','Zepto','BigBasket','Amazon Fresh India'] },
  SG: { symbol:'S$',  avgTakeout:18,  monthlyPrice:'S$5.99', monthlyPriceNum:5.99, avgOrderSize:60,   priceMultiplier:0.017, groceryApps:['FoodPanda','GrabMart','RedMart','NTUC FairPrice Online','Amazon Fresh SG'] },
  US: { symbol:'$',   avgTakeout:15,  monthlyPrice:'$4.99',  monthlyPriceNum:4.99, avgOrderSize:80,   priceMultiplier:0.012, groceryApps:['Instacart','Amazon Fresh','DoorDash Grocery','Walmart Grocery'] },
  GB: { symbol:'£',   avgTakeout:12,  monthlyPrice:'£3.99',  monthlyPriceNum:3.99, avgOrderSize:55,   priceMultiplier:0.0095,groceryApps:['Ocado','Tesco','Sainsbury\'s Online','Amazon Fresh UK'] },
  AU: { symbol:'A$',  avgTakeout:20,  monthlyPrice:'A$6.99', monthlyPriceNum:6.99, avgOrderSize:90,   priceMultiplier:0.018, groceryApps:['Woolworths Online','Coles Online','Amazon Fresh AU'] },
  AE: { symbol:'AED ',avgTakeout:50,  monthlyPrice:'AED 15', monthlyPriceNum:15,   avgOrderSize:150,  priceMultiplier:0.044, groceryApps:['Noon','Carrefour Online','Amazon Fresh UAE','Talabat Mart'] },
  MY: { symbol:'RM',  avgTakeout:20,  monthlyPrice:'RM 15',  monthlyPriceNum:15,   avgOrderSize:120,  priceMultiplier:0.056, groceryApps:['FoodPanda','GrabMart','Jaya Grocer Online'] },
  CA: { symbol:'CA$', avgTakeout:16,  monthlyPrice:'CA$5.99',monthlyPriceNum:5.99, avgOrderSize:85,   priceMultiplier:0.016, groceryApps:['Instacart','Amazon Fresh CA','Walmart Grocery CA'] },
};
const DEFAULT_REGION = REGIONS['IN'];
function detectRegion(): Region {
  if(typeof navigator==='undefined') return DEFAULT_REGION;
  const cc = (navigator.language||'en-IN').split('-')[1]?.toUpperCase()||'IN';
  return REGIONS[cc] ?? DEFAULT_REGION;
}

// ── Constants ──────────────────────────────────────────────────────
const SHELF: Record<string, number> = {
  spinach:3,kale:4,methi:3,coriander:4,mint:5,lettuce:5,
  tomato:5,tomatoes:5,capsicum:7,'bell pepper':7,cucumber:7,broccoli:5,
  carrot:14,onion:30,garlic:30,ginger:21,potato:21,mushroom:5,beans:5,
  banana:5,mango:4,apple:14,orange:10,lemon:14,papaya:5,grape:7,strawberry:3,
  milk:7,doodh:7,paneer:4,cheese:14,curd:5,dahi:5,yogurt:7,'greek yogurt':10,
  butter:30,ghee:180,cream:7,
  egg:21,eggs:21,anda:21,
  chicken:2,mutton:2,fish:1,prawn:1,shrimp:1,tofu:5,
  bread:5,roti:2,chapati:2,paratha:3,naan:3,
  rice:180,oats:180,pasta:730,flour:90,atta:90,maida:90,dal:180,lentil:180,chana:365,
  ketchup:180,jam:90,honey:730,oil:180,default:5,
};

const EMOJIS: Record<string, string> = {
  spinach:'🥬',tomato:'🍅',tomatoes:'🍅',onion:'🧅',potato:'🥔',carrot:'🥕',
  capsicum:'🫑',cucumber:'🥒',broccoli:'🥦',banana:'🍌',mango:'🥭',apple:'🍎',
  orange:'🍊',lemon:'🍋',milk:'🥛',paneer:'🧀',cheese:'🧀',curd:'🫙',yogurt:'🫙',
  'greek yogurt':'🫙',butter:'🧈',ghee:'🫙',egg:'🥚',eggs:'🥚',
  chicken:'🍗',fish:'🐟',prawn:'🦐',bread:'🍞',roti:'🫓',rice:'🌾',oats:'🥣',
  dal:'🫘',lentil:'🫘',chana:'🫘',
};

// ── Pantry staples — never expire, don't track in fridge ──────────
const STAPLES = new Set([
  'salt','sugar','oil','cooking oil','olive oil','mustard oil','coconut oil','vegetable oil',
  'atta','flour','maida','besan','turmeric','haldi','chilli powder','red chilli','cumin','jeera',
  'coriander powder','garam masala','pepper','black pepper','baking soda','baking powder',
  'vinegar','soy sauce','tea','coffee','instant coffee',
]);
function isStaple(name: string): boolean {
  const lc = name.toLowerCase();
  return STAPLES.has(lc) || [...STAPLES].some(s => lc.includes(s));
}

// ── Kitchen essentials bundles (one-tap add) ──────────────────────
const ESSENTIALS: {name:string;emoji:string;cat:string;qty:number;unit:string}[] = [
  {name:'Salt',emoji:'🧂',cat:'Pantry',qty:1,unit:'kg'},
  {name:'Sugar',emoji:'🍬',cat:'Pantry',qty:1,unit:'kg'},
  {name:'Cooking Oil',emoji:'🫒',cat:'Pantry',qty:1,unit:'L'},
  {name:'Turmeric',emoji:'🟡',cat:'Pantry',qty:100,unit:'g'},
  {name:'Cumin',emoji:'🫘',cat:'Pantry',qty:100,unit:'g'},
  {name:'Red Chilli Powder',emoji:'🌶️',cat:'Pantry',qty:100,unit:'g'},
  {name:'Tea',emoji:'🍵',cat:'Pantry',qty:250,unit:'g'},
  {name:'Atta / Flour',emoji:'🌾',cat:'Pantry',qty:5,unit:'kg'},
];

// ── Category-Standard quantity defaults ───────────────────────────
// Used when voice/scan gives no explicit qty. Priority: history > these > 1pcs
const CATEGORY_DEFAULTS: Record<string, {qty:number; unit:string}> = {
  // Root vegetables → weight
  carrot:   {qty:500, unit:'g'},   potato:  {qty:1,   unit:'kg'},
  onion:    {qty:500, unit:'g'},   garlic:  {qty:100, unit:'g'},
  ginger:   {qty:100, unit:'g'},   beetroot:{qty:500, unit:'g'},
  radish:   {qty:500, unit:'g'},   yam:     {qty:500, unit:'g'},
  // Leafy greens → bunch
  spinach:  {qty:1,   unit:'bunch'},kale:   {qty:1,   unit:'bunch'},
  methi:    {qty:1,   unit:'bunch'},coriander:{qty:1,  unit:'bunch'},
  mint:     {qty:1,   unit:'bunch'},lettuce:{qty:1,    unit:'bunch'},
  // Fruit → pcs (standard buy)
  banana:   {qty:6,   unit:'pcs'}, apple:   {qty:6,  unit:'pcs'},
  mango:    {qty:4,   unit:'pcs'}, orange:  {qty:4,  unit:'pcs'},
  tomato:   {qty:4,   unit:'pcs'}, tomatoes:{qty:4,  unit:'pcs'},
  lemon:    {qty:4,   unit:'pcs'}, grape:   {qty:500,unit:'g'},
  strawberry:{qty:250,unit:'g'},   papaya:  {qty:1,  unit:'pcs'},
  // Dairy
  milk:     {qty:1,   unit:'L'},   doodh:   {qty:1,  unit:'L'},
  curd:     {qty:400, unit:'g'},   dahi:    {qty:400,unit:'g'},
  paneer:   {qty:250, unit:'g'},   butter:  {qty:100,unit:'g'},
  cheese:   {qty:200, unit:'g'},   cream:   {qty:200,unit:'ml'},
  yogurt:   {qty:400, unit:'g'},   'greek yogurt':{qty:400,unit:'g'},
  ghee:     {qty:500, unit:'ml'},
  // Protein
  egg:      {qty:12,  unit:'pcs'}, eggs:    {qty:12, unit:'pcs'},
  anda:     {qty:12,  unit:'pcs'}, chicken: {qty:500,unit:'g'},
  fish:     {qty:500, unit:'g'},   prawn:   {qty:500,unit:'g'},
  mutton:   {qty:500, unit:'g'},   tofu:    {qty:400,unit:'g'},
  // Grains / pantry
  rice:     {qty:1,   unit:'kg'},  oats:    {qty:500,unit:'g'},
  pasta:    {qty:500, unit:'g'},   bread:   {qty:1,  unit:'loaf'},
  naan:     {qty:4,   unit:'pcs'}, roti:    {qty:6,  unit:'pcs'},
  // Beverages
  juice:    {qty:1,   unit:'L'},   water:   {qty:1,  unit:'L'},
};
function getCategoryDefault(name: string): {qty:number; unit:string} {
  const lc = name.toLowerCase();
  const keys = Object.keys(CATEGORY_DEFAULTS).sort((a,b)=>b.length-a.length);
  const match = keys.find(k => lc.includes(k));
  return match ? CATEGORY_DEFAULTS[match] : {qty:1, unit:'pcs'};
}

// ── Historical defaulting: mode (most-frequent) qty from past purchases ──
interface PurchaseRecord { name:string; qty:number; unit:string; }
function getHistoricalDefault(name: string, history: PurchaseRecord[]): {qty:number;unit:string}|null {
  const lc = name.toLowerCase();
  const matches = history.filter(h => h.name.toLowerCase() === lc);
  if (!matches.length) return null;
  const freq: Record<string,{qty:number;unit:string;count:number}> = {};
  matches.forEach(m => {
    const k = `${m.qty}_${m.unit}`;
    if (!freq[k]) freq[k] = {qty:m.qty, unit:m.unit, count:0};
    freq[k].count++;
  });
  return Object.values(freq).sort((a,b)=>b.count-a.count)[0];
}

// ── Qty adjustment step per unit ─────────────────────────────────
function getQtyStep(unit: string): number {
  if (['g','ml'].includes(unit)) return 50;
  if (['kg','L'].includes(unit)) return 0.5;
  return 1; // pcs, bunch, loaf, etc.
}
function fmtQty(qty:number, unit:string): string {
  const q = qty % 1 === 0 ? qty : qty.toFixed(1);
  return `${q}${unit==='pcs'?'':' '}${unit}`;
}

const PERIODS = [
  {id:'breakfast',label:'Breakfast',emoji:'☀️',time:'7–9 AM',color:'#F59E0B',bg:'#FFFBEB',brd:'#FDE68A'},
  {id:'lunch',    label:'Lunch',    emoji:'🌤️',time:'12–2 PM',color:'#22C55E',bg:'#F0FDF4',brd:'#86EFAC'},
  {id:'snack',    label:'Snack',    emoji:'🍎',time:'4–5 PM', color:'#7C3AED',bg:'#F5F3FF',brd:'#C4B5FD'},
  {id:'dinner',   label:'Dinner',  emoji:'🌙',time:'6–8 PM', color:'#1E3A8A',bg:'#EFF6FF',brd:'#BFDBFE'},
];

function getShelfDays(name: string): number {
  const lc = name.toLowerCase();
  const sorted = Object.keys(SHELF).filter(k=>k!=='default').sort((a,b)=>b.length-a.length);
  const match  = sorted.find(k=>lc.includes(k));
  return SHELF[match||'default'];
}
function getEmoji(name: string): string {
  const lc = name.toLowerCase();
  return Object.entries(EMOJIS).sort((a,b)=>b[0].length-a[0].length).find(([k])=>lc.includes(k))?.[1] ?? '📦';
}
function daysLeft(expiry: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(expiry); exp.setHours(0,0,0,0);
  return Math.ceil((exp.getTime()-today.getTime())/86400000);
}
function expiryDate(days: number): string {
  const d = new Date(); d.setDate(d.getDate()+days);
  return d.toISOString().split('T')[0];
}
function uid(): string { return Math.random().toString(36).slice(2,10); }
function fmtDays(d: number): string {
  if(d<0)  return 'Expired';
  if(d===0) return 'Today';
  if(d===1) return 'Tomorrow';
  return `${d} days`;
}

// ── Consume verb helper (for markUsed toast) ──────────────────────
function consumeVerb(name: string): string {
  const lc = name.toLowerCase();
  if (['milk','juice','water','doodh','lassi','smoothie','tea','coffee','oil','broth'].some(l => lc.includes(l))) return 'Consumed';
  return 'Finished';
}

// ── Confetti ───────────────────────────────────────────────────────
function Confetti({on}:{on:boolean}) {
  if(!on) return null;
  const cols = ['#86EFAC','#F59E0B','#1E3A8A','#F87171','#C084FC','#FCD34D'];
  return (
    <div id="confetti-layer">
      {Array.from({length:26},(_,i)=>{
        const x=Math.random()*100,d=Math.random()*.5,dur=1.4+Math.random()*.8;
        const c=cols[i%6],sz=6+Math.random()*8,circ=Math.random()>.5;
        return <div key={i} style={{position:'absolute',left:`${x}%`,top:0,width:sz,height:sz,background:c,borderRadius:circ?'50%':'2px',animation:`cfFall ${dur}s ease-in ${d}s both`}}/>;
      })}
    </div>
  );
}

// ── Swipeable Pantry Row ───────────────────────────────────────────
function PantryRow({item,onTap,onEditExpiry,onDelete}:{item:PantryItem;onTap:(item:PantryItem)=>void;onEditExpiry:(item:PantryItem)=>void;onDelete:(id:string)=>void}) {
  const dl = daysLeft(item.expiry);
  const urgent = dl <= 1;
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--white)',border:`1.5px solid ${urgent?'#FCA5A540':'var(--border)'}`,borderRadius:14,padding:'11px 12px',marginBottom:8,cursor:'pointer'}}
      onClick={()=>onTap(item)}>
      <span style={{fontSize:24}}>{item.emoji}</span>
      <div style={{flex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
          <span style={{fontWeight:800,fontSize:14,color:'var(--ink)'}}>{item.name}</span>
          <span className={urgent?'pill pill-red':'pill pill-green'}>{urgent?'⚠ ':''}{fmtDays(dl)}</span>
        </div>
        <span style={{fontSize:11,color:'var(--gray)'}}>{item.qty}{item.unit} · {item.src}</span>
      </div>
      <button onClick={e=>{e.stopPropagation();onEditExpiry(item);}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--gray)',fontSize:11,fontWeight:700,textDecoration:'underline',padding:'4px',flexShrink:0}}>edit</button>
      <button onClick={e=>{e.stopPropagation();onDelete(item.id);}}
        style={{background:'none',border:'none',cursor:'pointer',color:'#EF4444',fontSize:16,padding:'4px',flexShrink:0}}
        title="Delete">🗑</button>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────
export default function App() {
  // ── Persistent state (localStorage) ────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    name:'', city:'', isVeg:true, eatsEggs:true,
    hasToddler:false, toddlerName:'', toddlerAge:2, familySize:2, allergies:[],
    notifTimes:{breakfast:'07:30',lunch:'11:30',snack:'16:00',dinner:'17:30'},
    cuisines:[],
  });
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [cookLog, setCookLog] = useState<CookLog[]>([]);
  const [wasteLog, setWasteLog] = useState<ItemLog[]>([]);
  const [ateLog,   setAteLog]   = useState<ItemLog[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);
  const [voiceToast, setVoiceToast] = useState<{items:PantryItem[];activeIdx:number}|null>(null);
  const voiceToastTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [region,    setRegion]    = useState<Region>(DEFAULT_REGION);
  useEffect(()=>{ setRegion(detectRegion()); },[]);
  const fmt = (n:number) => `${region.symbol}${n.toLocaleString(undefined,{maximumFractionDigits:0})}`;

  // ── UI state ────────────────────────────────────────────────────
  const [tab, setTab] = useState('fridge');
  const [obStep, setObStep] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [period, setPeriod] = useState('dinner');
  const [meals, setMeals] = useState<Record<string,Meal[]>>({});
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [cooking, setCooking] = useState<Meal|null>(null);
  const [cookStep, setCookStep] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [editExpiry, setEditExpiry] = useState<PantryItem|null>(null);
  const [newExpiryDays, setNewExpiryDays] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [actionItem, setActionItem] = useState<PantryItem|null>(null);
  const [scanning,  setScanning]  = useState(false);
  const [usedQty,      setUsedQty]      = useState('');
  const [showEmail,    setShowEmail]    = useState(false);
  const [emailText,    setEmailText]    = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [gmailToken,   setGmailToken]   = useState('');
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [fridgeAuditDone, setFridgeAuditDone] = useState(false);
  const [essentialsAdded, setEssentialsAdded] = useState(false);
  const [addPath, setAddPath] = useState<'photo'|'voice'|'email'|null>(null);
  // ── Auto-sync state ─────────────────────────────────────────────
  const [syncEmail, setSyncEmail] = useState('');
  const [syncUserId, setSyncUserId] = useState('');
  const [syncLog, setSyncLog] = useState<{store:string;count:number;syncedAt:string;items:string[]}[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [showSyncSetup, setShowSyncSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cookedTimestamps, setCookedTimestamps] = useState<Record<string,string>>({});
  const [dailyRescipe, setDailyRescipe] = useState<{item:PantryItem;recipe:string}|null>(null);
  const photoInputRef = useRef<HTMLInputElement|null>(null);
  const fridgeAuditRef = useRef<HTMLInputElement|null>(null);
  const recognitionRef = useRef<unknown>(null);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Load from localStorage ──────────────────────────────────────
  useEffect(()=>{
    try {
      const saved = localStorage.getItem('mise_v1');
      if(saved) {
        const d = JSON.parse(saved);
        if(d.onboardingDone) setOnboardingDone(true);
        if(d.profile)  setProfile(d.profile);
        if(d.family)   setFamily(d.family);
        if(d.pantry)   setPantry(d.pantry);
        if(d.cookLog)  setCookLog(d.cookLog);
        if(d.wasteLog) setWasteLog(d.wasteLog);
        if(d.ateLog)   setAteLog(d.ateLog);
        if(d.isPremium) setIsPremium(true);
        if(d.purchaseHistory) setPurchaseHistory(d.purchaseHistory);
        if(d.syncEmail)  { setSyncEmail(d.syncEmail);  }
        if(d.syncUserId) { setSyncUserId(d.syncUserId); }
        if(d.syncLog)    { setSyncLog(d.syncLog); }
        if(d.cookedTimestamps) setCookedTimestamps(d.cookedTimestamps);
      }
    } catch{}
  },[]);

  // ── Save to localStorage ────────────────────────────────────────
  const save = useCallback((updates: Partial<{onboardingDone:boolean;profile:Profile;family:FamilyMember[];pantry:PantryItem[];cookLog:CookLog[];wasteLog:ItemLog[];ateLog:ItemLog[];isPremium:boolean;purchaseHistory:PurchaseRecord[];syncEmail:string;syncUserId:string;syncLog:{store:string;count:number;syncedAt:string;items:string[]}[];cookedTimestamps:Record<string,string>}>)=>{
    try {
      const current = JSON.parse(localStorage.getItem('mise_v1')||'{}');
      localStorage.setItem('mise_v1', JSON.stringify({...current,...updates}));
    } catch{}
  },[]);

  // ── Toast ───────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(()=>setToast(''),2500);
  };

  // ── Voice interactive toast ──────────────────────────────────────
  const showVoiceToast = (items: PantryItem[]) => {
    if (voiceToastTimer.current) clearTimeout(voiceToastTimer.current);
    setVoiceToast({items, activeIdx: 0});
    voiceToastTimer.current = setTimeout(() => setVoiceToast(null), 7000);
  };
  const dismissVoiceToast = () => {
    if (voiceToastTimer.current) clearTimeout(voiceToastTimer.current);
    setVoiceToast(null);
  };
  const adjustVoiceQty = (delta: number) => {
    if (!voiceToast) return;
    const item = voiceToast.items[voiceToast.activeIdx];
    const step = getQtyStep(item.unit);
    const newQty = Math.max(step, Math.round((item.qty + delta * step) * 100) / 100);
    setPantry(p => {
      const updated = p.map(i => i.id === item.id ? {...i, qty: newQty} : i);
      save({pantry: updated});
      return updated;
    });
    setVoiceToast(vt => vt ? {
      ...vt, items: vt.items.map(i => i.id === item.id ? {...i, qty: newQty} : i)
    } : null);
    if (voiceToastTimer.current) clearTimeout(voiceToastTimer.current);
    voiceToastTimer.current = setTimeout(() => setVoiceToast(null), 7000);
  };
  const cycleVoiceToastItem = () => {
    if (!voiceToast || voiceToast.items.length <= 1) return;
    setVoiceToast(vt => vt ? {...vt, activeIdx:(vt.activeIdx+1) % vt.items.length} : null);
  };

  // ── Service worker + push notifications ─────────────────────────
  useEffect(()=>{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    }
    setNotifEnabled(Notification.permission==='granted');
  },[]);

  const enableNotifications = async () => {
    if(!('Notification' in window)) return showToast('Notifications not supported');
    const perm = await Notification.requestPermission();
    if(perm !== 'granted') return showToast('Notifications blocked — enable in browser settings');
    setNotifEnabled(true);
    scheduleNotifications();
    showToast('✅ Notifications enabled!');
  };

  const scheduleNotifications = () => {
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(reg => {
      const times: Record<string,string> = profile.notifTimes;
      const labels: Record<string,string> = {
        breakfast:'🌅 Breakfast idea ready',
        lunch:'🌤️ Lunch suggestion from your fridge',
        snack:'🍎 Snack idea for later',
        dinner:'🌙 Tonight\'s dinner recommendation',
      };
      Object.entries(times).forEach(([meal, timeStr])=>{
        const [h,m] = timeStr.split(':').map(Number);
        const now = new Date();
        const next = new Date(); next.setHours(h,m,0,0);
        if(next<=now) next.setDate(next.getDate()+1);
        const delay = next.getTime()-now.getTime();
        const expiring = pantry.filter(i=>daysLeft(i.expiry)<=1).map(i=>i.name);
        const body = expiring.length
          ? `Use ${expiring[0]} before it expires — tap to see what to cook.`
          : 'Tap to see what to make from your fridge.';
        reg.active?.postMessage({ type:'SCHEDULE_NOTIF', title: labels[meal]||'FreshNudge 🍳', body, delayMs: delay });
      });
    });
  };

  // ── Auto-sync: generate unique inbound email ────────────────────
  const getOrCreateSyncEmail = async () => {
    if (syncEmail) return syncEmail;
    setSyncLoading(true);
    try {
      // Stable userId from localStorage (or create one)
      let uid_ = syncUserId;
      if (!uid_) {
        uid_ = 'user_' + uid();
        setSyncUserId(uid_);
        save({syncUserId: uid_});
      }
      const res = await fetch('/api/inbound-email/generate', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({userId: uid_}),
      });
      const data = await res.json();
      if (data.inboundEmail) {
        setSyncEmail(data.inboundEmail);
        save({syncEmail: data.inboundEmail});
        return data.inboundEmail as string;
      }
    } catch { showToast('Could not generate sync email — try again'); }
    finally { setSyncLoading(false); }
    return '';
  };

  // ── Auto-sync: copy email to clipboard ──────────────────────────
  const copySyncEmail = async () => {
    const email = syncEmail || await getOrCreateSyncEmail();
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { showToast('Copy failed — tap and hold to copy'); }
  };

  // ── Auto-sync: poll for pending items (2x/day: 9 AM & 6 PM, or focus after 6h gap) ─────────
  useEffect(() => {
    const checkPending = async () => {
      const uid_ = syncUserId;
      if (!uid_ || !syncEmail) return;
      // Time-gate: only sync at 9:00–9:30 AM or 18:00–18:30 PM, or if focus after 6h gap
      const now = new Date();
      const h = now.getHours(), mm = now.getMinutes();
      const inWindow = (h === 9 && mm < 30) || (h === 18 && mm < 30);
      const lastSync = parseInt(localStorage.getItem('lastSyncTs') || '0');
      const sinceLastSync = Date.now() - lastSync;
      if (!inWindow && sinceLastSync < 6 * 3600000) return;
      try {
        const res = await fetch(`/api/inbound-email/pending?userId=${uid_}`);
        const data = await res.json();
        if (data.items?.length) {
          addItems(data.items, {src: `📧 ${data.store || 'Email sync'}`});
          const entry = {store: data.store||'Email', count:data.items.length, syncedAt:new Date().toISOString(), items:data.items.slice(0,5).map((i:{item_name:string})=>i.item_name)};
          const newLog = [entry,...syncLog].slice(0,10);
          setSyncLog(newLog);
          save({syncLog:newLog});
          showToast(`🎉 ${data.items.length} items synced from ${data.store||'email'}!`);
          localStorage.setItem('lastSyncTs', Date.now().toString());
        }
      } catch {} // silent — polling should never crash the app
    };
    checkPending();
    window.addEventListener('focus', checkPending);
    return () => window.removeEventListener('focus', checkPending);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUserId, syncEmail]);

  // ── Auto-sync: refresh sync status from server ──────────────────
  const refreshSyncStatus = async () => {
    if (!syncUserId) return;
    try {
      const res = await fetch(`/api/inbound-email/status?userId=${syncUserId}`);
      const data = await res.json();
      if (data.syncs?.length) {
        setSyncLog(data.syncs);
        save({syncLog: data.syncs});
      }
    } catch {}
  };

  // ── Photo / receipt scanner ──────────────────────────────────────
  const handlePhotoScan = async (file: File) => {
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('dietary', JSON.stringify({isVeg:profile.isVeg,eatsEggs:profile.eatsEggs}));
      const res  = await fetch('/api/scan', {method:'POST',body:fd});
      const data = await res.json();
      if(data.items?.length){
        addItems(data.items);
        showToast(`📸 Added ${data.items.length} items${data.store?` from ${data.store}`:''}`);
      } else {
        showToast('Nothing recognised — try a clearer photo');
      }
    } catch { showToast('Scan failed — try again'); }
    finally { setScanning(false); }
  };

  // ── Email sync ───────────────────────────────────────────────────
  const handleEmailSync = async () => {
    if(!emailText.trim()) return;
    setEmailLoading(true);
    try {
      const res  = await fetch('/api/email-sync', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({emailText, dietary:{isVeg:profile.isVeg,eatsEggs:profile.eatsEggs}}),
      });
      const data = await res.json();
      if(data.items?.length){
        addItems(data.items);
        setEmailText('');
        setShowEmail(false);
        showToast(`✅ Added ${data.items.length} items${data.store?` from ${data.store}`:''}`);
      } else {
        showToast('No grocery items found in that email');
      }
    } catch { showToast('Email parsing failed'); }
    finally { setEmailLoading(false); }
  };

  // ── Gmail OAuth setup guide state ───────────────────────────────
  const [showGmailSetup, setShowGmailSetup] = useState(false);

  // ── Gmail OAuth + auto-sync ──────────────────────────────────────
  const connectGmail = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    // No client ID — show in-app setup guide instead of silent toast
    if (!clientId) { setShowGmailSetup(true); return; }

    // GIS script may still be loading (async defer) — retry up to 3s
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tryInit = (attempts = 0) => {
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        if (attempts < 6) { setTimeout(() => tryInit(attempts + 1), 500); return; }
        showToast('Google sign-in failed to load — check your connection'); return;
      }
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
          callback: async (resp: { access_token?: string; error?: string }) => {
            if (resp.error || !resp.access_token) {
              const msg = resp.error === 'popup_closed_by_user'
                ? 'Popup closed — tap Connect Gmail to try again'
                : `Gmail error: ${resp.error || 'unknown'}`;
              showToast(msg); return;
            }
            setGmailToken(resp.access_token);
            setGmailConnected(true);
            showToast('✅ Gmail connected — syncing orders…');
            await syncGmailOrders(resp.access_token);
          },
        });
        client.requestAccessToken();
      } catch (e) {
        showToast('Could not open Gmail login — check pop-up blocker');
        console.error('Gmail OAuth error:', e);
      }
    };
    tryInit();
  };

  const syncGmailOrders = async (token: string) => {
    setGmailSyncing(true);
    try {
      // Sync from the date the user first used the app (or 60 days back)
      const saved = JSON.parse(localStorage.getItem('mise_v1') || '{}');
      const sinceDate = saved.joinDate || new Date(Date.now() - 60 * 86400000).toISOString();

      const res  = await fetch('/api/gmail-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          dietary: { isVeg: profile.isVeg, eatsEggs: profile.eatsEggs },
          sinceDate,
        }),
      });
      const data = await res.json();
      if (data.items?.length) {
        addItems(data.items);
        const storeList = data.stores?.join(', ') || 'your orders';
        showToast(`📧 Added ${data.items.length} items from ${storeList}`);
      } else {
        showToast(`Scanned ${data.emailsScanned ?? 0} emails — no new grocery orders found`);
      }
    } catch { showToast('Gmail sync failed'); }
    finally { setGmailSyncing(false); }
  };

  // ── Onboarding ──────────────────────────────────────────────────
  const OB_STEPS = ['welcome','family','name','diet','cuisine','paths','notifications','payment','done'];
  const obPct = Math.round(((obStep+1)/OB_STEPS.length)*100);

  const completeOnboarding = () => {
    setOnboardingDone(true);
    // Record join date for Gmail sync lookback
    try {
      const cur = JSON.parse(localStorage.getItem('mise_v1')||'{}');
      if (!cur.joinDate) localStorage.setItem('mise_v1', JSON.stringify({...cur, joinDate: new Date().toISOString()}));
    } catch{}
    // Start with empty fridge — user fills it via Fridge Audit, essentials, or voice
    const demo: PantryItem[] = [];
    setPantry(demo);
    setFridgeAuditDone(false);
    setEssentialsAdded(false);
    const fam: FamilyMember[] = [
      {id:1,name:profile.name||'You',role:'Adult',age:30,avatar:'👤'},
    ];
    if(profile.hasToddler) fam.push({id:2,name:profile.toddlerName||'Little one',role:'Toddler',age:profile.toddlerAge,avatar:'👶'});
    setFamily(fam);
    save({onboardingDone:true,profile,family:fam,pantry:demo});
  };

  // ── Add items to pantry ─────────────────────────────────────────
  // opts.interactive = true shows the voice quick-adjust toast
  const addItems = useCallback((
    items: {item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string;price?:number}[],
    opts?: {interactive?: boolean; src?: string}
  ) => {
    const newItems: PantryItem[] = items.map(i=>{
      const days = getShelfDays(i.item_name);

      // Qty resolution: explicit → history mode → category standard → 1pcs
      let resolvedQty  = i.quantity;
      let resolvedUnit = i.unit;
      if (!resolvedQty) {
        const hist = getHistoricalDefault(i.item_name, purchaseHistory);
        if (hist) { resolvedQty = hist.qty; resolvedUnit = resolvedUnit ?? hist.unit; }
        else {
          const catDef = getCategoryDefault(i.item_name);
          resolvedQty  = catDef.qty;
          resolvedUnit = resolvedUnit ?? catDef.unit;
        }
      } else if (!resolvedUnit) {
        resolvedUnit = getCategoryDefault(i.item_name).unit;
      }

      return {
        id: uid(),
        name:    i.item_name,
        emoji:   i.emoji || getEmoji(i.item_name),
        cat:     i.category || 'Other',
        qty:     resolvedQty!,
        unit:    resolvedUnit!,
        price:   i.price ?? 0,
        expiry:  expiryDate(days),
        expDays: days,
        src:     opts?.src ?? '🎙️',
      };
    });

    // Persist purchase history for future historical defaulting
    const newHistory = [...purchaseHistory, ...newItems.map(i=>({name:i.name, qty:i.qty, unit:i.unit}))].slice(-200);
    setPurchaseHistory(newHistory);

    setPantry(p=>{
      const updated = [...newItems, ...p];
      save({pantry:updated, purchaseHistory:newHistory});
      return updated;
    });

    // Interactive toast for voice; plain toast for scan/email
    if (opts?.interactive) {
      showVoiceToast(newItems);
    } else {
      showToast(`✅ Added: ${newItems.map(i=>i.name).join(', ')}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[save, purchaseHistory]);

  // ── Add kitchen essentials (one-tap) ────────────────────────────
  const addEssentials = () => {
    const items: PantryItem[] = ESSENTIALS.map(e => ({
      id: uid(), name: e.name, emoji: e.emoji, cat: e.cat,
      qty: e.qty, unit: e.unit, price: 0,
      expiry: expiryDate(365), expDays: 365, src: '🧂',
    }));
    setPantry(p => {
      const updated = [...items, ...p];
      save({pantry: updated});
      return updated;
    });
    setEssentialsAdded(true);
    showToast('🧂 Kitchen essentials added!');
  };

  // ── Fridge audit photo handler ─────────────────────────────────
  const handleFridgeAudit = async (file: File) => {
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('dietary', JSON.stringify({isVeg: profile.isVeg, eatsEggs: profile.eatsEggs}));
      fd.append('fridgeAudit', 'true');
      const res = await fetch('/api/scan', {method: 'POST', body: fd});
      const data = await res.json();
      if (data.items?.length) {
        addItems(data.items);
        setFridgeAuditDone(true);
        showToast(`📸 Found ${data.items.length} items in your fridge!`);
        // Auto-navigate to meals to show "wow" moment
        setTimeout(() => {
          setTab('meals');
          generateMeals('dinner', true);
        }, 1500);
      } else {
        showToast('Could not detect items — try with the fridge door open');
      }
    } catch { showToast('Scan failed — try again'); }
    finally { setScanning(false); }
  };

  // ── Voice recording ─────────────────────────────────────────────
  const startVoice = async () => {
    if(recording){ stopVoice(); return; }
    setRecording(true);
    setVoiceTranscript('');

    // Try browser SpeechRecognition first (Chrome/Android — free, instant)
    // @ts-ignore webkit prefix
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SR) {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = navigator.language || '';   // auto-detect from device locale
      rec.interimResults = false;
      rec.onresult = async (e: {results: {[0]: {[0]: {transcript: string}}}}) => {
        const text = e.results[0][0].transcript;
        setVoiceTranscript(text);
        setRecording(false);
        await parseText(text);
      };
      rec.onerror = () => setRecording(false);
      rec.onend   = () => setRecording(false);
      rec.start();
      return;
    }

    // Fallback: MediaRecorder → send to Whisper API
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, {type:'audio/webm'});
        stream.getTracks().forEach(t=>t.stop());
        await sendToWhisper(blob);
      };
      mr.start();
    } catch {
      setRecording(false);
      showToast('Microphone access needed');
    }
  };

  const stopVoice = () => {
    setRecording(false);
    if(recognitionRef.current) { (recognitionRef.current as {stop:()=>void}).stop(); recognitionRef.current=null; }
    if(mediaRecorderRef.current?.state==='recording') mediaRecorderRef.current.stop();
  };

  const sendToWhisper = async (blob: Blob) => {
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voice.webm');
      fd.append('dietary', JSON.stringify({isVeg:profile.isVeg,eatsEggs:profile.eatsEggs}));
      fd.append('lang', navigator.language || 'en');
      const res  = await fetch('/api/transcribe', {method:'POST',body:fd});
      const data = await res.json();
      if(data.transcript) setVoiceTranscript(data.transcript);
      if(data.items?.length) addItems(data.items, {interactive:true, src:'🎙️'});
      else showToast('Could not parse that — try again');
    } catch { showToast('Voice processing failed'); }
  };

  const parseText = async (text: string) => {
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('dietary', JSON.stringify({isVeg:profile.isVeg,eatsEggs:profile.eatsEggs}));
      fd.append('lang', navigator.language || 'en');
      const res  = await fetch('/api/transcribe', {method:'POST',body:fd});
      const data = await res.json();
      if(data.items?.length) addItems(data.items, {interactive:true, src:'🎙️'});
      else showToast('Nothing recognised — try again');
    } catch { showToast('Parse error'); }
  };

  // ── Generate meals ──────────────────────────────────────────────
  const generateMeals = useCallback(async (p: string, force=false) => {
    if(meals[p] && !force) return;
    setLoadingMeals(true);
    try {
      const recentlyCooked = cookLog.slice(0,20).map(l=>l.name);
      const res  = await fetch('/api/meals', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({pantry, period:p, dietary:profile, recentlyCooked}),
      });
      const data = await res.json();
      if(data.meals?.length) setMeals(m=>({...m,[p]:data.meals}));
    } catch { showToast('Could not generate meals'); }
    finally { setLoadingMeals(false); }
  },[pantry, cookLog, profile, meals]);

  useEffect(()=>{ if(tab==='meals') generateMeals(period); },[tab,period]);

  // ── Pantry helpers ──────────────────────────────────────────────
  const markUsed=(id:string, partialQty?: number)=>{
    setConfetti(true); setTimeout(()=>setConfetti(false),2200);
    const item = pantry.find(i=>i.id===id);
    if(!item) return;
    let updatedPantry: PantryItem[];
    let updatedAte: ItemLog[];
    if(partialQty !== undefined && partialQty > 0 && partialQty < item.qty) {
      // Reduce quantity only
      const remaining = Math.round((item.qty - partialQty) * 100) / 100;
      updatedPantry = pantry.map(i=>i.id===id ? {...i, qty: remaining} : i);
      updatedAte = [...ateLog, {id:uid(), name:item.name, emoji:item.emoji, price: Math.round(item.price*(partialQty/item.qty)*100)/100, date: new Date().toISOString()}];
    } else {
      // Remove entirely
      updatedPantry = pantry.filter(i=>i.id!==id);
      updatedAte = [...ateLog, {id:uid(), name:item.name, emoji:item.emoji, price:item.price||0, date: new Date().toISOString()}];
    }
    setPantry(updatedPantry); setAteLog(updatedAte);
    save({pantry:updatedPantry,ateLog:updatedAte});
    showToast(`${consumeVerb(item.name)} ${item.name} ✓`);
  };
  const markWasted=(id:string)=>{
    const item = pantry.find(i=>i.id===id);
    const updatedPantry = pantry.filter(i=>i.id!==id);
    const updatedWaste = item ? [...wasteLog,{id:uid(),name:item.name,emoji:item.emoji,price:item.price||0,date:new Date().toISOString()}] : wasteLog;
    setPantry(updatedPantry); setWasteLog(updatedWaste);
    save({pantry:updatedPantry,wasteLog:updatedWaste});
  };
  const applyExpiryEdit=()=>{
    if(!editExpiry) return;
    const d = parseInt(newExpiryDays);
    if(isNaN(d)) return;
    const updated = pantry.map(i=>i.id===editExpiry.id?{...i,expiry:expiryDate(d),expDays:d}:i);
    setPantry(updated); save({pantry:updated}); setEditExpiry(null);
  };

  const deleteItem = (id: string) => {
    setPantry(p => { const updated = p.filter(i=>i.id!==id); save({pantry:updated}); return updated; });
    showToast('🗑 Item removed');
  };

  // ── Done cooking ────────────────────────────────────────────────
  const doneCooking=()=>{
    if(!cooking) return;
    const log: CookLog = {id:uid(),name:cooking.name,period,date:new Date().toISOString()};
    const newLog = [log,...cookLog];
    const newTimestamps = {...cookedTimestamps, [cooking.name.toLowerCase()]: new Date().toISOString()};
    setCookedTimestamps(newTimestamps);
    setCookLog(newLog); save({cookLog:newLog, cookedTimestamps:newTimestamps});
    // deduct used ingredients
    const updated = [...pantry];
    cooking.ingredients_used?.forEach(({name})=>{
      const idx = updated.findIndex(i=>i.name.toLowerCase()===name.toLowerCase());
      if(idx>=0) updated.splice(idx,1);
    });
    setPantry(updated); save({pantry:updated});
    setCooking(null);
    setConfetti(true); setTimeout(()=>setConfetti(false),2200);
    showToast(`🎉 ${cooking.name} cooked! Fridge updated.`);
    setTab('fridge');
  };

  // ── Computed pantry groups (staples separated) ──────────────────
  const perishable  = pantry.filter(i => !isStaple(i.name) && i.cat !== 'Pantry');
  const staples     = pantry.filter(i => isStaple(i.name) || i.cat === 'Pantry');
  const sortedPantry = [...perishable].sort((a,b) => daysLeft(a.expiry) - daysLeft(b.expiry));
  const urgent   = sortedPantry.filter(i=>daysLeft(i.expiry)<=1);
  const expiring = sortedPantry.filter(i=>{const d=daysLeft(i.expiry);return d>1&&d<=3;});
  const fresh    = sortedPantry.filter(i=>daysLeft(i.expiry)>3);
  const searched = search ? pantry.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())) : null;

  // ── Module 6: ROI Savings Dashboard ────────────────────────────
  const savedThisMonth = (() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const cookedCount = cookLog.filter(c => new Date(c.date) >= monthStart).length;
    const ingredientCost = ateLog.filter(a => new Date(a.date) >= monthStart).reduce((s,a)=>s+(a.price||0),0);
    return Math.max(0, cookedCount * region.avgTakeout - ingredientCost);
  })();

  // ── Module 4: Burn Rate — running-low nudges ────────────────────
  const burnNudges = (() => {
    const thirtyAgo = new Date(Date.now() - 30 * 86400000);
    const burnMap: Record<string,number> = {};
    ateLog.filter(a => new Date(a.date) >= thirtyAgo).forEach(a => {
      burnMap[a.name.toLowerCase()] = (burnMap[a.name.toLowerCase()]||0) + 1;
    });
    return perishable.filter(item => {
      const burns = burnMap[item.name.toLowerCase()] || 0;
      if (burns < 2) return false;
      const def = getCategoryDefault(item.name);
      return def.qty > 0 && (item.qty / def.qty) < 0.25;
    }).slice(0, 2);
  })();

  // ── Recipe cooldown (4-day) filter ─────────────────────────────
  const fourDaysAgo = new Date(Date.now() - 4 * 86400000);
  const filterCooledMeals = (mealList: Meal[]) =>
    mealList.filter(m => {
      const ts = cookedTimestamps[m.name.toLowerCase()];
      return !ts || new Date(ts) < fourDaysAgo;
    });

  // ── Daily Rescue at 4:30 PM ─────────────────────────────────────
  useEffect(() => {
    const checkDailyRescue = () => {
      const now = new Date();
      const h = now.getHours(), m = now.getMinutes();
      if (h === 16 && m >= 30 && m < 35) { // 4:30–4:35 PM window
        const mostExpiring = [...perishable].sort((a,b) => daysLeft(a.expiry) - daysLeft(b.expiry))[0];
        if (mostExpiring && daysLeft(mostExpiring.expiry) <= 2) {
          const recipes: Record<string,string> = {
            spinach:'Palak Paneer',tomato:'Tomato Rasam',banana:'Banana Smoothie',
            milk:'Kheer',egg:'Egg Bhurji',chicken:'Quick Chicken Curry',
            bread:'French Toast',mushroom:'Mushroom Stir Fry',
          };
          const lc = mostExpiring.name.toLowerCase();
          const recipe = Object.entries(recipes).find(([k]) => lc.includes(k))?.[1] || 'Stir Fry';
          setDailyRescipe({item: mostExpiring, recipe});
          // Auto-dismiss after 30s
          setTimeout(() => setDailyRescipe(null), 30000);
        }
      }
    };
    const interval = setInterval(checkDailyRescue, 60000); // check every minute
    checkDailyRescue(); // check on mount too
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perishable]);

  // ── Nav helpers ─────────────────────────────────────────────────
  const navItems = [
    {id:'fridge',  icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12.89 1.45l8 4A2 2 0 0 1 22 7.24v9.53a2 2 0 0 1-1.11 1.79l-8 4a2 2 0 0 1-1.79 0l-8-4a2 2 0 0 1-1.1-1.8V7.24a2 2 0 0 1 1.11-1.79l8-4a2 2 0 0 1 1.78 0z"/><polyline points="2.32 6.16 12 11 21.68 6.16"/><line x1="12" y1="22.76" x2="12" y2="11"/></svg>,label:'Fridge'},
    {id:'meals',   icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>,label:'Meals'},
    {id:'insights',icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,label:'Insights'},
    {id:'profile', icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,label:'Profile'},
  ];

  // ════════════════════════════════════════════════
  // ONBOARDING
  // ════════════════════════════════════════════════
  const renderOnboarding = () => {
    const step = OB_STEPS[obStep];
    return (
      <div className="ob-screen">
        <div style={{padding:'16px 20px 0'}}>
          {obStep>0&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <button onClick={()=>setObStep(s=>s-1)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--gray)'}}>←</button>
            <span style={{fontSize:12,fontWeight:600,color:'var(--gray)'}}>{obStep+1} of {OB_STEPS.length}</span>
          </div>}
          {obStep>0&&<div className="progress-bar"><div className="progress-fill" style={{width:`${obPct}%`}}/></div>}
        </div>

        {step==='welcome'&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 28px',background:'linear-gradient(160deg,#0F172A,#1E3A5F)'}}>
            <div style={{width:72,height:72,borderRadius:20,background:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,marginBottom:20}}>🍽️</div>
            <h1 style={{fontSize:32,fontWeight:900,color:'#fff',letterSpacing:-1,marginBottom:8}}>FreshNudge</h1>
            <p style={{fontSize:14,color:'#93C5FD',textAlign:'center',lineHeight:1.6,marginBottom:40}}>Your kitchen, on autopilot.<br/>Never wonder what to cook again.</p>
            <button className="btn-primary" onClick={()=>setObStep(1)} style={{background:'#22C55E',fontSize:16,padding:16}}>Get started →</button>
            <p style={{fontSize:11,color:'#475569',marginTop:20,textAlign:'center'}}>🔒 Works offline · Your data stays on your device</p>
          </div>
        )}

        {step==='name'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>What should we call you?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:28}}>Every suggestion will feel like it&apos;s made just for you.</p>
            <input type="text" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))}
              placeholder="Your first name" style={{width:'100%',border:'2px solid var(--navy)',fontWeight:700,fontSize:16}}/>
          </div>
        )}

        {step==='family'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>Set the table.</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Portions, ingredients, everything scales to your household.</p>
            <div style={{marginBottom:14}}>
              <p style={{fontSize:13,fontWeight:700,color:'var(--gray)',marginBottom:8}}>Family size</p>
              <div style={{display:'flex',gap:8}}>
                {[1,2,3,4,'5+'].map(n=>(
                  <div key={n} onClick={()=>setProfile(p=>({...p,familySize:typeof n==='number'?n:5}))}
                    style={{flex:1,background:profile.familySize===(typeof n==='number'?n:5)?'#EFF6FF':'var(--grayL)',border:`1.5px solid ${profile.familySize===(typeof n==='number'?n:5)?'var(--navy)':'var(--border)'}`,borderRadius:12,padding:'10px 0',textAlign:'center',fontSize:14,fontWeight:700,color:profile.familySize===(typeof n==='number'?n:5)?'var(--navy)':'var(--ink)',cursor:'pointer'}}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:'#FEF9C3',border:'1.5px solid #FCD34D',borderRadius:14,padding:14,marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:profile.hasToddler?12:0}}>
                <div>
                  <p style={{fontSize:14,fontWeight:800,color:'#92400E',marginBottom:2}}>Do you have a toddler? (under 3)</p>
                  <p style={{fontSize:12,color:'#B45309'}}>We&apos;ll auto-check every recipe for safety</p>
                </div>
                <div onClick={()=>setProfile(p=>({...p,hasToddler:!p.hasToddler}))}
                  style={{width:44,height:24,borderRadius:12,background:profile.hasToddler?'#22C55E':'#D1D5DB',cursor:'pointer',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:2,left:profile.hasToddler?20:2,width:20,height:20,borderRadius:10,background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                </div>
              </div>
              {profile.hasToddler&&(
                <div style={{display:'flex',gap:8,marginTop:10}}>
                  <input type="text" placeholder="Name (e.g. Avya)" value={profile.toddlerName} onChange={e=>setProfile(p=>({...p,toddlerName:e.target.value}))} style={{flex:2}}/>
                  <input type="number" placeholder="Age" value={profile.toddlerAge||''} onChange={e=>setProfile(p=>({...p,toddlerAge:parseInt(e.target.value)||2}))} style={{flex:1,textAlign:'center'}}/>
                </div>
              )}
            </div>
          </div>
        )}

        {step==='diet'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>What do you eat?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Every suggestion will match this.</p>
            {[['🥗','Vegetarian','No meat or seafood',true],['🌱','Vegan','Plant-based only',false],['🍽️','Everything','No restrictions',false],['🕌','Halal','No pork',false]].map(([ic,lb,sub,isVeg])=>(
              <div key={lb as string} onClick={()=>setProfile(p=>({...p,isVeg:!!isVeg}))}
                style={{background:profile.isVeg===!!isVeg&&(lb==='Vegetarian'&&profile.isVeg||lb!=='Vegetarian'&&!profile.isVeg)?'#EFF6FF':'',border:`1.5px solid ${profile.isVeg===!!isVeg&&(lb==='Vegetarian'&&profile.isVeg||lb!=='Vegetarian'&&!profile.isVeg)?'var(--navy)':'var(--border)'}`,borderRadius:14,padding:13,display:'flex',alignItems:'center',gap:12,marginBottom:9,cursor:'pointer'}}>
                <span style={{fontSize:22}}>{ic}</span>
                <div><div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>{lb}</div><div style={{fontSize:12,color:'var(--gray)'}}>{sub}</div></div>
              </div>
            ))}
            {profile.isVeg&&(
              <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:14,padding:14,marginTop:6}}>
                <p style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:10}}>Do you eat eggs?</p>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setProfile(p=>({...p,eatsEggs:true}))} style={{flex:1,background:profile.eatsEggs?'var(--navy)':'#fff',color:profile.eatsEggs?'#fff':'var(--gray)',border:'1px solid var(--border)',borderRadius:11,padding:11,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>Yes, I eat eggs 🥚</button>
                  <button onClick={()=>setProfile(p=>({...p,eatsEggs:false}))} style={{flex:1,background:!profile.eatsEggs?'var(--navy)':'#fff',color:!profile.eatsEggs?'#fff':'var(--gray)',border:'1px solid var(--border)',borderRadius:11,padding:11,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>No eggs</button>
                </div>
              </div>
            )}
          </div>
        )}

        {step==='cuisine'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>What do you usually cook?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Pick all that apply — your meal suggestions will match your actual cooking style.</p>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {([
                ['🇮🇳','Indian everyday','Dal, sabzi, roti, chawal, khichdi, poha, upma, sawaiyan','Indian'],
                ['🍜','Asian','Stir fry, fried rice, noodles, curry, dim sum','Asian'],
                ['🍝','Western / Continental','Pasta, sandwiches, salads, grilled food','Western'],
                ['🌮','Mexican / Middle Eastern','Wraps, tacos, hummus, kebabs','Mexican'],
                ['🥗','Mediterranean','Grain bowls, roasted veggies, fish, olive oil','Mediterranean'],
              ] as [string,string,string,string][]).map(([flag,label,desc,val])=>{
                const sel = profile.cuisines.includes(val);
                return (
                  <div key={val} onClick={()=>setProfile(p=>({...p,cuisines:sel?p.cuisines.filter(c=>c!==val):[...p.cuisines,val]}))}
                    style={{display:'flex',alignItems:'center',gap:14,background:sel?'#EFF6FF':'var(--grayL)',border:`1.5px solid ${sel?'var(--navy)':'var(--border)'}`,borderRadius:14,padding:'12px 14px',cursor:'pointer'}}>
                    <span style={{fontSize:28,flexShrink:0}}>{flag}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:800,color:sel?'var(--navy)':'var(--ink)'}}>{label}</div>
                      <div style={{fontSize:11,color:'var(--gray)',marginTop:2}}>{desc}</div>
                    </div>
                    {sel&&<div style={{width:22,height:22,borderRadius:11,background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,flexShrink:0}}>✓</div>}
                  </div>
                );
              })}
            </div>
            <p style={{fontSize:11,color:'var(--gray)',marginTop:14,textAlign:'center'}}>Select as many as you like — even 1 is enough.</p>
          </div>
        )}

        {step==='paths'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>How do you want to<br/>keep your fridge updated?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Pick what works for you — you can always change later.</p>

            {/* 📸 Photo */}
            <div onClick={()=>setAddPath(addPath==='photo'?null:'photo')}
              style={{background:addPath==='photo'?'#EFF6FF':'var(--grayL)',border:`2px solid ${addPath==='photo'?'var(--navy)':'var(--border)'}`,borderRadius:16,padding:'16px 14px',display:'flex',alignItems:'center',gap:14,marginBottom:10,cursor:'pointer',transition:'all .2s'}}>
              <div style={{width:48,height:48,borderRadius:14,background:addPath==='photo'?'var(--navy)':'#E2E8F0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>📸</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:800,color:'var(--ink)'}}>Photo my fridge</div>
                <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>Snap one photo of your open fridge — AI finds everything</div>
              </div>
              {addPath==='photo'&&<div style={{width:22,height:22,borderRadius:11,background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,flexShrink:0}}>✓</div>}
            </div>

            {/* 🎙️ Voice */}
            <div onClick={()=>setAddPath(addPath==='voice'?null:'voice')}
              style={{background:addPath==='voice'?'#EFF6FF':'var(--grayL)',border:`2px solid ${addPath==='voice'?'var(--navy)':'var(--border)'}`,borderRadius:16,padding:'16px 14px',display:'flex',alignItems:'center',gap:14,marginBottom:10,cursor:'pointer',transition:'all .2s'}}>
              <div style={{width:48,height:48,borderRadius:14,background:addPath==='voice'?'var(--navy)':'#E2E8F0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>🎙️</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:800,color:'var(--ink)'}}>Voice</div>
                <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>Say &quot;2 mangoes, 400g curd, 1L milk&quot; — done</div>
              </div>
              {addPath==='voice'&&<div style={{width:22,height:22,borderRadius:11,background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,flexShrink:0}}>✓</div>}
            </div>

            {/* 📧 Auto-sync */}
            <div onClick={()=>{setAddPath(addPath==='email'?null:'email');if(addPath!=='email'&&!isPremium)setShowPremium(true);}}
              style={{background:addPath==='email'?'#FFFBEB':'var(--grayL)',border:`2px solid ${addPath==='email'?'#F59E0B':'var(--border)'}`,borderRadius:16,padding:'16px 14px',display:'flex',alignItems:'center',gap:14,marginBottom:10,cursor:'pointer',transition:'all .2s'}}>
              <div style={{width:48,height:48,borderRadius:14,background:addPath==='email'?'#F59E0B':'#E2E8F0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>📧</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:800,color:addPath==='email'?'#92400E':'var(--ink)'}}>Auto-sync from email <span style={{fontSize:10,background:'#F59E0B',color:'#fff',borderRadius:6,padding:'1px 6px',marginLeft:3}}>👑</span></div>
                <div style={{fontSize:12,color:addPath==='email'?'#B45309':'var(--gray)',marginTop:2}}>{region.groceryApps.slice(0,2).join(', ')} orders auto-added</div>
              </div>
              {addPath==='email'&&<div style={{width:22,height:22,borderRadius:11,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,flexShrink:0}}>✓</div>}
            </div>

            <p style={{fontSize:11,color:'var(--gray)',marginTop:6,textAlign:'center'}}>
              {addPath==='photo'?'After setup, you\'ll snap your fridge — instant inventory!':
               addPath==='voice'?'Free forever — just talk to add items.':
               addPath==='email'?'Premium feature — 7-day free trial included.':
               'Pick one to continue'}
            </p>
          </div>
        )}

        {step==='notifications'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>When should I tell<br/>you what to cook?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:22}}>Set a time for each meal — I&apos;ll suggest recipes automatically.</p>
            {[['☀️','Breakfast','breakfast'],['🌤️','Lunch','lunch'],['🍎','Snack','snack'],['🌙','Dinner','dinner']].map(([ic,lb,key])=>(
              <div key={key as string} style={{background:'var(--grayL)',border:'1px solid var(--border)',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:12,marginBottom:9}}>
                <div style={{width:38,height:38,borderRadius:10,background:'var(--white)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{ic}</div>
                <div style={{flex:1,fontSize:14,fontWeight:700,color:'var(--ink)'}}>{lb}</div>
                <input type="time" value={profile.notifTimes[key as string]} onChange={e=>setProfile(p=>({...p,notifTimes:{...p.notifTimes,[key as string]:e.target.value}}))} style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:10,padding:'7px 10px',fontSize:13,fontWeight:700,color:'var(--navy)',fontFamily:'inherit',cursor:'pointer'}}/>
              </div>
            ))}
            <button onClick={enableNotifications}
              style={{width:'100%',marginTop:8,background:notifEnabled?'#DCFCE7':'var(--navy)',border:'none',borderRadius:14,padding:14,fontSize:14,fontWeight:800,color:notifEnabled?'#15803D':'#fff',fontFamily:'inherit',cursor:'pointer'}}>
              {notifEnabled?'✅ Notifications enabled':'🔔 Enable push notifications'}
            </button>
            {notifEnabled&&<p style={{fontSize:11,color:'var(--gray)',textAlign:'center',marginTop:8}}>You&apos;ll get a nudge before each meal with what to cook from your fridge.</p>}
          </div>
        )}

        {step==='payment'&&(
          <div style={{flex:1,padding:'28px 22px',display:'flex',flexDirection:'column'}}>
            <div style={{textAlign:'center',marginBottom:24}}>
              <div style={{fontSize:44,marginBottom:8}}>✨</div>
              <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>Try FreshNudge free<br/>for 7 days</h2>
              <p style={{fontSize:13,color:'var(--gray)'}}>No credit card needed. Cancel anytime.</p>
            </div>
            {[['🍽️ Daily meal suggestions','Based on what\'s in your fridge'],['🎙️ Voice grocery logging','Add items by talking'],['⚠️ Expiry alerts','Never waste food again'],['👶 Toddler safety filter','Every recipe checked automatically']].map(([feat,sub])=>(
              <div key={feat} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--ink)',flex:1}}>{feat}<div style={{fontSize:11,color:'var(--gray)',fontWeight:500,marginTop:2}}>{sub}</div></div>
                <span style={{color:'#22C55E',fontWeight:900,fontSize:18}}>✓</span>
              </div>
            ))}
            <div style={{marginTop:20,background:'linear-gradient(135deg,#1E3A8A,#2563EB)',borderRadius:16,padding:20,textAlign:'center'}}>
              <div style={{fontSize:11,color:'#93C5FD',fontWeight:600,marginBottom:4,letterSpacing:1,textTransform:'uppercase'}}>After free trial</div>
              <div style={{fontSize:32,fontWeight:900,color:'#fff'}}>{region.monthlyPrice}<span style={{fontSize:14,fontWeight:500,opacity:.8}}>/month</span></div>
              <div style={{fontSize:11,color:'#93C5FD',marginTop:2}}>Less than {Math.round(region.monthlyPriceNum/region.avgOrderSize*100)}% of one {region.groceryApps[0]} order</div>
            </div>
            <button className="btn-primary" onClick={()=>setObStep(s=>s+1)} style={{marginTop:16,fontSize:16,padding:16,background:'#22C55E'}}>
              Start 7-day free trial →
            </button>
            <button onClick={()=>setObStep(s=>s+1)} style={{marginTop:10,background:'none',border:'none',color:'var(--gray)',fontSize:13,cursor:'pointer',fontFamily:'inherit',padding:8}}>
              Continue with free plan
            </button>
          </div>
        )}

        {step==='done'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <div style={{textAlign:'center',marginBottom:28}}>
              <div style={{fontSize:52,marginBottom:12}}>🎉</div>
              <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>You&apos;re all set{profile.name?`, ${profile.name}`:''}!</h2>
              <p style={{fontSize:13,color:'var(--gray)',marginTop:6}}>Your kitchen now thinks for itself.</p>
            </div>
            <div className="card" style={{marginBottom:24}}>
              {[['👨‍👩‍👧','Family',`${profile.familySize} people${profile.hasToddler?` · ${profile.toddlerName} safety filter ON`:''}`],['🥗','Diet',`${profile.isVeg?'Vegetarian':'Omnivore'}${profile.eatsEggs?' + eggs':''}`],['🔔','Notifications','All 4 meal periods set']].map(([ic,lb,val],i,arr)=>(
                <div key={lb} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:i<arr.length-1?'1px solid var(--border)':'none'}}>
                  <div style={{width:34,height:34,borderRadius:10,background:'var(--grayL)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{ic}</div>
                  <div style={{flex:1}}><div style={{fontSize:11,color:'var(--gray)'}}>{lb}</div><div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{val}</div></div>
                  <div style={{width:8,height:8,borderRadius:4,background:'#22C55E'}}/>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={completeOnboarding} style={{fontSize:16,padding:16}}>Enter my kitchen →</button>
          </div>
        )}

        {obStep<OB_STEPS.length-1&&step!=='welcome'&&step!=='payment'&&(
          <div style={{padding:'16px 22px',paddingBottom:'max(16px,env(safe-area-inset-bottom))'}}>
            <button className="btn-primary" onClick={()=>setObStep(s=>s+1)}>Next →</button>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // FRIDGE SCREEN
  // ════════════════════════════════════════════════
  const renderFridge = () => (
    <div className="screen" style={{background:'var(--cream)'}}>
      {/* Header */}
      <div style={{padding:'14px 16px 8px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>My Fridge</h1>
            <p style={{fontSize:11,color:'var(--gray)',marginTop:1}}>{perishable.length} items{staples.length>0?` · ${staples.length} pantry`:''}{urgent.length>0?` · ${urgent.length} expiring today`:''}</p>
          </div>
          <button onClick={()=>setShowAdd(v=>!v)} className="btn-primary" style={{width:'auto',padding:'9px 14px',fontSize:13,gap:5}}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><line x1="7.5" y1="1" x2="7.5" y2="14" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="1" y1="7.5" x2="14" y2="7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
            Add
          </button>
        </div>

        {/* Add Panel */}
        {showAdd&&(
          <div className="card" style={{marginBottom:12,animation:'fadeIn .2s'}}>
            <p style={{fontSize:11,fontWeight:700,color:'var(--gray)',letterSpacing:.6,marginBottom:12}}>ADD TO FRIDGE</p>

            {/* Voice */}
            <button onClick={startVoice}
              style={{width:'100%',background:recording?'#FEE2E2':'#EFF6FF',border:`1.5px solid ${recording?'#FCA5A5':'#BFDBFE'}`,borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10}}>
              <div style={{width:42,height:42,borderRadius:21,background:recording?'var(--red)':'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:14,fontWeight:800,color:recording?'var(--red)':'var(--navy)'}}>{recording?'Listening…':'🎙️ Voice'}</div>
                <div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>Say what you bought — &quot;2 mangoes, 400g curd&quot;</div>
              </div>
            </button>
            {voiceTranscript&&<div style={{marginBottom:10,background:'var(--grayL)',borderRadius:12,padding:'10px 14px',fontSize:13,color:'var(--gray)',fontStyle:'italic'}}>🎙️ &ldquo;{voiceTranscript}&rdquo;</div>}

            {/* Photo scan — Premium */}
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{display:'none'}}
              onChange={e=>{ const f=e.target.files?.[0]; if(f) handlePhotoScan(f); e.target.value=''; }}/>
            {isPremium ? (
              <button onClick={()=>photoInputRef.current?.click()} disabled={scanning}
                style={{width:'100%',background:scanning?'#F0FDF4':'var(--grayL)',border:'1.5px solid var(--border)',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10,opacity:scanning?.7:1}}>
                <div style={{width:42,height:42,borderRadius:21,background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>📸</div>
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:14,fontWeight:800,color:'var(--ink)'}}>{scanning?'Scanning…':'📸 Photo / Receipt'}</div>
                  <div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>Snap a receipt or grocery app screenshot</div>
                </div>
              </button>
            ) : (
              <button onClick={()=>setShowPremium(true)}
                style={{width:'100%',background:'#FFFBEB',border:'1.5px solid #FCD34D',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10}}>
                <div style={{width:42,height:42,borderRadius:21,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>📸</div>
                <div style={{flex:1,textAlign:'left'}}>
                  <div style={{fontSize:14,fontWeight:800,color:'#92400E'}}>📸 Photo / Receipt <span style={{fontSize:11,background:'#F59E0B',color:'#fff',borderRadius:6,padding:'1px 6px',marginLeft:4}}>👑 Premium</span></div>
                  <div style={{fontSize:11,color:'#B45309',marginTop:1}}>Snap a receipt — items added automatically</div>
                </div>
              </button>
            )}

            {/* Gmail auto-sync — Premium */}
            {isPremium ? (
              gmailConnected ? (
                <button onClick={()=>syncGmailOrders(gmailToken)} disabled={gmailSyncing}
                  style={{width:'100%',background:'#F0FDF4',border:'1.5px solid #86EFAC',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',opacity:gmailSyncing?.7:1}}>
                  <div style={{width:42,height:42,borderRadius:21,background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>📧</div>
                  <div style={{textAlign:'left'}}>
                    <div style={{fontSize:14,fontWeight:800,color:'#15803D'}}>{gmailSyncing?'Syncing orders…':'✅ Gmail connected'}</div>
                    <div style={{fontSize:11,color:'#16A34A',marginTop:1}}>{gmailSyncing?'Reading your order emails…':'Tap to re-sync grocery orders'}</div>
                  </div>
                </button>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {/* Gmail OAuth option */}
                  <button onClick={connectGmail}
                    style={{width:'100%',background:'var(--grayL)',border:'1.5px solid var(--border)',borderRadius:14,padding:'11px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
                    <div style={{width:38,height:38,borderRadius:19,background:'#6366F1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:18}}>📧</div>
                    <div style={{flex:1,textAlign:'left'}}>
                      <div style={{fontSize:13,fontWeight:800,color:'var(--ink)'}}>Connect Gmail</div>
                      <div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>OAuth · auto-scans Swiggy, Blinkit, Grab orders</div>
                    </div>
                    {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID&&(
                      <span style={{fontSize:10,background:'#F59E0B',color:'#fff',borderRadius:6,padding:'2px 6px',flexShrink:0}}>Setup</span>
                    )}
                  </button>
                  {/* Universal forward address */}
                  <button onClick={async()=>{const e=await getOrCreateSyncEmail();if(e){await navigator.clipboard.writeText(e).catch(()=>{});showToast('📋 Sync address copied!');setTab('profile');setShowSyncSetup(true);}}}
                    style={{width:'100%',background:'var(--grayL)',border:'1.5px solid var(--border)',borderRadius:14,padding:'11px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
                    <div style={{width:38,height:38,borderRadius:19,background:'#0EA5E9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:18}}>✉️</div>
                    <div style={{flex:1,textAlign:'left'}}>
                      <div style={{fontSize:13,fontWeight:800,color:'var(--ink)'}}>Forward-to sync</div>
                      <div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>Works with any email app globally</div>
                    </div>
                    <span style={{fontSize:11,background:'#0EA5E9',color:'#fff',borderRadius:6,padding:'2px 7px',flexShrink:0}}>All regions</span>
                  </button>
                </div>
              )
            ) : (
              <button onClick={()=>setShowPremium(true)}
                style={{width:'100%',background:'#FFFBEB',border:'1.5px solid #FCD34D',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
                <div style={{width:42,height:42,borderRadius:21,background:'#6366F1',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>📧</div>
                <div style={{flex:1,textAlign:'left'}}>
                  <div style={{fontSize:14,fontWeight:800,color:'#92400E'}}>Email auto-sync <span style={{fontSize:11,background:'#F59E0B',color:'#fff',borderRadius:6,padding:'1px 6px',marginLeft:4}}>👑 Premium</span></div>
                  <div style={{fontSize:11,color:'#B45309',marginTop:1}}>FoodPanda, Grab, Swiggy auto-added from email</div>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Go to meals CTA */}
        <button onClick={()=>setTab('meals')} style={{width:'100%',background:'linear-gradient(135deg,var(--navy),var(--navyD))',border:'none',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginBottom:10}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#86EFAC" strokeWidth="2" strokeLinecap="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>
          <div style={{flex:1,textAlign:'left'}}>
            <div style={{color:'#fff',fontWeight:800,fontSize:14}}>What can I make right now?</div>
            <div style={{color:'#93C5FD',fontSize:11,marginTop:2}}>{pantry.length} items · breakfast, lunch, snack, dinner</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        {/* Search */}
        <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--white)',border:'1px solid var(--border)',borderRadius:12,padding:'9px 14px',marginBottom:6}}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your fridge…" style={{flex:1,background:'none',borderRadius:0,padding:0,border:'none',outline:'none'}}/>
        </div>

        {/* Swipe hint */}
        {!search&&<div style={{display:'flex',justifyContent:'center',gap:8,fontSize:11,marginBottom:4}}>
          <span style={{color:'var(--gray)',fontSize:11}}>Tap any item to mark it</span>
        </div>}
      </div>

      {/* Item list */}
      <div style={{background:'var(--surf)',padding:'4px 14px 24px',minHeight:200}}>

        {/* ── ROI Savings Ticker ── */}
        {(savedThisMonth > 0 || cookLog.filter(c=>new Date(c.date)>=new Date(new Date().setDate(1))).length > 0) && (
          <div style={{background:'linear-gradient(135deg,#ECFDF5,#D1FAE5)',border:'1.5px solid #6EE7B7',borderRadius:14,padding:'10px 14px',marginBottom:12,marginTop:8,display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:20}}>💰</span>
            <div style={{flex:1}}>
              <p style={{fontSize:12,fontWeight:800,color:'#065F46'}}>Savings this month</p>
              <p style={{fontSize:11,color:'#047857'}}>{savedThisMonth>0?`Cooking at home saved you ${fmt(savedThisMonth)} vs ordering out!`:`${cookLog.filter(c=>new Date(c.date)>=new Date(new Date().setDate(1))).length} home-cooked meals — savings build as you log prices`}</p>
            </div>
            {savedThisMonth>0&&<span style={{fontSize:17,fontWeight:900,color:'#065F46',flexShrink:0}}>{fmt(savedThisMonth)}</span>}
          </div>
        )}

        {/* ── Burn Rate Nudges ── */}
        {burnNudges.map(item => {
          const store = region.groceryApps[0] || 'your grocery app';
          const DEEP: Record<string,string> = {
            Blinkit:`https://blinkit.com/s/?q=${encodeURIComponent(item.name)}`,
            'Swiggy Instamart':`https://www.swiggy.com/search?query=${encodeURIComponent(item.name)}`,
            Zepto:`https://www.zeptonow.com/search?query=${encodeURIComponent(item.name)}`,
            GrabMart:`https://food.grab.com/sg/en/groceries`,
            Instacart:`https://www.instacart.com/store/s?k=${encodeURIComponent(item.name)}`,
            Ocado:`https://www.ocado.com/search?entry=${encodeURIComponent(item.name)}`,
            'Woolworths Online':`https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(item.name)}`,
          };
          const link = Object.entries(DEEP).find(([k])=>store.includes(k))?.[1]||'#';
          return (
            <div key={item.id} style={{background:'#FFF7ED',border:'1.5px solid #FED7AA',borderRadius:14,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>{item.emoji}</span>
              <div style={{flex:1}}>
                <p style={{fontSize:12,fontWeight:800,color:'#92400E'}}>Running low on {item.name}</p>
                <p style={{fontSize:11,color:'#B45309'}}>You go through this fast — restock soon</p>
              </div>
              <a href={link} target="_blank" rel="noreferrer"
                style={{background:'#F97316',color:'#fff',border:'none',borderRadius:10,padding:'6px 12px',fontSize:11,fontWeight:700,textDecoration:'none',flexShrink:0,whiteSpace:'nowrap'}}>
                Order →
              </a>
            </div>
          );
        })}

        {searched ? (
          searched.length===0
            ? <p style={{textAlign:'center',padding:'40px',color:'var(--gray)'}}>&ldquo;{search}&rdquo; not in fridge</p>
            : searched.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={setEditExpiry} onDelete={deleteItem}/>)
        ) : (
          <>
            {urgent.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:12,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--red)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'var(--red)',letterSpacing:.6}}>EXPIRES TODAY — COOK FIRST</span>
                <span className="pill pill-red">{urgent.length}</span>
              </div>
              {urgent.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={setEditExpiry} onDelete={deleteItem}/>)}
            </>}
            {expiring.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:14,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--gold)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'var(--goldD)',letterSpacing:.6}}>EXPIRING IN 2–3 DAYS</span>
                <span className="pill pill-amber">{expiring.length}</span>
              </div>
              {expiring.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={setEditExpiry} onDelete={deleteItem}/>)}
            </>}
            {fresh.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:14,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--sage)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'#15803D',letterSpacing:.6}}>FRESH & STOCKED</span>
                <span className="pill pill-green">{fresh.length}</span>
              </div>
              {fresh.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={setEditExpiry} onDelete={deleteItem}/>)}
            </>}
            {/* Pantry staples section — collapsed, no expiry tracking */}
            {staples.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:14,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'#9CA3AF'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'var(--gray)',letterSpacing:.6}}>PANTRY SHELF — ALWAYS STOCKED</span>
                <span className="pill pill-green">{staples.length}</span>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {staples.map(i=>(
                  <div key={i.id} style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:20,padding:'5px 12px',fontSize:12,fontWeight:600,color:'var(--inkM)',display:'flex',alignItems:'center',gap:4}}>
                    <span>{i.emoji}</span>{i.name}
                  </div>
                ))}
              </div>
            </>}

            {/* Empty fridge — wow "Getting Started" experience */}
            {perishable.length===0&&(
              <div style={{paddingTop:20}}>
                <div style={{textAlign:'center',marginBottom:20}}>
                  <div style={{fontSize:48}}>🧊</div>
                  <p style={{fontWeight:900,fontSize:20,color:'var(--ink)',marginTop:10}}>Your fridge is waiting!</p>
                  <p style={{fontSize:13,color:'var(--gray)',marginTop:4}}>Pick one to get started in under 30 seconds.</p>
                </div>

                {/* Fridge Audit — snap one photo */}
                <input ref={fridgeAuditRef} type="file" accept="image/*" capture="environment" style={{display:'none'}}
                  onChange={e=>{const f=e.target.files?.[0]; if(f) handleFridgeAudit(f); e.target.value='';}}/>
                <button onClick={()=>fridgeAuditRef.current?.click()} disabled={scanning}
                  style={{width:'100%',background:'linear-gradient(135deg,#1E3A8A,#2563EB)',border:'none',borderRadius:18,padding:'18px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10}}>
                  <div style={{width:50,height:50,borderRadius:14,background:'rgba(255,255,255,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>📸</div>
                  <div style={{textAlign:'left',flex:1}}>
                    <div style={{fontSize:16,fontWeight:900,color:'#fff'}}>{scanning?'Scanning your fridge…':'Snap your fridge'}</div>
                    <div style={{fontSize:12,color:'#93C5FD',marginTop:3}}>One photo → AI finds everything → instant meal ideas</div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>

                {/* Kitchen essentials — one tap */}
                {!essentialsAdded?(
                  <button onClick={addEssentials}
                    style={{width:'100%',background:'#FFFBEB',border:'1.5px solid #FDE68A',borderRadius:18,padding:'16px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10}}>
                    <div style={{width:50,height:50,borderRadius:14,background:'#FEF3C7',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>🧂</div>
                    <div style={{textAlign:'left',flex:1}}>
                      <div style={{fontSize:15,fontWeight:800,color:'#92400E'}}>Add kitchen essentials</div>
                      <div style={{fontSize:12,color:'#B45309',marginTop:2}}>Salt, sugar, oil, atta, spices — one tap</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                ):(
                  <div style={{width:'100%',background:'#F0FDF4',border:'1.5px solid #86EFAC',borderRadius:18,padding:'14px 16px',display:'flex',alignItems:'center',gap:14,marginBottom:10}}>
                    <span style={{fontSize:22}}>✅</span>
                    <span style={{fontSize:14,fontWeight:700,color:'#15803D'}}>Kitchen essentials added!</span>
                  </div>
                )}

                {/* Voice quick-add */}
                <button onClick={()=>{setShowAdd(true);setTimeout(startVoice,300);}}
                  style={{width:'100%',background:'var(--grayL)',border:'1.5px solid var(--border)',borderRadius:18,padding:'16px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10}}>
                  <div style={{width:50,height:50,borderRadius:14,background:'#EFF6FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,flexShrink:0}}>🎙️</div>
                  <div style={{textAlign:'left',flex:1}}>
                    <div style={{fontSize:15,fontWeight:800,color:'var(--ink)'}}>Tell me what you bought</div>
                    <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>Voice add — say it and it&apos;s logged</div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Email paste modal */}
      {showEmail&&(
        <>
          <div onClick={()=>setShowEmail(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:50}}/>
          <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:430,background:'#fff',borderRadius:'20px 20px 0 0',padding:'20px 20px calc(20px + env(safe-area-inset-bottom))',zIndex:51,boxShadow:'0 -8px 40px rgba(0,0,0,.18)'}}>
            <div style={{fontWeight:900,fontSize:18,color:'var(--ink)',marginBottom:4}}>📧 Paste order email</div>
            <p style={{fontSize:12,color:'var(--gray)',marginBottom:14}}>Copy the text from your FoodPanda / GrabMart / Swiggy order confirmation and paste below. We&apos;ll extract every item and add it to your fridge.</p>
            <textarea value={emailText} onChange={e=>setEmailText(e.target.value)}
              placeholder="Paste your order confirmation email here…"
              style={{width:'100%',height:180,border:'1.5px solid var(--border)',borderRadius:12,padding:12,fontSize:13,fontFamily:'inherit',resize:'none',boxSizing:'border-box',color:'var(--ink)'}}/>
            <div style={{fontSize:11,color:'var(--gray)',marginTop:6,marginBottom:16}}>
              💡 Tip: Open the order email → Select All → Copy → Paste here
            </div>
            <button onClick={handleEmailSync} disabled={emailLoading||!emailText.trim()}
              style={{width:'100%',background:'#6366F1',border:'none',borderRadius:14,padding:15,fontSize:15,fontWeight:800,color:'#fff',fontFamily:'inherit',cursor:'pointer',marginBottom:10,opacity:emailLoading||!emailText.trim()?.7:1}}>
              {emailLoading?'Parsing…':'Add to fridge →'}
            </button>
            <button onClick={()=>setShowEmail(false)} style={{width:'100%',background:'none',border:'none',color:'var(--gray)',fontSize:13,cursor:'pointer',fontFamily:'inherit',padding:8}}>Cancel</button>
          </div>
        </>
      )}

      {/* Item action bottom sheet */}
      {actionItem&&(
        <>
          <div onClick={()=>{setActionItem(null);setUsedQty('');}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:50}}/>
          <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:430,background:'#fff',borderRadius:'20px 20px 0 0',padding:'20px 20px calc(20px + env(safe-area-inset-bottom))',zIndex:51,boxShadow:'0 -8px 40px rgba(0,0,0,.18)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              <span style={{fontSize:32}}>{actionItem.emoji}</span>
              <div>
                <div style={{fontWeight:900,fontSize:17,color:'var(--ink)'}}>{actionItem.name}</div>
                <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>{actionItem.qty}{actionItem.unit} · {fmtDays(daysLeft(actionItem.expiry))}</div>
              </div>
            </div>
            {/* Partial quantity input */}
            <div style={{background:'var(--grayL)',borderRadius:12,padding:'10px 12px',marginBottom:14}}>
              <p style={{fontSize:11,fontWeight:700,color:'var(--gray)',marginBottom:8}}>HOW MUCH DID YOU USE?</p>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="number" value={usedQty} onChange={e=>setUsedQty(e.target.value)}
                  placeholder={`${actionItem.qty}`}
                  style={{flex:1,fontSize:20,fontWeight:800,textAlign:'center',borderRadius:10,padding:'9px 8px',border:'1.5px solid var(--border)',background:'#fff'}}/>
                <span style={{fontSize:14,color:'var(--gray)',fontWeight:600,flexShrink:0}}>{actionItem.unit}</span>
                <button onClick={()=>setUsedQty(String(actionItem.qty))}
                  style={{fontSize:12,background:'var(--white)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 10px',color:'var(--navy)',fontWeight:700,cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>All</button>
              </div>
              {usedQty && parseFloat(usedQty) < actionItem.qty && (
                <p style={{fontSize:11,color:'#15803D',marginTop:6}}>✓ {Math.round((actionItem.qty - parseFloat(usedQty))*100)/100}{actionItem.unit} will stay in your fridge</p>
              )}
            </div>
            <button onClick={()=>{
              const qty = usedQty ? parseFloat(usedQty) : undefined;
              markUsed(actionItem.id, qty);
              setUsedQty('');
              setActionItem(null);
            }} style={{width:'100%',background:'#22C55E',border:'none',borderRadius:14,padding:'15px',fontSize:16,fontWeight:800,color:'#fff',fontFamily:'inherit',cursor:'pointer',marginBottom:10,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {actionItem.cat==='Beverages'?'🥤 Drank it':'😋 Ate it'}
            </button>
            <button onClick={()=>{markWasted(actionItem.id);setUsedQty('');setActionItem(null);}} style={{width:'100%',background:'#FEF2F2',border:'1.5px solid #FCA5A5',borderRadius:14,padding:'15px',fontSize:16,fontWeight:800,color:'#DC2626',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              🗑 Threw it away
            </button>
            <button onClick={()=>{setActionItem(null);setUsedQty('');}} style={{width:'100%',background:'none',border:'none',padding:'12px',fontSize:14,color:'var(--gray)',fontFamily:'inherit',cursor:'pointer',marginTop:2}}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );

  // ════════════════════════════════════════════════
  // MEALS SCREEN
  // ════════════════════════════════════════════════
  const renderMeals = () => {
    const cfg = PERIODS.find(p=>p.id===period)!;
    const currentMeals = meals[period];
    const urgentNames  = pantry.filter(i=>daysLeft(i.expiry)<=1).map(i=>i.name);
    return (
      <div className="screen" style={{display:'flex',flexDirection:'column',background:'var(--cream)'}}>
        <div style={{padding:'14px 16px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
            <div>
              <h1 style={{fontSize:26,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>Meal Ideas</h1>
              <p style={{fontSize:11,color:'var(--gray)',marginTop:1}}>From your fridge · auto-generated</p>
            </div>
            <button onClick={()=>{setMeals(m=>({...m,[period]:undefined as unknown as Meal[]}));generateMeals(period,true);}}
              style={{display:'flex',alignItems:'center',gap:5,background:cfg.bg,border:`1px solid ${cfg.brd}`,borderRadius:12,padding:'8px 12px',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,color:cfg.color}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:loadingMeals?'spin 1s linear infinite':'none'}}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Period tabs */}
        <div className="period-tabs">
          {PERIODS.map(p=>(
            <div key={p.id} className={`period-tab${period===p.id?' active':''}`}
              onClick={()=>setPeriod(p.id)}
              style={period===p.id?{background:p.bg,borderColor:p.brd+'80'}:{}}>
              <span style={{fontSize:16}}>{p.emoji}</span>
              <span style={{fontSize:10,fontWeight:700,color:period===p.id?p.color:'var(--gray)'}}>{p.label}</span>
              <span style={{fontSize:9,color:period===p.id?p.color:'var(--gray)',opacity:.7}}>{p.time}</span>
            </div>
          ))}
        </div>

        {/* Expiry alert */}
        {urgentNames.length>0&&(
          <div style={{display:'flex',alignItems:'center',gap:8,background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:12,margin:'10px 14px 0',padding:'9px 13px',flexShrink:0}}>
            <span>⚠️</span>
            <span style={{fontSize:12,color:'#B91C1C',fontWeight:600,flex:1}}>{urgentNames.join(', ')} expire today — prioritised</span>
          </div>
        )}

        {/* Meal cards */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 14px 24px'}}>
          {loadingMeals?(
            [1,2,3].map(i=><div key={i} className="shimmer-card" style={{height:160}}/>)
          ):!currentMeals?.length&&pantry.length===0?(
            <div style={{textAlign:'center',paddingTop:50}}>
              <div style={{fontSize:44}}>🛒</div>
              <p style={{fontWeight:700,fontSize:18,color:'var(--inkM)',marginTop:12}}>Add groceries first</p>
              <p style={{fontSize:13,color:'var(--gray)',marginTop:5}}>Go to Fridge and add items by voice.</p>
              <button className="btn-primary" onClick={()=>setTab('fridge')} style={{marginTop:16,width:'auto',padding:'11px 24px'}}>Go to Fridge →</button>
            </div>
          ):(filterCooledMeals(currentMeals||[])).map(m=>(
            <div key={m.id} style={{background:'var(--white)',border:`1.5px solid ${m.uses_expiring?'#FCA5A5':'var(--border)'}`,borderRadius:20,padding:16,marginBottom:14,position:'relative'}}>
              {m.uses_expiring&&<div style={{position:'absolute',top:12,right:12,background:'#FEE2E2',color:'#B91C1C',fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:10}}>USE TODAY</div>}
              <div style={{display:'flex',gap:12,alignItems:'flex-start',marginBottom:10}}>
                <span style={{fontSize:42,lineHeight:1.1}}>{m.emoji}</span>
                <div style={{flex:1,paddingRight:m.uses_expiring?50:0}}>
                  <div style={{fontWeight:800,fontSize:15,color:'var(--ink)',letterSpacing:-.3,lineHeight:1.3}}>{m.name}</div>
                  <div style={{display:'flex',gap:10,marginTop:5,flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:'var(--gray)'}}>⏱ {m.time_minutes} min</span>
                    <span style={{fontSize:11,color:'var(--gray)'}}>🔥 {m.calories} kcal</span>
                    <span style={{fontSize:11,color:'var(--navy)'}}>💪 {m.protein}g P</span>
                    {m.kid_safe&&<span style={{fontSize:11,color:'#15803D'}}>👶 {profile.toddlerName||'Kid'}-safe</span>}
                  </div>
                </div>
              </div>
              <p style={{fontSize:12,color:'var(--gray)',lineHeight:1.5,marginBottom:12}}>{m.notes}</p>
              <div style={{marginBottom:12}}>
                <p style={{fontSize:10,fontWeight:700,color:'var(--gray)',letterSpacing:.6,marginBottom:6}}>FROM YOUR FRIDGE</p>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {m.ingredients_used?.slice(0,5).map(i=>(
                    <span key={i.name} style={{background:'var(--grayL)',borderRadius:20,padding:'3px 10px',fontSize:12,fontWeight:600,color:'var(--inkM)'}}>{i.name}</span>
                  ))}
                </div>
              </div>
              <button onClick={()=>{setCooking(m);setCookStep(0);}} style={{width:'100%',background:cfg.color,color:'#fff',border:'none',borderRadius:12,padding:'12px',fontSize:13,fontWeight:800,fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                ▶ Cook this
              </button>
            </div>
          ))}

          {/* Premium upsell */}
          {!isPremium&&(
            <button onClick={()=>setShowPremium(true)} style={{width:'100%',background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #F59E0B',borderRadius:16,padding:14,display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginTop:4}}>
              <div style={{width:40,height:40,borderRadius:20,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:18}}>👑</div>
              <div style={{textAlign:'left'}}><div style={{fontWeight:800,fontSize:14,color:'#92400E'}}>Unlock 7-day meal plan</div><div style={{fontSize:12,color:'#B45309',marginTop:2}}>All 4 meals planned daily, automatically</div></div>
            </button>
          )}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // COOK SCREEN
  // ════════════════════════════════════════════════
  const renderCook = () => {
    if(!cooking) return null;
    const steps = cooking.steps||['Prepare ingredients.','Cook and enjoy!'];
    const cfg   = PERIODS.find(p=>p.id===period)!;
    return (
      <div className="cook-overlay">
        <div id="status-bar" className="dark" style={{flexShrink:0}}>
          <span>9:41</span>
          <div className="notch"/>
          <span style={{fontSize:11,color:'#fff'}}>●●●</span>
        </div>
        {/* Cook header */}
        <div style={{background:`linear-gradient(135deg,var(--navy),var(--navyD))`,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <button onClick={()=>setCooking(null)} style={{background:'rgba(255,255,255,.15)',border:'none',borderRadius:10,width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{flex:1}}>
            <div style={{color:'#fff',fontWeight:800,fontSize:16}}>{cooking.name}</div>
            <div style={{color:'#93C5FD',fontSize:12,marginTop:2}}>⏱ {cooking.time_minutes} min · 🔥 {cooking.calories} kcal</div>
          </div>
          <span style={{fontSize:30}}>{cooking.emoji}</span>
        </div>
        {/* Cook body */}
        <div className="screen" style={{padding:16}}>
          {cooking.kid_safe&&<div style={{background:'#DCFCE7',border:'1px solid #86EFAC',borderRadius:12,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:18}}>👶</span>
            <div style={{fontWeight:700,fontSize:13,color:'#14532D'}}>Safe for {profile.toddlerName||'little ones'} — mild, no choking hazards</div>
          </div>}
          {cooking.uses_expiring&&<div style={{background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:12,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <span>⚠️</span>
            <div style={{fontSize:13,color:'#92400E',fontWeight:600}}>Uses items expiring today — great choice!</div>
          </div>}
          {/* Macros */}
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            {[['🔥',cooking.calories,'kcal','var(--red)'],['💪',cooking.protein,'g P','var(--navy)'],['⏱',cooking.time_minutes,'min','#22C55E']].map(([ic,v,u,c])=>(
              <div key={u} style={{flex:1,background:'var(--white)',borderRadius:12,padding:'10px 8px',textAlign:'center',border:'1px solid var(--border)'}}>
                <div style={{fontSize:11,color:'var(--gray)'}}>{ic}</div>
                <div style={{fontSize:14,fontWeight:800,color:c as string,marginTop:2}}>{v} {u}</div>
              </div>
            ))}
          </div>
          {/* Ingredients */}
          <div style={{fontWeight:700,fontSize:11,color:'var(--gray)',letterSpacing:.6,marginBottom:6}}>INGREDIENTS</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
            {cooking.ingredients_used?.map(i=><span key={i.name} style={{background:'var(--grayL)',borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:600,color:'var(--inkM)'}}>{i.name} {i.qty}</span>)}
          </div>
          {/* All steps */}
          <div style={{fontWeight:700,fontSize:11,color:'var(--gray)',letterSpacing:.6,marginBottom:10}}>METHOD — {steps.length} STEPS</div>
          {steps.map((s,i)=>(
            <div key={i} style={{display:'flex',gap:12,marginBottom:14,alignItems:'flex-start'}}>
              <div style={{width:26,height:26,borderRadius:13,background:'var(--navy)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:900,flexShrink:0,marginTop:1}}>{i+1}</div>
              <div style={{fontSize:14,color:'var(--ink)',lineHeight:1.65,paddingTop:3}}>{s}</div>
            </div>
          ))}
          <button onClick={doneCooking} style={{width:'100%',background:cfg.color,border:'none',borderRadius:12,padding:14,fontWeight:800,fontSize:15,color:'#fff',cursor:'pointer',fontFamily:'inherit',marginTop:6}}>
            ✓ Done — update fridge
          </button>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // INSIGHTS SCREEN
  // ════════════════════════════════════════════════
  const renderInsights = () => {
    const total = pantry.reduce((a,i)=>a+(i.price||0),0);

    // ── Money saved vs takeout ──────────────────
    const AVG_TAKEOUT = region.avgTakeout;
    const moneySaved = cookLog.length * AVG_TAKEOUT;

    // ── Cook streak ─────────────────────────────
    const streak = (() => {
      if(!cookLog.length) return 0;
      const days = [...new Set(cookLog.map(l=>l.date.slice(0,10)))].sort().reverse();
      let s = 0;
      const today = new Date(); today.setHours(0,0,0,0);
      for(let i=0;i<days.length;i++){
        const d = new Date(days[i]);
        const diff = Math.round((today.getTime()-d.getTime())/(86400000));
        if(diff===i||diff===i+1){ s++; } else break;
      }
      return s;
    })();

    // ── Fridge efficiency score ──────────────────
    const totalUsed   = ateLog.length + cookLog.length;
    const totalWasted = wasteLog.length;
    const effScore = totalUsed+totalWasted===0 ? null : Math.round(totalUsed/(totalUsed+totalWasted)*100);

    // ── Most wasted item ────────────────────────
    const wasteCounts: Record<string,{count:number;emoji:string}> = {};
    wasteLog.forEach(w=>{ wasteCounts[w.name]={count:(wasteCounts[w.name]?.count||0)+1,emoji:w.emoji}; });
    const worstItem = Object.entries(wasteCounts).sort((a,b)=>b[1].count-a[1].count)[0];

    // ── Cooking personality ──────────────────────
    const personality = (() => {
      if(!cookLog.length) return null;
      const periods: Record<string,number> = {};
      cookLog.forEach(l=>{ periods[l.period]=(periods[l.period]||0)+1; });
      const uniqueMeals = new Set(cookLog.map(l=>l.name)).size;
      const variety = uniqueMeals / cookLog.length;
      if(variety>0.8) return {label:'The Experimenter',desc:'You rarely cook the same thing twice.',emoji:'🧪'};
      if(periods['breakfast']>=(cookLog.length*0.4)) return {label:'The Morning Person',desc:'You cook breakfast more than anyone.',emoji:'☀️'};
      if(periods['dinner']>=(cookLog.length*0.6)) return {label:'The Dinner Anchor',desc:'Home-cooked dinners are your thing.',emoji:'🌙'};
      if(cookLog.length>=14&&variety<0.4) return {label:'The Comfort Cook',desc:'A few trusted meals, cooked with love.',emoji:'🫶'};
      return {label:'The Everyday Cook',desc:'Consistent, reliable, no fuss.',emoji:'🍳'};
    })();

    // ── Waste cost this month (capped per item to avoid stale INR values) ──
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
    const wasteThisMonth = wasteLog.filter(w=>new Date(w.date)>=thisMonth);
    // Cap individual item waste price to avg takeout cost (sanity check for old unscaled data)
    const maxItemWaste = region.avgTakeout;
    const wasteCost = wasteThisMonth.reduce((a,w)=>a+Math.min(w.price, maxItemWaste),0);

    return (
      <div className="screen" style={{background:'var(--cream)'}}>
        <div style={{padding:'14px 16px 8px',flexShrink:0}}>
          <h1 style={{fontSize:26,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>Insights</h1>
          <p style={{fontSize:11,color:'var(--gray)',marginTop:1}}>{profile.name ? `${profile.name}'s kitchen` : 'Your kitchen'}</p>
        </div>
        <div style={{overflowY:'auto',padding:'4px 16px 32px'}}>

          {/* ── Hero: money saved — PREMIUM only, teaser for free ── */}
          <div style={{background:'linear-gradient(135deg,#14532D,#166534)',borderRadius:20,padding:20,marginBottom:12,position:'relative',overflow:'hidden'}}>
            <p style={{fontSize:11,color:'#86EFAC',fontWeight:700,letterSpacing:.6}}>SAVED VS ORDERING IN</p>
            {isPremium?(
              <>
                <p style={{fontSize:38,fontWeight:900,color:'#fff',marginTop:4}}>{fmt(moneySaved)}</p>
                <p style={{fontSize:13,color:'#BBF7D0',marginTop:2}}>{cookLog.length} home-cooked meals · avg {fmt(AVG_TAKEOUT)} saved each</p>
                <p style={{fontSize:10,color:'#6EE7B7',marginTop:4}}>Based on avg local takeout cost · update in settings</p>
              </>
            ):(
              <>
                <p style={{fontSize:38,fontWeight:900,color:'#fff',marginTop:4,filter:'blur(6px)',userSelect:'none'}}>••••</p>
                <p style={{fontSize:13,color:'#BBF7D0',marginTop:2}}>{cookLog.length} meals cooked at home</p>
                <button onClick={()=>setShowPremium(true)} style={{marginTop:8,background:'#22C55E',border:'none',borderRadius:10,padding:'7px 14px',fontSize:12,fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>
                  See how much you saved →
                </button>
              </>
            )}
            <div style={{display:'flex',gap:20,marginTop:14}}>
              {[[urgent.length,'expire today'],[pantry.filter(i=>daysLeft(i.expiry)<=3).length,'use in 3 days'],[fmt(total),'in fridge now']].map(([v,l])=>(
                <div key={String(l)}><div style={{fontWeight:900,fontSize:16,color:'#fff'}}>{v}</div><div style={{fontSize:10,color:'#86EFAC'}}>{l}</div></div>
              ))}
            </div>
          </div>

          {/* ── Row: streak + efficiency ── */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <div style={{background:'var(--white)',borderRadius:16,padding:16,border:'1px solid var(--border)'}}>
              <div style={{fontSize:28,marginBottom:6}}>🔥</div>
              <div style={{fontSize:28,fontWeight:900,color:streak>0?'#EA580C':'var(--gray)'}}>{streak}</div>
              <div style={{fontSize:11,fontWeight:700,color:'var(--gray)',marginTop:2}}>day cook streak</div>
              <div style={{fontSize:10,color:'var(--gray)',marginTop:4}}>{streak===0?'Cook today to start':'Keep it going!'}</div>
            </div>
            <div style={{background:'var(--white)',borderRadius:16,padding:16,border:'1px solid var(--border)'}}>
              <div style={{fontSize:28,marginBottom:6}}>⚡</div>
              <div style={{fontSize:28,fontWeight:900,color:effScore===null?'var(--gray)':effScore>=80?'#16A34A':effScore>=50?'#D97706':'#DC2626'}}>
                {effScore===null?'—':`${effScore}%`}
              </div>
              <div style={{fontSize:11,fontWeight:700,color:'var(--gray)',marginTop:2}}>fridge efficiency</div>
              <div style={{fontSize:10,color:'var(--gray)',marginTop:4}}>
                {effScore===null?'Mark items as eaten to track':effScore>=80?'Excellent — almost no waste':effScore>=50?'Room to improve':'Try using expiring items first'}
              </div>
            </div>
          </div>

          {/* ── Cooking personality ── */}
          {personality&&(
            <div style={{background:'linear-gradient(135deg,#EFF6FF,#DBEAFE)',border:'1px solid #BFDBFE',borderRadius:16,padding:16,marginBottom:12,display:'flex',alignItems:'center',gap:14}}>
              <div style={{fontSize:36,flexShrink:0}}>{personality.emoji}</div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--gray)',letterSpacing:.5,marginBottom:3}}>YOUR COOKING PERSONALITY</div>
                <div style={{fontSize:16,fontWeight:900,color:'var(--navy)'}}>{personality.label}</div>
                <div style={{fontSize:12,color:'var(--inkM)',marginTop:3}}>{personality.desc}</div>
              </div>
            </div>
          )}

          {/* ── Waste watch ── */}
          <div style={{background:'var(--white)',borderRadius:16,padding:16,marginBottom:12,border:'1px solid var(--border)'}}>
            <p style={{fontSize:13,fontWeight:800,color:'var(--ink)',marginBottom:12}}>🗑 Waste Watch</p>
            {wasteLog.length===0?(
              <p style={{fontSize:13,color:'var(--gray)',textAlign:'center',padding:'8px 0'}}>No waste recorded yet — great start!</p>
            ):(
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <div>
                    <div style={{fontSize:11,color:'var(--gray)'}}>items wasted this month</div>
                    <div style={{fontSize:22,fontWeight:900,color:'#DC2626'}}>{wasteThisMonth.length}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'var(--gray)'}}>cost of waste</div>
                    {isPremium?(
                      <div style={{fontSize:22,fontWeight:900,color:'#DC2626'}}>{fmt(wasteCost)}</div>
                    ):(
                      <button onClick={()=>setShowPremium(true)} style={{background:'#FEE2E2',border:'1px solid #FCA5A5',borderRadius:8,padding:'4px 10px',fontSize:12,fontWeight:700,color:'#DC2626',cursor:'pointer',fontFamily:'inherit'}}>Unlock 👑</button>
                    )}
                  </div>
                </div>
                {worstItem&&(
                  <div style={{background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:24}}>{worstItem[1].emoji}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:800,color:'#B91C1C'}}>{worstItem[0]} goes to waste most</div>
                      <div style={{fontSize:11,color:'#DC2626',marginTop:2}}>Wasted {worstItem[1].count}×  — try buying less or using it earlier</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Recently cooked ── */}
          {cookLog.length>0&&(
            <div style={{background:'var(--white)',borderRadius:16,padding:16,marginBottom:12,border:'1px solid var(--border)'}}>
              <p style={{fontSize:13,fontWeight:800,color:'var(--ink)',marginBottom:12}}>✅ Recently cooked</p>
              {cookLog.slice(0,5).map((l,i,arr)=>(
                <div key={l.id} style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:i<arr.length-1?'1px solid var(--border)':'none'}}>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{l.name}</div><div style={{fontSize:11,color:'var(--gray)'}}>{l.period} · {new Date(l.date).toLocaleDateString()}</div></div>
                  <span style={{fontSize:16}}>🍽️</span>
                </div>
              ))}
            </div>
          )}

          {!isPremium&&(
            <button onClick={()=>setShowPremium(true)} style={{width:'100%',background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #F59E0B',borderRadius:16,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
              <div style={{width:40,height:40,borderRadius:20,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>👑</div>
              <div style={{textAlign:'left'}}><div style={{fontWeight:800,fontSize:14,color:'#92400E'}}>Unlock full insights</div><div style={{fontSize:12,color:'#B45309',marginTop:2}}>Weekly trends, spending by store, 30-day waste report</div></div>
            </button>
          )}
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // PROFILE SCREEN
  // ════════════════════════════════════════════════
  const renderProfile = () => (
    <div className="screen" style={{background:'var(--cream)'}}>
      <div style={{padding:'14px 16px 0'}}><h1 style={{fontSize:26,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>Profile</h1></div>
      <div style={{padding:'12px 16px 24px'}}>
        {isPremium?(
          <div style={{background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'2px solid #F59E0B',borderRadius:18,padding:16,marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:44,height:44,borderRadius:22,background:'linear-gradient(135deg,#F59E0B,#D97706)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>👑</div>
              <div><p style={{fontWeight:900,fontSize:16,color:'#92400E'}}>Premium · Active</p><p style={{fontSize:12,color:'#B45309'}}>All features unlocked</p></div>
            </div>
            <button onClick={()=>setIsPremium(false)} style={{width:'100%',marginTop:12,background:'none',border:'1px solid #FCD34D',borderRadius:10,padding:8,fontSize:12,color:'#B45309',cursor:'pointer',fontFamily:'inherit'}}>Downgrade to free</button>
          </div>
        ):(
          <button onClick={()=>setShowPremium(true)} style={{width:'100%',background:`linear-gradient(135deg,var(--navy),var(--navyD))`,border:'none',borderRadius:18,padding:16,marginBottom:14,cursor:'pointer',textAlign:'left'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <span style={{fontSize:28}}>👑</span>
              <div><p style={{fontWeight:900,fontSize:16,color:'#fff'}}>Free Plan</p><p style={{fontSize:12,color:'#93C5FD'}}>Upgrade to unlock all features</p></div>
            </div>
            <div style={{background:'linear-gradient(135deg,#F59E0B,#D97706)',borderRadius:12,padding:13,textAlign:'center',fontWeight:900,fontSize:14,color:'#fff'}}>Upgrade to Premium</div>
          </button>
        )}
        {/* Profile summary */}
        <div className="card" style={{marginBottom:14}}>
          {[['👤','Name',profile.name||'—'],['🥗','Diet',`${profile.isVeg?'Vegetarian':'Omnivore'}${profile.eatsEggs?' + eggs':''}`],['👨‍👩‍👧','Family',`${profile.familySize} people${profile.hasToddler?` · ${profile.toddlerName} safety ON`:''}`]].map(([ic,lb,val],i,arr)=>(
            <div key={lb} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:i<arr.length-1?'1px solid var(--border)':'none'}}>
              <div style={{width:34,height:34,borderRadius:10,background:'var(--grayL)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{ic}</div>
              <div style={{flex:1}}><div style={{fontSize:11,color:'var(--gray)'}}>{lb}</div><div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{val}</div></div>
            </div>
          ))}
        </div>

        {/* ── Email Auto-Sync Settings ── */}
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:18,marginBottom:14,overflow:'hidden'}}>
          {/* Header */}
          <div onClick={()=>{setShowSyncSetup(v=>!v); if(!syncEmail) getOrCreateSyncEmail(); else refreshSyncStatus();}}
            style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',cursor:'pointer'}}>
            <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#6366F1,#4F46E5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>📧</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:800,color:'var(--ink)'}}>Email Auto-Sync</div>
              <div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>
                {syncLog.length>0
                  ? `Last sync: ${new Date(syncLog[0].syncedAt).toLocaleDateString()} · ${syncLog[0].count} items from ${syncLog[0].store}`
                  : syncEmail ? 'Waiting for first order email…' : 'Forward order emails → auto-add to fridge'}
              </div>
            </div>
            {syncLog.length>0 && <div style={{width:8,height:8,borderRadius:4,background:'#22C55E',flexShrink:0}}/>}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5" strokeLinecap="round" style={{transform:showSyncSetup?'rotate(90deg)':'rotate(0deg)',transition:'transform .2s',flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg>
          </div>

          {showSyncSetup&&(
            <div style={{borderTop:'1px solid var(--border)',padding:'16px'}}>
              {/* Your unique sync email */}
              <p style={{fontSize:11,fontWeight:700,color:'var(--gray)',letterSpacing:.6,marginBottom:8}}>YOUR UNIQUE SYNC ADDRESS</p>
              {syncLoading?(
                <div style={{background:'var(--grayL)',borderRadius:12,padding:14,textAlign:'center',color:'var(--gray)',fontSize:13}}>Generating your address…</div>
              ) : syncEmail ? (
                <div style={{background:'#EFF6FF',border:'1.5px solid #BFDBFE',borderRadius:12,padding:'10px 12px',display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                  <div style={{flex:1,fontSize:12,fontWeight:700,color:'var(--navy)',wordBreak:'break-all',fontFamily:'monospace'}}>{syncEmail}</div>
                  <button onClick={copySyncEmail} style={{background:copied?'#22C55E':'var(--navy)',border:'none',borderRadius:8,padding:'7px 12px',fontSize:11,fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:'inherit',flexShrink:0,transition:'background .2s'}}>
                    {copied?'✓ Copied':'Copy'}
                  </button>
                </div>
              ) : (
                <button onClick={getOrCreateSyncEmail} style={{width:'100%',background:'var(--navy)',border:'none',borderRadius:12,padding:12,fontSize:13,fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:'inherit',marginBottom:12}}>
                  Generate my sync address →
                </button>
              )}

              {/* Setup guide */}
              <p style={{fontSize:11,fontWeight:700,color:'var(--gray)',letterSpacing:.6,marginBottom:8}}>HOW TO SET UP (2 MINUTES)</p>
              {[
                ['1','Get your address above','Tap Copy to copy your unique FreshNudge email'],
                ['2','Open Gmail / Outlook','Go to Settings → Filters → Create new filter'],
                ['3','Set filter rule','From: swiggy.com OR blinkit.com OR foodpanda.sg (or your local apps)'],
                ['4','Action: Forward to','Paste your FreshNudge sync address. Done!'],
              ].map(([n,title,desc])=>(
                <div key={n} style={{display:'flex',gap:10,marginBottom:10}}>
                  <div style={{width:22,height:22,borderRadius:11,background:'var(--navy)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900,flexShrink:0}}>{n}</div>
                  <div><div style={{fontSize:13,fontWeight:700,color:'var(--ink)'}}>{title}</div><div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>{desc}</div></div>
                </div>
              ))}

              {/* Supported apps by region */}
              <div style={{background:'var(--grayL)',borderRadius:12,padding:'10px 12px',marginBottom:12}}>
                <p style={{fontSize:11,fontWeight:700,color:'var(--gray)',marginBottom:6}}>WORKS WITH</p>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {[['🇮🇳','Blinkit, Swiggy, Zepto, BigBasket'],['🇸🇬','FoodPanda, GrabMart, RedMart, NTUC'],['🇺🇸','Instacart, Amazon Fresh, Walmart'],['🇬🇧','Ocado, Tesco, Sainsbury\'s'],['🇦🇺','Woolworths, Coles']].map(([flag,apps])=>(
                    <div key={flag} style={{fontSize:11,color:'var(--inkM)'}}><span>{flag}</span> {apps}</div>
                  ))}
                </div>
              </div>

              {/* Recent sync log */}
              {syncLog.length>0&&(
                <>
                  <p style={{fontSize:11,fontWeight:700,color:'var(--gray)',letterSpacing:.6,marginBottom:8}}>RECENT SYNCS</p>
                  {syncLog.slice(0,5).map((s,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<Math.min(syncLog.length,5)-1?'1px solid var(--border)':'none'}}>
                      <div style={{width:32,height:32,borderRadius:8,background:'#F0FDF4',border:'1px solid #86EFAC',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>📦</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:'var(--ink)'}}>{s.store} · {s.count} items</div>
                        <div style={{fontSize:10,color:'var(--gray)'}}>{s.items?.slice(0,3).join(', ')}{(s.items?.length||0)>3?` +${s.items.length-3} more`:''}</div>
                      </div>
                      <div style={{fontSize:10,color:'var(--gray)',flexShrink:0}}>{new Date(s.syncedAt).toLocaleDateString()}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Reset */}
        <button onClick={()=>{ if(confirm('Reset all data and restart onboarding?')){localStorage.removeItem('mise_v1');window.location.reload();} }}
          style={{width:'100%',background:'none',border:'1px solid #FCA5A5',borderRadius:12,padding:11,fontSize:13,color:'var(--red)',cursor:'pointer',fontFamily:'inherit'}}>
          Reset app data
        </button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════
  // PREMIUM MODAL
  // ════════════════════════════════════════════════
  const renderPremium = () => (
    <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowPremium(false);}}>
      <div className="modal-sheet">
        <div className="modal-handle"/>
        <div style={{padding:'16px 22px 12px',flexShrink:0}}>
          <div style={{textAlign:'center',marginBottom:16}}>
            <div style={{fontSize:38,marginBottom:8}}>👑</div>
            <h2 style={{fontSize:22,fontWeight:900,color:'var(--ink)',letterSpacing:-.4}}>FreshNudge Premium</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginTop:4}}>Your kitchen, on autopilot.</p>
          </div>
          <div style={{background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'2px solid #F59E0B',borderRadius:16,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div><span style={{fontSize:34,fontWeight:900,color:'#92400E'}}>{region.monthlyPrice}</span><span style={{fontSize:14,color:'#B45309',fontWeight:600}}>/month</span></div>
            <div style={{textAlign:'right'}}><p style={{fontSize:12,color:'#B45309',fontWeight:700}}>7-day free trial</p><p style={{fontSize:11,color:'#D97706'}}>Cancel anytime</p></div>
          </div>
        </div>
        <div className="modal-body" style={{padding:'0 22px'}}>
          {[
            ['📧','Email auto-sync',region.groceryApps.slice(0,3).join(', ')],
            ['💰','Real savings tracking',`See exactly how much you save vs ${region.groceryApps[0]}`],
            ['🔔','Daily meal push','All 4 meals sent to you automatically'],
            ['👶','Child safety filter','Every recipe pre-checked for toddler safety'],
            ['📅','7-day meal plan','Full week planned every Sunday'],
            ['📊','Full spending breakdown','Waste cost, category trends, monthly report'],
          ].map(([ic,lb,sub])=>(
            <div key={lb} style={{display:'flex',alignItems:'flex-start',gap:12,paddingBottom:12,marginBottom:12,borderBottom:'1px solid var(--border)'}}>
              <div style={{width:34,height:34,borderRadius:10,background:'#FFFBEB',border:'1px solid #FDE68A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{ic}</div>
              <div style={{flex:1}}><p style={{fontWeight:700,fontSize:13,color:'var(--ink)'}}>{lb}</p><p style={{fontSize:12,color:'var(--gray)',marginTop:2}}>{sub}</p></div>
              <div style={{width:18,height:18,borderRadius:9,background:'#DCFCE7',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2,fontSize:11}}>✓</div>
            </div>
          ))}
          <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:12,padding:14,marginBottom:16}}>
            <p style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:8}}>💡 The math</p>
            <p style={{fontSize:12,color:'var(--inkM)',lineHeight:1.7}}>One {region.groceryApps[0]} grocery order typically costs {fmt(region.avgOrderSize)}+. FreshNudge is <strong>{region.monthlyPrice}/month</strong> — just {Math.round(region.monthlyPriceNum/region.avgOrderSize*100)}% of that. Cook more, order less.</p>
          </div>
        </div>
        <div style={{padding:'12px 22px',paddingBottom:'max(28px,env(safe-area-inset-bottom))'}}>
          <button onClick={()=>{setIsPremium(true);save({isPremium:true});setShowPremium(false);showToast('🎉 Welcome to Premium!');}}
            style={{width:'100%',background:'linear-gradient(135deg,#F59E0B,#D97706)',border:'none',borderRadius:16,padding:16,fontSize:16,fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit',marginBottom:10}}>
            👑 Start 7-day free trial
          </button>
          <button onClick={()=>setShowPremium(false)} style={{width:'100%',background:'none',border:'none',color:'var(--gray)',fontSize:13,cursor:'pointer',padding:6,fontFamily:'inherit'}}>Maybe later</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════
  // EXPIRY EDIT MODAL
  // ════════════════════════════════════════════════
  const renderExpiryEdit = () => (
    <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setEditExpiry(null);}}>
      <div className="modal-sheet" style={{borderRadius:'26px 26px 0 0'}}>
        <div className="modal-handle"/>
        <div style={{padding:'20px 22px 32px'}}>
          <p style={{fontWeight:800,fontSize:18,color:'var(--ink)',marginBottom:4}}>Edit expiry — {editExpiry?.name}</p>
          <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Current: expires in {editExpiry?.expDays} days. Enter new number of days from today.</p>
          <input type="number" value={newExpiryDays} onChange={e=>setNewExpiryDays(e.target.value)}
            placeholder="e.g. 5" style={{width:'100%',marginBottom:16,fontSize:22,fontWeight:700,textAlign:'center',borderRadius:14,padding:'14px',border:'2px solid var(--navy)'}}/>
          <button className="btn-primary" onClick={applyExpiryEdit} style={{marginBottom:10}}>Save</button>
          <button onClick={()=>setEditExpiry(null)} style={{width:'100%',background:'none',border:'none',color:'var(--gray)',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════
  const statusDark = cooking || tab==='fridge';

  return (
    <div id="app">
      <Confetti on={confetti}/>

      {/* Status bar */}
      <div id="status-bar" className={statusDark?'dark':''} style={{background:statusDark?'var(--navy)':'var(--cream)',color:statusDark?'#fff':'var(--ink)'}}>
        <span id="time">{new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
        <div className="notch"/>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0" y="4" width="2.5" height="6" rx=".8" fill="currentColor"/><rect x="4" y="2.5" width="2.5" height="7.5" rx=".8" fill="currentColor"/><rect x="8" y="1" width="2.5" height="9" rx=".8" fill="currentColor"/><rect x="12" y="0" width="2" height="10" rx=".8" fill="currentColor"/></svg>
          <svg width="18" height="11" viewBox="0 0 20 12"><rect x=".5" y=".5" width="17" height="11" rx="2.5" stroke="currentColor" strokeWidth="1" fill="none"/><rect x="2" y="2" width="12" height="7" rx="1.5" fill="currentColor"/></svg>
        </div>
      </div>

      {/* Screens */}
      <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',position:'relative'}}>
        {!onboardingDone ? renderOnboarding() :
          cooking ? renderCook() :
          tab==='fridge' ? renderFridge() :
          tab==='meals'  ? renderMeals() :
          tab==='insights' ? renderInsights() :
          renderProfile()}
      </div>

      {/* Daily Rescue banner */}
      {dailyRescipe && (
        <div style={{position:'fixed',bottom:80,left:12,right:12,background:'linear-gradient(135deg,#1E3A8A,#1E40AF)',borderRadius:18,padding:'14px 16px',zIndex:150,display:'flex',alignItems:'center',gap:12,boxShadow:'0 8px 32px rgba(30,58,138,.4)'}}>
          <span style={{fontSize:24}}>{dailyRescipe.item.emoji}</span>
          <div style={{flex:1}}>
            <p style={{fontSize:13,fontWeight:800,color:'#fff',marginBottom:2}}>🍳 Daily Rescue!</p>
            <p style={{fontSize:12,color:'#BFDBFE'}}>Use that {dailyRescipe.item.name} for a 15-min {dailyRescipe.recipe}</p>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>{setTab('meals');setDailyRescipe(null);}} style={{background:'#22C55E',color:'#fff',border:'none',borderRadius:10,padding:'6px 12px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cook →</button>
            <button onClick={()=>setDailyRescipe(null)} style={{background:'rgba(255,255,255,.15)',color:'#fff',border:'none',borderRadius:10,padding:'6px 8px',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>✕</button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      {onboardingDone&&!cooking&&(
        <nav id="bottom-nav">
          {navItems.map(({id,icon,label})=>(
            <button key={id} className={`nav-btn${tab===id?' active':''}`} onClick={()=>setTab(id)}>
              <div className="nav-icon">{icon}</div>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Modals */}
      {showPremium&&renderPremium()}
      {editExpiry&&renderExpiryEdit()}

      {/* Gmail Setup Guide */}
      {showGmailSetup&&(
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowGmailSetup(false);}}>
          <div className="modal-sheet" style={{borderRadius:'26px 26px 0 0'}}>
            <div className="modal-handle"/>
            <div style={{padding:'20px 22px 32px',overflowY:'auto',maxHeight:'80vh'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                <div style={{width:42,height:42,borderRadius:12,background:'#EFF6FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>📧</div>
                <div>
                  <p style={{fontWeight:900,fontSize:18,color:'var(--ink)'}}>Connect Gmail</p>
                  <p style={{fontSize:12,color:'var(--gray)'}}>One-time setup · takes 3 minutes</p>
                </div>
              </div>

              <div style={{background:'#FEF9C3',border:'1.5px solid #FCD34D',borderRadius:14,padding:14,marginBottom:20}}>
                <p style={{fontSize:13,fontWeight:700,color:'#92400E',marginBottom:4}}>⚙️ Admin step needed</p>
                <p style={{fontSize:12,color:'#B45309',lineHeight:1.6}}>Gmail OAuth requires a Google Cloud Client ID. Ask your developer to add <code style={{background:'#FDE68A',borderRadius:4,padding:'1px 4px',fontSize:11}}>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to Vercel environment variables.</p>
              </div>

              <p style={{fontSize:13,fontWeight:800,color:'var(--ink)',marginBottom:12}}>How to set it up:</p>

              {[
                {n:'1', title:'Create a Google Cloud project', body:'Go to console.cloud.google.com → New Project → name it "FreshNudge"'},
                {n:'2', title:'Enable Gmail API', body:'APIs & Services → Library → search "Gmail API" → Enable'},
                {n:'3', title:'Create OAuth credentials', body:'APIs & Services → Credentials → Create Credentials → OAuth Client ID → Web application'},
                {n:'4', title:'Add your domain', body:'Under "Authorized JavaScript origins" add:\nhttps://mise-lac.vercel.app\nhttp://localhost:3000 (for local dev)'},
                {n:'5', title:'Copy the Client ID', body:'It looks like: 123456789-abc.apps.googleusercontent.com'},
                {n:'6', title:'Add to Vercel', body:'Vercel Dashboard → your project → Settings → Environment Variables → add NEXT_PUBLIC_GOOGLE_CLIENT_ID = paste value → Redeploy'},
              ].map(s=>(
                <div key={s.n} style={{display:'flex',gap:12,marginBottom:14}}>
                  <div style={{width:26,height:26,borderRadius:13,background:'var(--navy)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,flexShrink:0,marginTop:1}}>{s.n}</div>
                  <div>
                    <p style={{fontSize:13,fontWeight:700,color:'var(--ink)',marginBottom:2}}>{s.title}</p>
                    <p style={{fontSize:12,color:'var(--gray)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{s.body}</p>
                  </div>
                </div>
              ))}

              <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:12,padding:14,marginBottom:20}}>
                <p style={{fontSize:12,fontWeight:700,color:'var(--navy)',marginBottom:4}}>💡 Simpler alternative</p>
                <p style={{fontSize:12,color:'var(--inkM)',lineHeight:1.6}}>Use <strong>Forward-to-sync</strong> instead — no setup required. Just forward any grocery order email to your unique FreshNudge address. Works with Gmail, Outlook, Apple Mail, and any email app.</p>
              </div>

              <button onClick={()=>setShowGmailSetup(false)} className="btn-primary">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Plain toast */}
      {toast&&<div style={{position:'absolute',bottom:100,left:'50%',transform:'translateX(-50%)',background:'#111827',color:'#fff',padding:'10px 18px',borderRadius:24,fontSize:13,fontWeight:700,zIndex:200,whiteSpace:'nowrap',animation:'fadeIn .2s'}}>{toast}</div>}

      {/* Interactive voice toast — "Added 1L Milk  [ − ] [qty] [ + ]" */}
      {voiceToast&&(()=>{
        const item = voiceToast.items[voiceToast.activeIdx];
        const hasMore = voiceToast.items.length > 1;
        return (
          <div style={{position:'absolute',bottom:100,left:'50%',transform:'translateX(-50%)',zIndex:201,animation:'fadeIn .25s',display:'flex',alignItems:'center',gap:0,background:'#111827',borderRadius:28,padding:'6px 6px 6px 14px',boxShadow:'0 4px 24px rgba(0,0,0,.35)'}}>
            {/* Item info — tap to cycle if multiple */}
            <div onClick={cycleVoiceToastItem} style={{display:'flex',alignItems:'center',gap:7,cursor:hasMore?'pointer':'default',paddingRight:8}}>
              <span style={{fontSize:20}}>{item.emoji}</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#fff',lineHeight:1.2}}>{item.name}</div>
                <div style={{fontSize:11,color:'#9CA3AF',lineHeight:1}}>{fmtQty(item.qty, item.unit)}{hasMore?` · ${voiceToast.activeIdx+1}/${voiceToast.items.length}`:''}</div>
              </div>
            </div>
            {/* − qty + */}
            <div style={{display:'flex',alignItems:'center',gap:2,background:'rgba(255,255,255,.1)',borderRadius:20,padding:'4px 6px'}}>
              <button onClick={()=>adjustVoiceQty(-1)} style={{width:28,height:28,borderRadius:14,background:'rgba(255,255,255,.15)',border:'none',color:'#fff',fontSize:18,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1,fontFamily:'inherit'}}>−</button>
              <span style={{fontSize:13,fontWeight:800,color:'#fff',minWidth:36,textAlign:'center'}}>{fmtQty(item.qty, item.unit)}</span>
              <button onClick={()=>adjustVoiceQty(+1)} style={{width:28,height:28,borderRadius:14,background:'rgba(255,255,255,.15)',border:'none',color:'#fff',fontSize:18,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1,fontFamily:'inherit'}}>+</button>
            </div>
            {/* Dismiss */}
            <button onClick={dismissVoiceToast} style={{width:28,height:28,borderRadius:14,background:'none',border:'none',color:'#6B7280',fontSize:16,cursor:'pointer',marginLeft:4,fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
          </div>
        );
      })()}
    </div>
  );
}
