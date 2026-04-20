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
type Country = 'IN' | 'SG' | 'US';
type DietMode = 'veg' | 'vegan' | 'all' | 'halal';
interface Profile {
  name: string; city: string; country: Country; isVeg: boolean; eatsEggs: boolean;
  dietMode?: DietMode;
  hasToddler: boolean; toddlerName: string; toddlerAge: number;
  familySize: number; allergies: string[];
  notifTimes: Record<string, string>;
  cuisines?: string[];
}

const CUISINES: {id:string;emoji:string;name:string;examples:string}[] = [
  {id:'Indian',       emoji:'🇮🇳', name:'Indian everyday',     examples:'Dal, sabzi, roti, chawal, khichdi, poha, upma, sawaiyan'},
  {id:'Asian',        emoji:'🍜', name:'Asian',                examples:'Stir fry, fried rice, noodles, curry, dim sum'},
  {id:'Western',      emoji:'🍝', name:'Western / Continental',examples:'Pasta, sandwiches, salads, grilled food'},
  {id:'Mexican',      emoji:'🌮', name:'Mexican / Middle Eastern',examples:'Wraps, tacos, hummus, kebabs'},
  {id:'Mediterranean',emoji:'🥗', name:'Mediterranean',        examples:'Grain bowls, roasted veggies, fish, olive oil'},
];

const COUNTRIES: { id: Country; label: string; flag: string; cities: string[] }[] = [
  { id: 'IN', label: 'India',     flag: '🇮🇳', cities: ['Mumbai','Delhi','Bangalore','Hyderabad','Pune','Chennai'] },
  { id: 'SG', label: 'Singapore', flag: '🇸🇬', cities: ['Singapore'] },
  { id: 'US', label: 'USA',       flag: '🇺🇸', cities: ['New York','San Francisco','Los Angeles','Chicago','Boston','Austin'] },
];

const CURRENCY: Record<Country, { symbol: string; code: string; locale: string }> = {
  IN: { symbol: '₹',  code: 'INR', locale: 'en-IN' },
  SG: { symbol: 'S$', code: 'SGD', locale: 'en-SG' },
  US: { symbol: '$',  code: 'USD', locale: 'en-US' },
};

function fmtMoney(amount: number, country: Country): string {
  const c = CURRENCY[country];
  return `${c.symbol}${amount.toLocaleString(c.locale)}`;
}

// Affiliate / grocery deep-links per country (plain search, no affiliate IDs)
const STORES: Record<Country, { name: string; emoji: string; url: (q: string) => string }[]> = {
  IN: [
    { name: 'Blinkit',     emoji: '🟡', url: (q) => `https://blinkit.com/s/?q=${encodeURIComponent(q)}` },
    { name: 'Zepto',       emoji: '🟣', url: (q) => `https://www.zepto.com/search?query=${encodeURIComponent(q)}` },
    { name: 'BigBasket',   emoji: '🟢', url: (q) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(q)}` },
    { name: 'Amazon IN',   emoji: '🟠', url: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}` },
  ],
  SG: [
    { name: 'Shopee',    emoji: '🟠', url: (q) => `https://shopee.sg/search?keyword=${encodeURIComponent(q)}` },
    { name: 'GrabMart',  emoji: '🟢', url: (q) => `https://food.grab.com/sg/en/mart/search?keyword=${encodeURIComponent(q)}` },
    { name: 'Amazon SG', emoji: '🔵', url: (q) => `https://www.amazon.sg/s?k=${encodeURIComponent(q)}` },
    { name: 'RedMart',   emoji: '🔴', url: (q) => `https://redmart.lazada.sg/catalog/?q=${encodeURIComponent(q)}` },
  ],
  US: [
    { name: 'Instacart',   emoji: '🥕', url: (q) => `https://www.instacart.com/store/s?k=${encodeURIComponent(q)}` },
    { name: 'Amazon Fresh',emoji: '🟠', url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&rh=n%3A16310101` },
    { name: 'Walmart',     emoji: '🔵', url: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
    { name: 'Whole Foods', emoji: '🟢', url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&rh=n%3A16310101%2Cp_n_availability%3A2245350011` },
  ],
};
interface CookLog { id: string; name: string; period: string; date: string; }

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

const PERIODS = [
  {id:'breakfast',label:'Breakfast',emoji:'☀️',time:'7–9 AM',color:'#C68A2E',bg:'#FFFBEB',brd:'#FDE68A'},
  {id:'lunch',    label:'Lunch',    emoji:'🌤️',time:'12–2 PM',color:'#4A6B3A',bg:'#F0FDF4',brd:'#86A87A'},
  {id:'snack',    label:'Snack',    emoji:'🍎',time:'4–5 PM', color:'#7C3AED',bg:'#F5F3FF',brd:'#C4B5FD'},
  {id:'dinner',   label:'Dinner',  emoji:'🌙',time:'6–8 PM', color:'#C94A3A',bg:'#FAF2EE',brd:'#F4D8C8'},
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

// ── Confetti ───────────────────────────────────────────────────────
function Confetti({on}:{on:boolean}) {
  if(!on) return null;
  const cols = ['#86A87A','#C68A2E','#C94A3A','#F87171','#C084FC','#FCD34D'];
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

// ── Category tints (for letter-avatar backgrounds) ────────────────
const CAT_TINT: Record<string,{bg:string;fg:string}> = {
  Produce:    {bg:'#E8F3E4', fg:'#2F5233'},
  Dairy:      {bg:'#EEF1F7', fg:'#35405E'},
  Protein:    {bg:'#F5E8DE', fg:'#6A3F1F'},
  Grains:     {bg:'#F3EEDB', fg:'#6A5214'},
  Snacks:     {bg:'#F1E4E8', fg:'#73294A'},
  Beverages:  {bg:'#E4EEF1', fg:'#1F4A5C'},
  Condiments: {bg:'#F2EDE4', fg:'#544326'},
  Frozen:     {bg:'#E4ECF1', fg:'#3A4C5E'},
  Spices:     {bg:'#F1E4E8', fg:'#73294A'},
  Other:      {bg:'#ECEBE6', fg:'#4A4843'},
};
function catTint(cat: string) { return CAT_TINT[cat] ?? CAT_TINT.Other; }

// ── Fridge Item row (click to open) ────────────────────────────────
function FridgeItem({item,onClick,currencySymbol}:{item:PantryItem;onClick:()=>void;currencySymbol:string}) {
  const dl = daysLeft(item.expiry);
  const tintColor = dl<=1 ? '#C94A3A' : dl<=4 ? '#C68A2E' : '#4A6B3A';
  const ct = catTint(item.cat);
  return (
    <button onClick={onClick} style={{
      display:'flex',alignItems:'center',gap:12,
      background:'var(--white)',border:'1px solid var(--border)',
      borderRadius:14,padding:'12px 14px',
      fontFamily:'inherit',cursor:'pointer',textAlign:'left',width:'100%',
      borderLeft:`3px solid ${tintColor}`,
    }}>
      <div style={{
        width:40,height:40,borderRadius:10,background:ct.bg,
        display:'flex',alignItems:'center',justifyContent:'center',
        flexShrink:0,fontSize:22,
      }}>{item.emoji||item.name.charAt(0).toUpperCase()}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--ink)',letterSpacing:-.1}}>{item.name}</div>
        <div style={{fontSize:11.5,color:'var(--gray)',marginTop:2}}>{item.qty}{item.unit} · {item.cat} · {item.src==='🎙️'?'voice':item.src==='✍️'?'manual':item.src==='📷'?'scan':item.src}</div>
      </div>
      <div style={{textAlign:'right',flexShrink:0}}>
        <div style={{fontFamily:'var(--mono)',fontSize:11.5,fontWeight:700,color:tintColor,letterSpacing:.3}}>{fmtDays(dl)}</div>
        {item.price>0&&<div style={{fontSize:11,color:'var(--gray)',marginTop:2}}>{currencySymbol}{item.price}</div>}
      </div>
    </button>
  );
}

// ── Main App ───────────────────────────────────────────────────────
export default function App() {
  // ── Persistent state (localStorage) ────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    name:'', city:'Mumbai', country:'IN', isVeg:true, eatsEggs:true,
    hasToddler:false, toddlerName:'', toddlerAge:2, familySize:2, allergies:[],
    notifTimes:{breakfast:'07:30',lunch:'11:30',snack:'16:00',dinner:'17:30'},
  });
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [cookLog, setCookLog] = useState<CookLog[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [shopList, setShopList] = useState<{id:string;name:string;checked:boolean}[]>([]);
  const [usedLog,  setUsedLog]  = useState<{id:string;name:string;price:number;date:string}[]>([]);
  const [wasteLog, setWasteLog] = useState<{id:string;name:string;price:number;date:string}[]>([]);

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
  const recognitionRef = useRef<unknown>(null);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Detect country from browser locale ──────────────────────────
  const detectCountry = (): Country => {
    if (typeof navigator === 'undefined') return 'IN';
    const lang = navigator.language || 'en-IN';
    const region = lang.split('-')[1]?.toUpperCase();
    if (region === 'SG') return 'SG';
    if (region === 'US') return 'US';
    if (region === 'IN') return 'IN';
    // Fallback: timezone hint
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz.includes('Singapore')) return 'SG';
      if (tz.startsWith('America/')) return 'US';
    } catch {}
    return 'IN';
  };

  // ── Load from localStorage ──────────────────────────────────────
  useEffect(()=>{
    try {
      const saved = localStorage.getItem('mise_v1');
      if(saved) {
        const d = JSON.parse(saved);
        if(d.onboardingDone) setOnboardingDone(true);
        if(d.profile)  setProfile({ country: detectCountry(), ...d.profile });
        else setProfile(p => ({ ...p, country: detectCountry() }));
        if(d.family)   setFamily(d.family);
        if(d.pantry)   setPantry(d.pantry);
        if(d.cookLog)  setCookLog(d.cookLog);
        if(d.isPremium) setIsPremium(true);
        if(d.shopList) setShopList(d.shopList);
        if(d.usedLog)  setUsedLog(d.usedLog);
        if(d.wasteLog) setWasteLog(d.wasteLog);
      } else {
        setProfile(p => ({ ...p, country: detectCountry() }));
      }
    } catch{}
  },[]);

  // ── Save to localStorage ────────────────────────────────────────
  const save = useCallback((updates: Partial<{onboardingDone:boolean;profile:Profile;family:FamilyMember[];pantry:PantryItem[];cookLog:CookLog[];isPremium:boolean;shopList:{id:string;name:string;checked:boolean}[];usedLog:{id:string;name:string;price:number;date:string}[];wasteLog:{id:string;name:string;price:number;date:string}[]}>)=>{
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

  // ── Onboarding ──────────────────────────────────────────────────
  const OB_STEPS = ['welcome','name','household','sources','cuisines','notifications','done'];
  const obPct = Math.round(((obStep+1)/OB_STEPS.length)*100);

  const completeOnboarding = () => {
    setOnboardingDone(true);
    // Seed demo pantry
    const demo: PantryItem[] = [
      {id:uid(),name:'Spinach',  emoji:'🥬',cat:'Produce',qty:200,unit:'g',price:49, expiry:expiryDate(0),expDays:0,src:'🎙️'},
      {id:uid(),name:'Paneer',   emoji:'🧀',cat:'Dairy',  qty:250,unit:'g',price:95, expiry:expiryDate(1),expDays:1,src:'🎙️'},
      {id:uid(),name:'Milk',     emoji:'🥛',cat:'Dairy',  qty:1,  unit:'L',price:68, expiry:expiryDate(1),expDays:1,src:'🎙️'},
      {id:uid(),name:'Eggs',     emoji:'🥚',cat:'Protein',qty:12, unit:'pcs',price:85,expiry:expiryDate(5),expDays:5,src:'🎙️'},
      {id:uid(),name:'Tomatoes', emoji:'🍅',cat:'Produce',qty:4,  unit:'pcs',price:35,expiry:expiryDate(3),expDays:3,src:'🎙️'},
      {id:uid(),name:'Banana',   emoji:'🍌',cat:'Produce',qty:4,  unit:'pcs',price:30,expiry:expiryDate(3),expDays:3,src:'🎙️'},
      {id:uid(),name:'Oats',     emoji:'🥣',cat:'Grains', qty:500,unit:'g',price:85, expiry:expiryDate(90),expDays:90,src:'🎙️'},
      {id:uid(),name:'Brown Rice',emoji:'🌾',cat:'Grains', qty:1,  unit:'kg',price:140,expiry:expiryDate(60),expDays:60,src:'🎙️'},
      {id:uid(),name:'Onion',    emoji:'🧅',cat:'Produce',qty:3,  unit:'pcs',price:20,expiry:expiryDate(20),expDays:20,src:'🎙️'},
    ];
    setPantry(demo);
    const fam: FamilyMember[] = [
      {id:1,name:profile.name||'You',role:'Adult',age:30,avatar:'👤'},
    ];
    if(profile.hasToddler) fam.push({id:2,name:profile.toddlerName||'Little one',role:'Toddler',age:profile.toddlerAge,avatar:'👶'});
    setFamily(fam);
    save({onboardingDone:true,profile,family:fam,pantry:demo});
  };

  // ── Add items to pantry ─────────────────────────────────────────
  const addItems = useCallback((items: {item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string}[]) => {
    const newItems: PantryItem[] = items.map(i=>{
      const days = getShelfDays(i.item_name);
      return {
        id: uid(),
        name:    i.item_name,
        emoji:   i.emoji || getEmoji(i.item_name),
        cat:     i.category || 'Other',
        qty:     i.quantity ?? 1,
        unit:    i.unit ?? 'pcs',
        price:   0,
        expiry:  expiryDate(days),
        expDays: days,
        src:     '🎙️',
      };
    });
    setPantry(p=>{
      const updated = [...newItems, ...p];
      save({pantry:updated});
      return updated;
    });
    showToast(`✅ Added: ${newItems.map(i=>i.name).join(', ')}`);
  },[save]);

  // ── Voice recording ─────────────────────────────────────────────
  const startVoice = async () => {
    if(recording){ stopVoice(); return; }
    setRecording(true);
    setVoiceTranscript('');

    // Try browser SpeechRecognition first (Chrome/Android — free, instant)
    const w = window as unknown as Record<string, unknown>;
    const SR = (w['SpeechRecognition'] || w['webkitSpeechRecognition']) as (new () => {lang:string;interimResults:boolean;onresult:unknown;onerror:unknown;onend:unknown;start:()=>void}) | undefined;
    if(SR) {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = 'en-IN';
      rec.interimResults = false;
      rec.onresult = async (e: unknown) => {
        const ev = e as {results: {[0]: {[0]: {transcript: string}}}};
        const text = ev.results[0][0].transcript;
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

  const [pendingItems, setPendingItems] = useState<{item_name:string;quantity:number;unit:string;category:string;emoji:string;price?:number}[]>([]);
  const [parsing, setParsing] = useState(false);

  const sendToWhisper = async (blob: Blob) => {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voice.webm');
      fd.append('dietary', JSON.stringify({isVeg:profile.isVeg,eatsEggs:profile.eatsEggs,country:profile.country}));
      fd.append('lang', typeof navigator!=='undefined' ? (navigator.language||'en-IN') : 'en-IN');
      const res  = await fetch('/api/transcribe', {method:'POST',body:fd});
      const data = await res.json();
      if(data.transcript) setVoiceTranscript(data.transcript);
      if(data.items?.length) setPendingItems(data.items.map((i: {item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string;price?:number})=>({
        item_name:i.item_name, quantity:i.quantity??1, unit:i.unit??'pcs',
        category:i.category??'Other', emoji:i.emoji??getEmoji(i.item_name), price:i.price,
      })));
      else showToast('Could not parse that — try again');
    } catch { showToast('Voice processing failed'); }
    finally { setParsing(false); }
  };

  const parseText = async (text: string) => {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('dietary', JSON.stringify({isVeg:profile.isVeg,eatsEggs:profile.eatsEggs,country:profile.country}));
      fd.append('lang', typeof navigator!=='undefined' ? (navigator.language||'en-IN') : 'en-IN');
      const res  = await fetch('/api/transcribe', {method:'POST',body:fd});
      const data = await res.json();
      if(data.items?.length) setPendingItems(data.items.map((i: {item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string;price?:number})=>({
        item_name:i.item_name, quantity:i.quantity??1, unit:i.unit??'pcs',
        category:i.category??'Other', emoji:i.emoji??getEmoji(i.item_name), price:i.price,
      })));
      else showToast('Nothing recognised — try again');
    } catch { showToast('Parse error'); }
    finally { setParsing(false); }
  };

  const sendToScan = async (file: File) => {
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('dietary', JSON.stringify({isVeg:profile.isVeg,eatsEggs:profile.eatsEggs,country:profile.country}));
      const res  = await fetch('/api/scan', {method:'POST',body:fd});
      const data = await res.json();
      if (data.items?.length) {
        setPendingItems(data.items.map((i: {item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string;price?:number})=>({
          item_name:i.item_name, quantity:i.quantity??1, unit:i.unit??'pcs',
          category:i.category??'Other', emoji:i.emoji??getEmoji(i.item_name), price:i.price,
        })));
        if (data.store) showToast(`${data.items.length} items from ${data.store}`);
      } else {
        showToast('No items detected — try a clearer photo');
      }
    } catch { showToast('Scan failed — try again'); }
    finally { setParsing(false); }
  };

  const confirmPending = () => {
    if (!pendingItems.length) return;
    // addItems expects the API shape; our pending items already conform. Inject price where provided.
    setPantry(p => {
      const news: PantryItem[] = pendingItems.map(i => {
        const days = getShelfDays(i.item_name);
        return {
          id: uid(), name: i.item_name, emoji: i.emoji, cat: i.category,
          qty: i.quantity, unit: i.unit, price: i.price ?? 0,
          expiry: expiryDate(days), expDays: days, src: '🎙️',
        };
      });
      const updated = [...news, ...p];
      save({pantry:updated});
      return updated;
    });
    showToast(`✓ Added ${pendingItems.length} item${pendingItems.length>1?'s':''}`);
    setPendingItems([]);
    setShowAdd(false);
  };

  // ── Generate meals ──────────────────────────────────────────────
  const generateMeals = useCallback(async (p: string, force=false) => {
    if(meals[p] && !force) return;
    setLoadingMeals(true);
    try {
      const sevenDaysAgo = Date.now() - 7*86400000;
      const recentlyCooked = cookLog.filter(l=>new Date(l.date).getTime()>=sevenDaysAgo).map(l=>l.name);
      const res  = await fetch('/api/meals', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({pantry, period:p, dietary:profile, recentlyCooked, cuisines: profile.cuisines||[]}),
      });
      const data = await res.json();
      if(data.meals?.length) setMeals(m=>({...m,[p]:data.meals}));
    } catch { showToast('Could not generate meals'); }
    finally { setLoadingMeals(false); }
  },[pantry, cookLog, profile, meals]);

  useEffect(()=>{ if(tab==='meals') generateMeals(period); },[tab,period]);
  useEffect(()=>{ if(!showAdd){ setPendingItems([]); setVoiceTranscript(''); } },[showAdd]);

  // ── Pantry helpers ──────────────────────────────────────────────
  const markUsed=(id:string)=>{
    const item = pantry.find(i=>i.id===id);
    if(!item) return;
    setConfetti(true); setTimeout(()=>setConfetti(false),2200);
    const updated  = pantry.filter(i=>i.id!==id);
    const newUsed  = [{id:uid(),name:item.name,price:item.price||0,date:new Date().toISOString()}, ...usedLog];
    setPantry(updated); setUsedLog(newUsed);
    save({pantry:updated, usedLog:newUsed});
  };
  const markWasted=(id:string)=>{
    const item = pantry.find(i=>i.id===id);
    if(!item) return;
    const updated  = pantry.filter(i=>i.id!==id);
    const newWaste = [{id:uid(),name:item.name,price:item.price||0,date:new Date().toISOString()}, ...wasteLog];
    setPantry(updated); setWasteLog(newWaste);
    save({pantry:updated, wasteLog:newWaste});
  };
  const applyExpiryEdit=()=>{
    if(!editExpiry) return;
    const d = parseInt(newExpiryDays);
    if(isNaN(d)) return;
    const updated = pantry.map(i=>i.id===editExpiry.id?{...i,expiry:expiryDate(d),expDays:d}:i);
    setPantry(updated); save({pantry:updated}); setEditExpiry(null);
  };

  // ── Done cooking ────────────────────────────────────────────────
  const doneCooking=()=>{
    if(!cooking) return;
    const log: CookLog = {id:uid(),name:cooking.name,period,date:new Date().toISOString()};
    const newLog = [log,...cookLog];
    setCookLog(newLog); save({cookLog:newLog});
    // deduct used ingredients
    const updated = [...pantry];
    cooking.ingredients_used?.forEach(({name})=>{
      const idx = updated.findIndex(i=>i.name.toLowerCase()===name.toLowerCase());
      if(idx>=0) updated.splice(idx,1);
    });
    setPantry(updated); save({pantry:updated});
    setMeals({}); // invalidate cached meal suggestions so the cooked meal drops off the list
    setCooking(null);
    setConfetti(true); setTimeout(()=>setConfetti(false),2200);
    showToast(`🎉 ${cooking.name} cooked! Hidden for 7 days.`);
    setTab('fridge');
  };

  // ── Computed pantry groups ──────────────────────────────────────
  const sortedPantry = [...pantry].sort((a,b)=>a.expDays-b.expDays);
  const urgent   = sortedPantry.filter(i=>daysLeft(i.expiry)<=1);
  const expiring = sortedPantry.filter(i=>{const d=daysLeft(i.expiry);return d>1&&d<=3;});
  const fresh    = sortedPantry.filter(i=>daysLeft(i.expiry)>3);
  const searched = search ? sortedPantry.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())) : null;

  // ── Nav helpers ─────────────────────────────────────────────────
  const navItems = [
    {id:'fridge',  icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="5" y="3" width="14" height="18" rx="2.5"/><line x1="5" y1="11" x2="19" y2="11"/><line x1="8" y1="7" x2="8" y2="9"/><line x1="8" y1="14" x2="8" y2="17"/></svg>,label:'Fridge'},
    {id:'meals',   icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>,label:'Meals'},
    {id:'shop',    icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,label:'Shop'},
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
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 28px',background:'linear-gradient(180deg,var(--cream) 0%,var(--surf) 100%)'}}>
            {/* Cute doodle fridge — drops in on mount */}
            <div style={{animation:'drop-bounce 1.1s cubic-bezier(.34,1.2,.64,1) both',marginBottom:18,transformOrigin:'50% 100%'}}>
              <svg width="64" height="78" viewBox="0 0 64 78" fill="none" style={{display:'block'}}>
                {/* body — wavy sketch outline */}
                <path d="M 10 6 Q 10 4 12 4 L 52 4 Q 54 4 54 6 L 54 72 Q 54 74 52 74 L 12 74 Q 10 74 10 72 Z"
                      stroke="#1F1A14" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" fill="#FFFBF5"/>
                {/* door divider with slight squiggle */}
                <path d="M 10 30 Q 20 31 32 30 Q 44 29 54 30" stroke="#1F1A14" strokeWidth="2" strokeLinecap="round" fill="none"/>
                {/* handles */}
                <path d="M 15 14 L 15 22" stroke="#1F1A14" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M 15 40 L 15 52" stroke="#1F1A14" strokeWidth="2.2" strokeLinecap="round"/>
                {/* little sparkle */}
                <path d="M 44 12 L 46 14 L 48 12 L 46 10 Z" fill="#C94A3A"/>
                <circle cx="42" cy="20" r="1.2" fill="#4A6B3A"/>
              </svg>
            </div>

            {/* Logo — bigger, display font */}
            <h1 style={{
              fontFamily:'"Fraunces","DM Serif Display",Georgia,serif',
              fontSize:64, fontWeight:700, fontStyle:'italic',
              color:'var(--ink)', letterSpacing:-2, lineHeight:.95,
              margin:0, textAlign:'center',
              animation:'fadeInDelay 1.2s ease-out both',
            }}>
              FreshNudge
            </h1>

            {/* Smaller subtitle */}
            <p style={{
              fontFamily:'var(--serif)', fontSize:17, color:'var(--inkM)',
              letterSpacing:-.2, marginTop:10, marginBottom:18, textAlign:'center',
              animation:'fadeInDelay 1.3s ease-out both',
            }}>Your smart kitchen agent.</p>

            <p style={{fontSize:13,color:'var(--gray)',textAlign:'center',lineHeight:1.55,marginBottom:32,maxWidth:300,animation:'fadeInDelay 1.4s ease-out both'}}>
              Waste less. Eat better. We track what&apos;s in your fridge, nudge you before things expire, and suggest meals using what you have.
            </p>

            <button className="btn-primary" onClick={()=>setObStep(1)} style={{background:'var(--navy)',fontSize:15,padding:16,animation:'fadeInDelay 1.5s ease-out both'}}>Get started →</button>
            <p style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)',marginTop:18,textAlign:'center'}}>60 SECONDS · NO SIGNUP</p>
          </div>
        )}

        {step==='name'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>What should we call you?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:28}}>Your kitchen agent likes to be personal.</p>
            <input type="text" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))}
              placeholder="Your first name" style={{width:'100%',marginBottom:4,border:'2px solid var(--navy)',fontWeight:700,fontSize:16}}/>
          </div>
        )}

        {step==='household'&&(
          <div style={{flex:1,padding:'28px 22px',overflowY:'auto'}}>
            <h2 style={{fontSize:28,fontWeight:500,color:'var(--ink)',letterSpacing:-.5,marginBottom:6,fontFamily:'var(--serif)'}}>Your Household</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:22}}>Tell us about your home — we&apos;ll tailor portions, spices and serving style.</p>
            <p style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)',marginBottom:10}}>FAMILY SIZE</p>
            <div style={{display:'flex',gap:8,marginBottom:22}}>
              {[1,2,3,4,'5+'].map(n=>{
                const val = typeof n==='number'?n:5;
                const active = profile.familySize===val;
                return (
                  <div key={n} onClick={()=>setProfile(p=>({...p,familySize:val}))}
                    style={{flex:1,background:active?'var(--ink)':'var(--white)',border:`1.5px solid ${active?'var(--ink)':'var(--border)'}`,borderRadius:14,padding:'14px 0',textAlign:'center',fontFamily:'var(--serif)',fontSize:22,fontWeight:500,color:active?'var(--cream)':'var(--ink)',cursor:'pointer'}}>
                    {n}
                  </div>
                );
              })}
            </div>
            <p style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)',marginBottom:10}}>KIDS AT HOME?</p>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {[[false,'No kids','Skip kid-safe filter'],[true,'Yes, a little one','Enable safety filter']].map(([val,lb,sub])=>{
                const active = profile.hasToddler===val;
                return (
                  <div key={lb as string} onClick={()=>setProfile(p=>({...p,hasToddler:val as boolean}))}
                    style={{flex:1,background:active?'var(--ink)':'var(--white)',border:`1.5px solid ${active?'var(--ink)':'var(--border)'}`,borderRadius:14,padding:'14px 16px',cursor:'pointer'}}>
                    <div style={{fontSize:14,fontWeight:700,color:active?'var(--cream)':'var(--ink)'}}>{lb}</div>
                    <div style={{fontSize:11,color:active?'var(--cream)':'var(--gray)',opacity:active?.8:1,marginTop:2}}>{sub}</div>
                  </div>
                );
              })}
            </div>
            {profile.hasToddler&&(
              <div style={{background:'var(--white)',border:`1px solid var(--border)`,borderRadius:14,padding:14,marginBottom:18}}>
                <div style={{fontSize:12,color:'var(--gray)',marginBottom:8}}>Auto-filtered from all suggestions:</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
                  {['Spicy','Whole nuts','Raw honey','Choking hazards','Excess salt'].map(f=>(
                    <span key={f} style={{fontSize:11,padding:'5px 10px',borderRadius:999,background:'var(--cream)',color:'var(--ink)',fontWeight:500}}>✕ {f}</span>
                  ))}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <input type="text" placeholder="Little one's name (e.g. Avya)" value={profile.toddlerName} onChange={e=>setProfile(p=>({...p,toddlerName:e.target.value}))} style={{flex:2}}/>
                  <input type="number" placeholder="Age" value={profile.toddlerAge||''} onChange={e=>setProfile(p=>({...p,toddlerAge:parseInt(e.target.value)||2}))} style={{flex:1,textAlign:'center'}}/>
                </div>
              </div>
            )}

            <p style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)',marginTop:18,marginBottom:10}}>DIET</p>
            <div style={{display:'grid',gap:8,marginBottom:10}}>
              {[
                {id:'veg'   as DietMode, t:'Vegetarian',  s:'No meat or seafood'},
                {id:'vegan' as DietMode, t:'Vegan',       s:'Plant-based only'},
                {id:'all'   as DietMode, t:'Everything',  s:'No restrictions'},
                {id:'halal' as DietMode, t:'Halal',       s:'No pork'},
              ].map(o=>{
                const active = (profile.dietMode||'veg')===o.id;
                return (
                  <div key={o.id} onClick={()=>setProfile(p=>({
                    ...p,
                    dietMode: o.id,
                    isVeg: o.id==='veg'||o.id==='vegan',
                    eatsEggs: o.id==='veg' ? p.eatsEggs : (o.id==='vegan' ? false : p.eatsEggs),
                  }))}
                    style={{background:active?'var(--ink)':'var(--white)',border:`1.5px solid ${active?'var(--ink)':'var(--border)'}`,borderRadius:14,padding:'12px 14px',cursor:'pointer'}}>
                    <div style={{fontSize:14,fontWeight:700,color:active?'var(--cream)':'var(--ink)'}}>{o.t}</div>
                    <div style={{fontSize:12,color:active?'var(--cream)':'var(--gray)',opacity:active?.75:1,marginTop:2}}>{o.s}</div>
                  </div>
                );
              })}
            </div>
            {(profile.dietMode||'veg')==='veg'&&(
              <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:14,padding:14,marginTop:6}}>
                <p style={{fontSize:12,color:'var(--gray)',marginBottom:10}}>Do you eat eggs?</p>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setProfile(p=>({...p,eatsEggs:true}))} style={{flex:1,background:profile.eatsEggs?'var(--ink)':'var(--cream)',color:profile.eatsEggs?'var(--cream)':'var(--ink)',border:`1px solid ${profile.eatsEggs?'var(--ink)':'var(--border)'}`,borderRadius:11,padding:11,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>Yes 🥚</button>
                  <button onClick={()=>setProfile(p=>({...p,eatsEggs:false}))} style={{flex:1,background:!profile.eatsEggs?'var(--ink)':'var(--cream)',color:!profile.eatsEggs?'var(--cream)':'var(--ink)',border:`1px solid ${!profile.eatsEggs?'var(--ink)':'var(--border)'}`,borderRadius:11,padding:11,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>No eggs</button>
                </div>
              </div>
            )}
          </div>
        )}

        {step==='sources'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:28,fontWeight:500,color:'var(--ink)',letterSpacing:-.5,marginBottom:6,fontFamily:'var(--serif)'}}>How do you want to add groceries?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:22}}>Pick what works for you — you can always change later.</p>
            {[
              {id:'photo' as const, icon:'📸', lb:'Photo my fridge',  sub:'Snap one photo of your open fridge — AI finds everything'},
              {id:'voice' as const, icon:'🎙️', lb:'Voice',            sub:'Say "2 mangoes, 400g curd, 1L milk" — done'},
            ].map(o=>{
              const active = addMethodChoice===o.id;
              return (
                <div key={o.id} onClick={()=>setAddMethodChoice(o.id)}
                  style={{background:active?'#FAF2EE':'var(--white)',border:`1.5px solid ${active?'var(--navy)':'var(--border)'}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:14,marginBottom:10,cursor:'pointer'}}>
                  <div style={{width:44,height:44,borderRadius:12,background:'var(--cream)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>{o.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>{o.lb}</div>
                    <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>{o.sub}</div>
                  </div>
                  {active&&<div style={{width:22,height:22,borderRadius:11,background:'var(--navy)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,flexShrink:0}}>✓</div>}
                </div>
              );
            })}
            <div style={{background:'var(--white)',border:'1.5px dashed var(--border)',borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'flex-start',gap:14,marginBottom:10}}>
              <div style={{width:44,height:44,borderRadius:12,background:'var(--cream)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>🛒</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'inline-block',fontSize:10,fontWeight:700,color:'var(--navy)',background:'#FAF2EE',padding:'2px 8px',borderRadius:999,marginBottom:4,letterSpacing:.4}}>Coming soon</div>
                <div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>Order → Fridge sync</div>
                <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>Auto-sync from your grocery orders</div>
                <div style={{fontSize:12,color:'var(--ink)',marginTop:8}}>Would you want auto-sync for Swiggy Instamart + Blinkit?</div>
                <button onClick={()=>setOrderSyncInterest(v=>!v)} style={{marginTop:8,background:orderSyncInterest?'var(--navy)':'transparent',color:orderSyncInterest?'#fff':'var(--navy)',border:`1.5px solid var(--navy)`,borderRadius:999,padding:'6px 14px',fontSize:12,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>
                  {orderSyncInterest?'✓ You\u2019re on the list':'Yes, count me in'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step==='cuisines'&&(
          <div style={{flex:1,padding:'28px 22px',overflowY:'auto'}}>
            <h2 style={{fontSize:28,fontWeight:500,color:'var(--ink)',letterSpacing:-.5,marginBottom:6,fontFamily:'var(--serif)'}}>What do you usually eat?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:22,lineHeight:1.5}}>Pick all that apply — your meal suggestions will match your actual cooking style. Even 1 is enough.</p>
            <div style={{display:'grid',gap:10}}>
              {CUISINES.map(c=>{
                const selected = (profile.cuisines??[]).includes(c.id);
                return (
                  <div key={c.id} onClick={()=>setProfile(p=>({
                    ...p,
                    cuisines: selected ? (p.cuisines||[]).filter(x=>x!==c.id) : [...(p.cuisines||[]), c.id]
                  }))}
                    style={{background:selected?'var(--ink)':'var(--white)',border:`1.5px solid ${selected?'var(--ink)':'var(--border)'}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'flex-start',gap:14,cursor:'pointer'}}>
                    <span style={{fontSize:28,flexShrink:0,lineHeight:1}}>{c.emoji}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:selected?'var(--cream)':'var(--ink)'}}>{c.name}</div>
                      <div style={{fontSize:12,color:selected?'var(--cream)':'var(--gray)',opacity:selected?.75:1,marginTop:3,lineHeight:1.5}}>{c.examples}</div>
                    </div>
                    {selected&&<div style={{width:22,height:22,borderRadius:11,background:'var(--navy)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,flexShrink:0}}>✓</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step==='notifications'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:28,fontWeight:500,color:'var(--ink)',letterSpacing:-.5,marginBottom:6,fontFamily:'var(--serif)'}}>When should we nudge you?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:22,lineHeight:1.5}}>We&apos;ll remind you before things expire and suggest what to eat. Change anytime in settings.</p>
            {[['☀️','Breakfast','breakfast'],['🌤️','Lunch','lunch'],['🍎','Snack','snack'],['🌙','Dinner','dinner']].map(([ic,lb,key])=>(
              <div key={key as string} style={{background:'var(--grayL)',border:'1px solid var(--border)',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:12,marginBottom:9}}>
                <div style={{width:38,height:38,borderRadius:10,background:'var(--white)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{ic}</div>
                <div style={{flex:1,fontSize:14,fontWeight:700,color:'var(--ink)'}}>{lb}</div>
                <input type="time" value={profile.notifTimes[key as string]} onChange={e=>setProfile(p=>({...p,notifTimes:{...p.notifTimes,[key as string]:e.target.value}}))} style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:10,padding:'7px 10px',fontSize:13,fontWeight:700,color:'var(--navy)',fontFamily:'inherit',cursor:'pointer'}}/>
              </div>
            ))}
          </div>
        )}

        {step==='done'&&(
          <div style={{flex:1,padding:'40px 28px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
            <div style={{textAlign:'center',flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
              {/* Yipee doodle — bouncing party face */}
              <div style={{animation:'drop-bounce 1s cubic-bezier(.34,1.2,.64,1) both',marginBottom:18}}>
                <svg width="96" height="96" viewBox="0 0 96 96" fill="none" style={{display:'block'}}>
                  {/* face */}
                  <circle cx="48" cy="50" r="34" fill="#FFE9A8" stroke="#1F1A14" strokeWidth="2.4"/>
                  {/* confetti sparks */}
                  <path d="M 12 18 L 18 24" stroke="#C94A3A" strokeWidth="2.4" strokeLinecap="round"/>
                  <path d="M 82 18 L 76 24" stroke="#4A6B3A" strokeWidth="2.4" strokeLinecap="round"/>
                  <path d="M 8 46 L 14 46" stroke="#C68A2E" strokeWidth="2.4" strokeLinecap="round"/>
                  <path d="M 82 46 L 88 46" stroke="#7C6D99" strokeWidth="2.4" strokeLinecap="round"/>
                  <path d="M 20 10 L 22 6"  stroke="#C94A3A" strokeWidth="2.4" strokeLinecap="round"/>
                  <path d="M 74 10 L 72 6"  stroke="#4A6B3A" strokeWidth="2.4" strokeLinecap="round"/>
                  <circle cx="30" cy="14" r="1.8" fill="#C68A2E"/>
                  <circle cx="66" cy="14" r="1.8" fill="#7C6D99"/>
                  {/* eyes */}
                  <path d="M 36 46 Q 38 40 42 46" stroke="#1F1A14" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
                  <path d="M 54 46 Q 56 40 60 46" stroke="#1F1A14" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
                  {/* open mouth — yipee */}
                  <path d="M 36 58 Q 48 74 60 58 Q 48 66 36 58 Z" fill="#C94A3A" stroke="#1F1A14" strokeWidth="2.2" strokeLinejoin="round"/>
                  {/* cheek dots */}
                  <circle cx="28" cy="58" r="2.5" fill="#F4A7B5"/>
                  <circle cx="68" cy="58" r="2.5" fill="#F4A7B5"/>
                </svg>
              </div>
              <h2 style={{fontFamily:'var(--serif)',fontSize:36,fontWeight:500,color:'var(--ink)',letterSpacing:-.5,lineHeight:1.1}}>Welcome{profile.name?`, ${profile.name}`:''}<br/>— you are all set.</h2>
              <p style={{fontSize:14,color:'var(--gray)',marginTop:14,lineHeight:1.5,maxWidth:320}}>We&apos;ve seeded your fridge with a typical weeknight stash so you can see FreshNudge in action. Swap it out as you shop.</p>
            </div>
            <button className="btn-primary" onClick={completeOnboarding} style={{fontSize:15,padding:16,marginTop:24}}>Open my fridge →</button>
          </div>
        )}

        {obStep<OB_STEPS.length-1&&step!=='welcome'&&(
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
  const [fridgeFilter, setFridgeFilter] = useState('all');
  const [openItem, setOpenItem] = useState<PantryItem|null>(null);

  const renderFridge = () => {
    const hour = new Date().getHours();
    const greet = hour<12?'MORNING':hour<17?'AFTERNOON':'EVENING';
    const value = pantry.reduce((s,i)=>s+(i.price||0),0);
    const ccy = CURRENCY[profile.country].symbol;
    const urgentItems = urgent;
    const soonItems   = expiring;

    // Distinct cat chips that actually exist in the pantry
    const cats = Array.from(new Set(pantry.map(i=>i.cat)));

    // Apply filter
    let filtered = [...pantry].sort((a,b)=>a.expDays-b.expDays);
    if (search) filtered = filtered.filter(i=>i.name.toLowerCase().includes(search.toLowerCase()));
    else if (fridgeFilter==='urgent') filtered = filtered.filter(i=>daysLeft(i.expiry)<=4);
    else if (fridgeFilter!=='all')    filtered = filtered.filter(i=>i.cat===fridgeFilter);

    const bucketed = (bucket:'urgent'|'soon'|'fresh') => filtered.filter(i=>{
      const d = daysLeft(i.expiry);
      if (bucket==='urgent') return d<=1;
      if (bucket==='soon')   return d>1 && d<=4;
      return d>4;
    });

    return (
      <div className="screen" style={{background:'var(--cream)'}}>
        {/* Hero */}
        <div style={{padding:'18px 20px 16px',background:'var(--surf)',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
            <div>
              <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)'}}>{greet}, {(profile.name||'FRIEND').toUpperCase()}</div>
              <h1 style={{fontFamily:'var(--serif)',fontSize:30,color:'var(--ink)',margin:'4px 0 0',letterSpacing:-.5,fontWeight:500,lineHeight:1.1}}>Your fridge</h1>
            </div>
            <button onClick={()=>setShowAdd(true)} style={{background:'var(--navy)',color:'#fff',border:'none',borderRadius:999,padding:'10px 16px',fontWeight:700,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontFamily:'inherit'}}>
              <svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Add
            </button>
          </div>
          <div style={{display:'flex',gap:8,marginTop:16}}>
            <FridgeStat label="ITEMS"    value={pantry.length}/>
            <FridgeStat label="URGENT"   value={urgentItems.length} tone="urgent"/>
            <FridgeStat label="USE SOON" value={soonItems.length}   tone="soon"/>
            <FridgeStat label="VALUE"    value={`${ccy}${value}`}/>
          </div>
        </div>

        {/* Rescue tonight */}
        {urgentItems.length>0&&(
          <div style={{padding:'16px 16px 0'}}>
            <div style={{background:'linear-gradient(135deg,#C94A3A 0%,#A8382A 100%)',borderRadius:14,padding:16,color:'#fff',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',right:-20,top:-20,width:120,height:120,borderRadius:120,background:'rgba(255,255,255,0.08)'}}/>
              <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.5,opacity:.85}}>RESCUE TODAY</div>
              <div style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:500,marginTop:4,letterSpacing:-.3}}>{urgentItems.length} item{urgentItems.length>1?'s':''} want{urgentItems.length===1?'s':''} cooking today</div>
              <div style={{fontSize:12,opacity:.92,marginTop:4}}>{urgentItems.slice(0,3).map(i=>i.name).join(' · ')}</div>
              <button onClick={()=>setTab('meals')} style={{marginTop:12,background:'#fff',color:'#C94A3A',border:'none',borderRadius:999,padding:'8px 14px',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>See today&apos;s recipe →</button>
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{padding:'16px 16px 10px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--surf)',border:'1px solid var(--border)',borderRadius:999}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="var(--gray)" strokeWidth="1.8"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="var(--gray)" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search fridge…" style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:13.5,color:'var(--ink)'}}/>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{padding:'2px 16px 14px',display:'flex',gap:6,overflow:'auto',scrollbarWidth:'none'}}>
          <button onClick={()=>setFridgeFilter('all')} style={chipStyle(fridgeFilter==='all','dark')}>All {pantry.length}</button>
          {urgentItems.length+soonItems.length>0&&<button onClick={()=>setFridgeFilter('urgent')} style={chipStyle(fridgeFilter==='urgent','urgent')}>● Use soon</button>}
          {cats.map(c=>(
            <button key={c} onClick={()=>setFridgeFilter(c)} style={chipStyle(fridgeFilter===c,'neutral')}>{c}</button>
          ))}
        </div>

        {/* Items */}
        <div style={{padding:'0 16px 32px'}}>
          {pantry.length===0?(
            <div style={{textAlign:'center',paddingTop:60}}>
              <div style={{fontSize:44}}>🛒</div>
              <p style={{fontFamily:'var(--serif)',fontWeight:500,fontSize:22,color:'var(--ink)',marginTop:14}}>Fridge is clear</p>
              <p style={{fontSize:13,color:'var(--gray)',marginTop:6}}>Tap Add to log your groceries.</p>
            </div>
          ):fridgeFilter==='all'&&!search?(
            <>
              {(['urgent','soon','fresh'] as const).map(b=>{
                const items = bucketed(b);
                if(!items.length) return null;
                const label = b==='urgent'?'Cook today':b==='soon'?'Use in a few days':'Still fresh';
                const dot   = b==='urgent'?'#C94A3A':b==='soon'?'#C68A2E':'#4A6B3A';
                return (
                  <div key={b} style={{marginTop:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                      <span style={{width:8,height:8,borderRadius:8,background:dot,display:'inline-block'}}/>
                      <span style={{fontFamily:'var(--mono)',fontSize:10.5,letterSpacing:1.2,color:'var(--gray)',textTransform:'uppercase'}}>{label} · {items.length}</span>
                    </div>
                    <div style={{display:'grid',gap:8}}>
                      {items.map(i=><FridgeItem key={i.id} item={i} onClick={()=>setOpenItem(i)} currencySymbol={ccy}/>)}
                    </div>
                  </div>
                );
              })}
            </>
          ):(
            <div style={{display:'grid',gap:8,marginTop:14}}>
              {filtered.map(i=><FridgeItem key={i.id} item={i} onClick={()=>setOpenItem(i)} currencySymbol={ccy}/>)}
              {filtered.length===0&&<div style={{textAlign:'center',padding:36,color:'var(--gray)',fontSize:13}}>Nothing here.</div>}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Small stat card + chip helpers
  function FridgeStat({label,value,tone='neutral'}:{label:string;value:string|number;tone?:'neutral'|'urgent'|'soon'}) {
    const color = tone==='urgent'?'#C94A3A':tone==='soon'?'#C68A2E':'var(--ink)';
    return (
      <div style={{flex:1,padding:'10px',borderRadius:14,background:'var(--cream)',border:'1px solid var(--border)'}}>
        <div style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:.8,color:'var(--gray)'}}>{label}</div>
        <div style={{fontFamily:'var(--serif)',fontSize:20,fontWeight:500,color,marginTop:2,letterSpacing:-.3,lineHeight:1}}>{value}</div>
      </div>
    );
  }
  function chipStyle(active:boolean, tone:'dark'|'urgent'|'neutral') {
    const palettes = {
      dark:    {bg:'var(--ink)', fg:'#fff',       bd:'var(--ink)'},
      urgent:  {bg:'#FCE8E5',    fg:'#C94A3A',    bd:'#F4C8C1'},
      neutral: {bg:'var(--surf)',fg:'var(--ink)', bd:'var(--border)'},
    };
    const p = palettes[tone];
    return {
      display:'inline-flex',alignItems:'center',gap:5,
      background: active ? p.fg : p.bg,
      color:      active ? p.bg : p.fg,
      border:`1px solid ${p.bd}`, borderRadius:999,
      padding:'6px 12px', fontSize:11.5, fontWeight:600,
      fontFamily:'inherit', cursor:'pointer',
      whiteSpace:'nowrap', lineHeight:1,
    };
  }

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
          ):(currentMeals||[]).map(m=>(
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
            <button onClick={()=>setShowPremium(true)} style={{width:'100%',background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #C68A2E',borderRadius:16,padding:14,display:'flex',alignItems:'center',gap:12,cursor:'pointer',marginTop:4}}>
              <div style={{width:40,height:40,borderRadius:20,background:'#C68A2E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:18}}>👑</div>
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
            <div style={{color:'#E8C5A0',fontSize:12,marginTop:2}}>⏱ {cooking.time_minutes} min · 🔥 {cooking.calories} kcal</div>
          </div>
          <span style={{fontSize:30}}>{cooking.emoji}</span>
        </div>
        {/* Cook body */}
        <div className="screen" style={{padding:16}}>
          {cooking.kid_safe&&<div style={{background:'#DCFCE7',border:'1px solid #86A87A',borderRadius:12,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:18}}>👶</span>
            <div style={{fontWeight:700,fontSize:13,color:'#14532D'}}>Safe for {profile.toddlerName||'little ones'} — mild, no choking hazards</div>
          </div>}
          {cooking.uses_expiring&&<div style={{background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:12,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <span>⚠️</span>
            <div style={{fontSize:13,color:'#92400E',fontWeight:600}}>Uses items expiring today — great choice!</div>
          </div>}
          {/* Macros */}
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            {[['🔥',cooking.calories,'kcal','var(--red)'],['💪',cooking.protein,'g P','var(--navy)'],['⏱',cooking.time_minutes,'min','#4A6B3A']].map(([ic,v,u,c])=>(
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
          {/* Recipe — all steps in one view */}
          <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)',marginBottom:8}}>RECIPE</div>
          <div style={{background:'var(--cream)',borderRadius:14,padding:16,marginBottom:16}}>
            <ol style={{margin:0,paddingLeft:20,fontFamily:'var(--serif)',fontSize:15,color:'var(--ink)',lineHeight:1.55,letterSpacing:-.1}}>
              {steps.map((s,i)=>(
                <li key={i} style={{marginBottom:i<steps.length-1?10:0}}>{s}</li>
              ))}
            </ol>
          </div>
          <button onClick={doneCooking} style={{width:'100%',background:'#4A6B3A',color:'#fff',border:'none',borderRadius:14,padding:'14px',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>
            ✓ I cooked this — update my fridge
          </button>
          <div style={{marginTop:8,fontSize:11.5,color:'var(--gray)',textAlign:'center'}}>Ingredients will be marked as used. Hidden from suggestions for 7 days.</div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // SHOP SCREEN
  // ════════════════════════════════════════════════
  const [newShopItem, setNewShopItem] = useState('');
  const [addMethodChoice, setAddMethodChoice] = useState<'photo'|'voice'|'ordersync'>('voice');
  const [orderSyncInterest, setOrderSyncInterest] = useState(false);
  const toggleShop = (id:string) => {
    const updated = shopList.map(i => i.id===id ? {...i, checked:!i.checked} : i);
    setShopList(updated); save({shopList:updated});
  };
  const removeShop = (id:string) => {
    const updated = shopList.filter(i => i.id!==id);
    setShopList(updated); save({shopList:updated});
  };
  const addShop = (name:string) => {
    const n = name.trim();
    if (!n) return;
    if (shopList.some(i => i.name.toLowerCase() === n.toLowerCase())) return;
    const updated = [...shopList, {id:uid(), name:n, checked:false}];
    setShopList(updated); save({shopList:updated});
    setNewShopItem('');
  };
  const openSearch = (store: {url:(q:string)=>string}, items: string[]) => {
    // Open one tab per item (deep-link). If list is empty, just open the storefront.
    if (!items.length) { window.open(store.url(''), '_blank'); return; }
    items.forEach(q => window.open(store.url(q), '_blank'));
  };

  const renderShop = () => {
    const stores = STORES[profile.country];
    const country = COUNTRIES.find(c => c.id === profile.country)!;
    const suggestedNames = new Set(shopList.map(s => s.name.toLowerCase()));
    // Smart suggestions: items expiring soon (running low) + pick a featured one for the headline
    const suggestions = pantry
      .filter(i => daysLeft(i.expiry) <= 3 && !suggestedNames.has(i.name.toLowerCase()))
      .slice(0, 6);
    const featured = suggestions[0];
    const toBuy = shopList.filter(i => !i.checked);
    const done  = shopList.filter(i =>  i.checked);
    const searchQueries = toBuy.map(i => i.name);
    const ccy = CURRENCY[profile.country].symbol;
    const estTotal = toBuy.length * 50; // rough placeholder

    return (
      <div className="screen" style={{background:'var(--cream)'}}>
        {/* Hero */}
        <div style={{padding:'18px 20px 16px',background:'var(--surf)',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)'}}>SHOPPING · THIS WEEK</div>
          <h1 style={{fontFamily:'var(--serif)',fontSize:30,color:'var(--ink)',margin:'4px 0 0',letterSpacing:-.5,fontWeight:500,lineHeight:1.1}}>Restock list</h1>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <FridgeStat label="TO BUY"     value={toBuy.length}/>
            <FridgeStat label="CHECKED"    value={done.length}/>
            <FridgeStat label="EST. TOTAL" value={`~${ccy}${estTotal}`}/>
          </div>
          {/* Region switcher */}
          <div style={{display:'flex',gap:6,marginTop:12,alignItems:'center'}}>
            <span style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:1,color:'var(--gray)'}}>REGION</span>
            {COUNTRIES.map(c=>(
              <button key={c.id} onClick={()=>{const np={...profile,country:c.id,city:c.cities[0]};setProfile(np);save({profile:np});}}
                style={{background:profile.country===c.id?'var(--ink)':'var(--white)',color:profile.country===c.id?'var(--cream)':'var(--ink)',border:`1px solid ${profile.country===c.id?'var(--ink)':'var(--border)'}`,borderRadius:999,padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
                <span>{c.flag}</span>{c.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{padding:'14px 16px 24px'}}>
          {/* Smart suggestions */}
          <div style={{background:'var(--white)',border:'1px dashed var(--border)',borderRadius:14,padding:14,marginBottom:14}}>
            <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--navy)'}}>✨ SMART SUGGESTIONS</div>
            <div style={{fontSize:13,color:'var(--ink)',marginTop:6,fontWeight:600}}>
              {featured
                ? `${featured.name} is running low — expires ${fmtDays(daysLeft(featured.expiry)).toLowerCase()}.`
                : 'Everything looks stocked. Add items you need below.'}
            </div>
            {suggestions.length>0&&(
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}>
                {suggestions.map(s=>(
                  <button key={s.id} onClick={()=>addShop(s.name)} style={{background:'var(--ink)',color:'var(--surf)',border:'none',borderRadius:999,padding:'6px 12px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ {s.name}</button>
                ))}
              </div>
            )}
          </div>

          {/* Add */}
          <div style={{display:'flex',gap:8,marginBottom:14}}>
            <input type="text" value={newShopItem} onChange={e=>setNewShopItem(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')addShop(newShopItem);}}
              placeholder="Add item…" style={{flex:1,background:'var(--surf)',border:'1px solid var(--border)',borderRadius:999,padding:'11px 16px',fontSize:13}}/>
            <button onClick={()=>addShop(newShopItem)} style={{background:'var(--navy)',color:'#fff',border:'none',borderRadius:999,padding:'0 20px',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Add</button>
          </div>

          {/* To-buy list */}
          {toBuy.length>0 && <>
            <p style={{fontWeight:800,fontSize:11,color:'var(--gray)',letterSpacing:.6,marginBottom:8}}>TO BUY · {toBuy.length}</p>
            <div style={{display:'grid',gap:6,marginBottom:12}}>
              {toBuy.map(i=>(
                <div key={i.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--white)',border:'1px solid var(--border)',borderRadius:12,padding:'10px 14px'}}>
                  <button onClick={()=>toggleShop(i.id)} style={{width:22,height:22,borderRadius:6,border:`1.5px solid ${i.checked?'var(--sage)':'var(--border)'}`,background:i.checked?'var(--sage)':'transparent',cursor:'pointer',flexShrink:0,padding:0}}/>
                  <div style={{flex:1,fontSize:14,fontWeight:700,color:'var(--ink)'}}>{i.name}</div>
                  <button onClick={()=>removeShop(i.id)} style={{background:'none',border:'none',color:'var(--gray)',cursor:'pointer',fontSize:18,padding:0,lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          </>}

          {/* Done list */}
          {done.length>0 && <>
            <p style={{fontWeight:800,fontSize:11,color:'var(--gray)',letterSpacing:.6,marginTop:16,marginBottom:8}}>DONE · {done.length}</p>
            <div style={{display:'grid',gap:6,marginBottom:12}}>
              {done.map(i=>(
                <div key={i.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--grayL)',border:'1px solid var(--border)',borderRadius:12,padding:'10px 14px',opacity:.6}}>
                  <button onClick={()=>toggleShop(i.id)} style={{width:22,height:22,borderRadius:6,border:'1.5px solid var(--sage)',background:'var(--sage)',cursor:'pointer',flexShrink:0,padding:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:900}}>✓</button>
                  <div style={{flex:1,fontSize:14,fontWeight:600,color:'var(--ink)',textDecoration:'line-through'}}>{i.name}</div>
                  <button onClick={()=>removeShop(i.id)} style={{background:'none',border:'none',color:'var(--gray)',cursor:'pointer',fontSize:18,padding:0,lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          </>}

          {/* Empty state */}
          {shopList.length===0 && suggestions.length===0 && (
            <div style={{textAlign:'center',padding:'40px 20px'}}>
              <div style={{fontSize:48}}>🛒</div>
              <p style={{fontWeight:800,fontSize:18,color:'var(--inkM)',marginTop:14}}>Nothing to buy yet</p>
              <p style={{fontSize:13,color:'var(--gray)',marginTop:6}}>Add items or wait — we&apos;ll suggest based on what&apos;s expiring.</p>
            </div>
          )}

          {/* Store deep-links */}
          <div style={{marginTop:18}}>
            <p style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)',marginBottom:10}}>ORDER FROM {country.label.toUpperCase()}</p>
            <p style={{fontSize:11,color:'var(--gray)',marginBottom:10,lineHeight:1.5}}>
              {toBuy.length>0
                ? `Opens ${toBuy.length} search tab${toBuy.length===1?'':'s'} — one per item.`
                : 'Add items above, then tap a store to open search tabs.'}
            </p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {stores.map(s=>(
                <button key={s.name} onClick={()=>openSearch(s, searchQueries)}
                  style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                  <span style={{fontSize:20}}>{s.emoji}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:800,color:'var(--ink)'}}>{s.name}</div>
                    <div style={{fontSize:10,color:'var(--gray)'}}>Open in new tab →</div>
                  </div>
                </button>
              ))}
            </div>
            <p style={{fontSize:10,color:'var(--gray)',marginTop:10,textAlign:'center',lineHeight:1.5}}>
              Search links only. Your browser may block multi-tab popups — allow them if prompted.
            </p>
          </div>

          {/* Share list — premium */}
          <button
            onClick={()=>{
              if(!isPremium){ setShowPremium(true); return; }
              const text = `My FreshNudge list:\n${toBuy.map(i=>`• ${i.name}`).join('\n')||'(empty)'}`;
              const nav = navigator as Navigator & { share?: (d:{text:string;title:string})=>Promise<void> };
              if(nav.share) nav.share({title:'Shopping list',text}).catch(()=>{});
              else { navigator.clipboard?.writeText(text); showToast('Copied to clipboard'); }
            }}
            style={{marginTop:18,width:'100%',background:'var(--white)',border:'1px solid var(--border)',borderRadius:14,padding:14,display:'flex',alignItems:'center',gap:12,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
            <div style={{width:38,height:38,borderRadius:10,background:'#FFFBEB',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>{isPremium?'📤':'👑'}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:'var(--ink)'}}>Share list with family{isPremium?'':' · Premium'}</div>
              <div style={{fontSize:11,color:'var(--gray)',marginTop:2}}>{isPremium?'Send to anyone — syncs live in v2.':'Unlock to share with your household.'}</div>
            </div>
          </button>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // INSIGHTS SCREEN
  // ════════════════════════════════════════════════
  const renderInsights = () => {
    const ccy = CURRENCY[profile.country].symbol;
    const total = pantry.reduce((a,i)=>a+(i.price||0),0);

    const now = Date.now();
    const dayMs = 86400000;
    const days: { day:string; used:number; wasted:number }[] = [];
    for (let i=6; i>=0; i--) {
      const ts = now - i*dayMs;
      const d  = new Date(ts);
      const dayKey = d.toISOString().slice(0,10);
      const label = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      const dayUsed   = usedLog.filter(l=>l.date.slice(0,10)===dayKey).reduce((s,l)=>s+(l.price||0),0);
      const dayWasted = wasteLog.filter(l=>l.date.slice(0,10)===dayKey).reduce((s,l)=>s+(l.price||0),0);
      days.push({ day: label, used: dayUsed, wasted: dayWasted });
    }
    const weekUsed   = days.reduce((s,d)=>s+d.used,0);
    const weekWasted = days.reduce((s,d)=>s+d.wasted,0);
    const efficiency = weekUsed+weekWasted>0 ? Math.round((weekUsed/(weekUsed+weekWasted))*100) : 0;
    const maxBar = Math.max(1, ...days.map(d=>d.used+d.wasted));

    // Streak: consecutive days (starting today) where used > wasted
    let streak = 0;
    for (let i=0; i<60; i++) {
      const ts = now - i*dayMs;
      const dayKey = new Date(ts).toISOString().slice(0,10);
      const u = usedLog.filter(l=>l.date.slice(0,10)===dayKey).reduce((s,l)=>s+(l.price||0),0);
      const w = wasteLog.filter(l=>l.date.slice(0,10)===dayKey).reduce((s,l)=>s+(l.price||0),0);
      if (u>w && (u>0||w>0)) streak++;
      else if (u===0&&w===0 && i===0) continue;
      else break;
    }

    // Saved this month = used total (last 30 days)
    const monthAgo = now - 30*dayMs;
    const savedMonth = usedLog.filter(l=>new Date(l.date).getTime()>=monthAgo).reduce((s,l)=>s+(l.price||0),0);

    // Most wasted: top item name by frequency in wasteLog
    const wasteCounts: Record<string,number> = {};
    wasteLog.forEach(l=>{ wasteCounts[l.name]=(wasteCounts[l.name]||0)+1; });
    const mostWasted = Object.entries(wasteCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '—';

    return (
      <div className="screen" style={{background:'var(--cream)'}}>
        {/* Hero */}
        <div style={{padding:'18px 20px 16px',background:'var(--surf)',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)'}}>INSIGHTS · THIS WEEK</div>
          <h1 style={{fontFamily:'var(--serif)',fontSize:30,color:'var(--ink)',margin:'4px 0 0',letterSpacing:-.5,fontWeight:500,lineHeight:1.1}}>You&apos;re doing great, honestly.</h1>
        </div>

        <div style={{padding:'16px 16px 24px'}}>
          {/* Efficiency ring */}
          <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:16,padding:18,marginBottom:14,display:'flex',gap:16,alignItems:'center'}}>
            <div style={{position:'relative',width:90,height:90,flexShrink:0}}>
              <svg width="90" height="90" style={{transform:'rotate(-90deg)'}}>
                <circle cx="45" cy="45" r="40" stroke="var(--border)" strokeWidth="8" fill="none"/>
                <circle cx="45" cy="45" r="40" stroke="#4A6B3A" strokeWidth="8" fill="none"
                  strokeDasharray={2*Math.PI*40}
                  strokeDashoffset={(2*Math.PI*40)*(1-efficiency/100)}
                  strokeLinecap="round"/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{fontFamily:'var(--serif)',fontSize:26,fontWeight:500,color:'var(--ink)',lineHeight:1}}>{efficiency}</div>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--gray)'}}>%</div>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)'}}>FRIDGE EFFICIENCY</div>
              <div style={{fontFamily:'var(--serif)',fontSize:19,fontWeight:500,color:'var(--ink)',marginTop:4,letterSpacing:-.2,lineHeight:1.25}}>
                {ccy}{weekUsed} used<br/>
                <span style={{color:'#C94A3A'}}>{ccy}{weekWasted} wasted</span>
              </div>
            </div>
          </div>

          {/* 7-day chart */}
          <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)'}}>LAST 7 DAYS · {ccy}</div>
              <div style={{display:'flex',gap:10}}>
                <span style={{display:'flex',alignItems:'center',gap:4,fontSize:10.5,color:'var(--gray)'}}><span style={{width:8,height:8,borderRadius:2,background:'#4A6B3A'}}/>used</span>
                <span style={{display:'flex',alignItems:'center',gap:4,fontSize:10.5,color:'var(--gray)'}}><span style={{width:8,height:8,borderRadius:2,background:'#C94A3A'}}/>wasted</span>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'flex-end',gap:8,height:110}}>
              {days.map((h,idx)=>{
                const tot = h.used + h.wasted;
                const hTot  = (tot / maxBar) * 100;
                const hUsed = (h.used / maxBar) * 100;
                return (
                  <div key={idx} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column-reverse',borderRadius:6,overflow:'hidden'}}>
                      <div style={{background:'#4A6B3A',height:`${hUsed}%`,minHeight:h.used?3:0}}/>
                      <div style={{background:'#C94A3A',height:`${hTot-hUsed}%`,minHeight:h.wasted?3:0}}/>
                    </div>
                    <div style={{fontFamily:'var(--mono)',fontSize:9.5,color:'var(--gray)'}}>{h.day}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid of callouts */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <Callout label="STREAK"            big={`${streak}${streak?'🔥':''}`}              sub="days used &gt; wasted"/>
            <Callout label="SAVED THIS MONTH"  big={`${ccy}${savedMonth}`}                     sub="food actually used" tone="fresh"/>
            <Callout label="MOST WASTED"       big={mostWasted}                                sub={mostWasted==='—'?'no waste yet':'try smaller bunches'} tone="urgent"/>
            <Callout label="FRIDGE VALUE"      big={`${ccy}${total}`}                          sub={`${pantry.length} items tracked`}/>
          </div>

          {/* Weekly digest */}
          <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginTop:12}}>
            <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)'}}>WEEKLY DIGEST</div>
            <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:500,color:'var(--ink)',marginTop:6,letterSpacing:-.2,lineHeight:1.4}}>
              {cookLog.length>0
                ? <>&ldquo;You cooked <span style={{color:'var(--navy)'}}>{cookLog.length} meal{cookLog.length>1?'s':''}</span> this week. Keep using what&apos;s expiring.&rdquo;</>
                : '"Get started — log a meal this week and we’ll track your kitchen efficiency."'}
            </div>
            <div style={{fontSize:11.5,color:'var(--gray)',marginTop:8}}>— Sent every Sunday, 9 PM</div>
          </div>
        </div>
      </div>
    );
  };

  function Callout({label,big,sub,tone='neutral'}:{label:string;big:string;sub:string;tone?:'neutral'|'fresh'|'urgent'}) {
    const color = tone==='fresh'?'#4A6B3A':tone==='urgent'?'#C94A3A':'var(--ink)';
    return (
      <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
        <div style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:.8,color:'var(--gray)'}}>{label}</div>
        <div style={{fontFamily:'var(--serif)',fontSize:20,fontWeight:500,color,marginTop:4,letterSpacing:-.2,lineHeight:1.1}} dangerouslySetInnerHTML={{__html:big}}/>
        <div style={{fontSize:11,color:'var(--gray)',marginTop:4}} dangerouslySetInnerHTML={{__html:sub}}/>
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // PROFILE SCREEN
  // ════════════════════════════════════════════════
  const [editingField, setEditingField] = useState<string|null>(null);
  const [editingMember, setEditingMember] = useState<number|null>(null);

  const renderProfile = () => {
    const avatarInitial = (profile.name||'F').charAt(0).toUpperCase();
    const dietLabel = profile.isVeg ? (profile.eatsEggs?'Egg-veg':'Vegetarian') : 'Everything';

    const EditableRow = ({fieldKey, label, value, options}:{fieldKey:string;label:string;value:string;options?:{v:string;l:string}[]}) => {
      const editing = editingField===fieldKey;
      const commit = (v:string) => {
        if (fieldKey==='name')  { const np={...profile,name:v}; setProfile(np); save({profile:np}); }
        if (fieldKey==='city')  { const np={...profile,city:v}; setProfile(np); save({profile:np}); }
        if (fieldKey==='diet')  {
          const isVeg = v==='veg'||v==='egg-veg'||v==='vegan';
          const eatsEggs = v==='egg-veg';
          const np = {...profile,isVeg,eatsEggs};
          setProfile(np); save({profile:np});
        }
        if (fieldKey==='breakfast') { const np={...profile,notifTimes:{...profile.notifTimes,breakfast:v}}; setProfile(np); save({profile:np}); }
        if (fieldKey==='dinner')    { const np={...profile,notifTimes:{...profile.notifTimes,dinner:v}};    setProfile(np); save({profile:np}); }
        setEditingField(null);
      };
      return (
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--gray)'}}>{label}</div>
            {editing ? (
              options ? (
                <select autoFocus defaultValue={value} onBlur={e=>commit(e.target.value)} onChange={e=>commit(e.target.value)} style={{marginTop:4,width:'100%',padding:'6px 0',border:'none',background:'transparent',fontSize:15,fontWeight:600,color:'var(--ink)',outline:'none',borderBottom:`1.5px solid var(--navy)`}}>
                  {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              ) : (
                <input autoFocus defaultValue={value} onBlur={e=>commit(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commit((e.target as HTMLInputElement).value); if(e.key==='Escape')setEditingField(null);}} style={{marginTop:4,width:'100%',padding:'6px 0',border:'none',background:'transparent',fontSize:15,fontWeight:600,color:'var(--ink)',outline:'none',borderBottom:`1.5px solid var(--navy)`}}/>
              )
            ) : (
              <div style={{fontSize:15,fontWeight:700,color:'var(--ink)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{value||<span style={{color:'var(--gray)',fontWeight:500}}>Not set</span>}</div>
            )}
          </div>
          {!editing && (
            <button onClick={()=>setEditingField(fieldKey)} style={{background:'transparent',border:'none',cursor:'pointer',fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--navy)',fontWeight:700}}>EDIT</button>
          )}
        </div>
      );
    };

    const memberPalette = ['#C94A3A','#4A6B3A','#C68A2E','#35405E','#73294A'];

    return (
      <div className="screen" style={{background:'var(--cream)'}}>
        {/* Hero */}
        <div style={{padding:'18px 20px 16px',background:'var(--surf)',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)'}}>ACCOUNT</div>
          <h1 style={{fontFamily:'var(--serif)',fontSize:30,color:'var(--ink)',margin:'4px 0 0',letterSpacing:-.5,fontWeight:500,lineHeight:1.1}}>You &amp; family</h1>
          <p style={{fontSize:12,color:'var(--gray)',marginTop:4}}>Tap any field to edit.</p>
        </div>

        <div style={{padding:'16px'}}>
          {/* Avatar card */}
          <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:16,padding:16,display:'flex',alignItems:'center',gap:14,marginBottom:20}}>
            <div style={{width:54,height:54,borderRadius:54,background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',fontSize:24,fontWeight:500,color:'#fff',flexShrink:0}}>{avatarInitial}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:'var(--serif)',fontSize:20,fontWeight:500,color:'var(--ink)'}}>{profile.name||'Friend'}</div>
              <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>{profile.city} · {dietLabel}</div>
            </div>
          </div>

          {/* Personal */}
          <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)',marginBottom:10}}>PERSONAL</div>
          <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden'}}>
            <EditableRow fieldKey="name" label="Name" value={profile.name||''}/>
            <EditableRow fieldKey="city" label="City" value={profile.city||''}/>
            <EditableRow fieldKey="diet" label="Diet"
              value={profile.isVeg ? (profile.eatsEggs?'egg-veg':'veg') : 'all'}
              options={[{v:'veg',l:'Vegetarian'},{v:'egg-veg',l:'Egg-vegetarian'},{v:'all',l:'Everything'},{v:'vegan',l:'Vegan'}]}/>
          </div>

          {/* Household */}
          <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)',marginTop:22,marginBottom:10}}>HOUSEHOLD · {family.length}</div>
          <div style={{display:'grid',gap:8}}>
            {family.map((m, idx) => {
              const isEditing = editingMember===m.id;
              const color = memberPalette[idx % memberPalette.length];
              return (
                <div key={m.id} style={{background:'var(--white)',border:`1px solid ${isEditing?'var(--navy)':'var(--border)'}`,borderRadius:14,padding:12,transition:'border-color .15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:40,height:40,borderRadius:40,background:color,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--serif)',color:'#fff',fontSize:16,fontWeight:500,flexShrink:0}}>{(m.name||'?').charAt(0).toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      {!isEditing ? (
                        <>
                          <div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>{m.name}</div>
                          <div style={{fontSize:11.5,color:'var(--gray)',marginTop:2}}>{m.role} · age {m.age}</div>
                        </>
                      ) : (
                        <input autoFocus value={m.name} onChange={e=>setFamily(f=>f.map(x=>x.id===m.id?{...x,name:e.target.value}:x))}
                          style={{width:'100%',padding:'4px 0',border:'none',background:'transparent',fontSize:14,fontWeight:700,color:'var(--ink)',outline:'none',borderBottom:'1.5px solid var(--navy)'}}/>
                      )}
                    </div>
                    {m.role==='Toddler'&&!isEditing&&<span style={{fontSize:10,padding:'4px 10px',borderRadius:999,background:'#FAEED1',color:'#C68A2E',fontWeight:700}}>Kid-safe</span>}
                    <button onClick={()=>{ if(isEditing) save({family}); setEditingMember(isEditing?null:m.id); }} style={{background:'transparent',border:'none',cursor:'pointer',fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--navy)',fontWeight:700}}>{isEditing?'DONE':'EDIT'}</button>
                  </div>
                  {isEditing && (
                    <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      <label style={{fontSize:11}}>
                        <div style={{color:'var(--gray)',fontWeight:600,marginBottom:4}}>ROLE</div>
                        <select value={m.role} onChange={e=>setFamily(f=>f.map(x=>x.id===m.id?{...x,role:e.target.value}:x))} style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:600,color:'var(--ink)',background:'var(--surf)',fontFamily:'inherit'}}>
                          {['Adult','Partner','Teen','Kid','Toddler'].map(r=><option key={r} value={r}>{r}</option>)}
                        </select>
                      </label>
                      <label style={{fontSize:11}}>
                        <div style={{color:'var(--gray)',fontWeight:600,marginBottom:4}}>AGE</div>
                        <input type="number" value={m.age} onChange={e=>setFamily(f=>f.map(x=>x.id===m.id?{...x,age:parseInt(e.target.value)||0}:x))} style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:600,color:'var(--ink)',background:'var(--surf)',fontFamily:'inherit'}}/>
                      </label>
                      <button onClick={()=>{const nf=family.filter(x=>x.id!==m.id);setFamily(nf);save({family:nf});setEditingMember(null);}} style={{gridColumn:'1 / -1',background:'transparent',color:'#C94A3A',border:'1.5px solid #C94A3A',borderRadius:8,padding:'8px 12px',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Remove from household</button>
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={()=>{
              const newId = Math.max(0, ...family.map(f=>f.id))+1;
              const nf = [...family, {id:newId, name:'New member', role:'Adult', age:30, avatar:'👤'}];
              setFamily(nf); save({family:nf}); setEditingMember(newId);
            }} style={{background:'none',border:'1.5px dashed var(--border)',borderRadius:14,padding:14,fontSize:13,fontWeight:600,color:'var(--gray)',cursor:'pointer',fontFamily:'inherit'}}>+ Add a family member</button>
          </div>

          {/* Settings */}
          <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1.2,color:'var(--gray)',marginTop:22,marginBottom:10}}>SETTINGS</div>
          <div style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden'}}>
            <EditableRow fieldKey="breakfast" label="Breakfast reminder" value={profile.notifTimes.breakfast}/>
            <EditableRow fieldKey="dinner"    label="Dinner reminder"    value={profile.notifTimes.dinner}/>
            <EditableRow fieldKey="allergies" label="Allergies &amp; dislikes" value={(profile.allergies||[]).join(', ')||'None'}/>
          </div>

          <div style={{marginTop:22,textAlign:'center',fontFamily:'var(--mono)',fontSize:10,color:'var(--gray)',letterSpacing:1}}>FRESHNUDGE · v1.0 · {profile.city}</div>

          <button onClick={()=>{
            if(confirm('Log out? This clears your data on this device.')) {
              localStorage.removeItem('mise_v1');
              window.location.reload();
            }
          }} style={{marginTop:16,width:'100%',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:14,padding:12,fontSize:13,fontWeight:700,color:'var(--ink)',cursor:'pointer',fontFamily:'inherit'}}>
            Logout
          </button>
          <div style={{height:24}}/>
        </div>
      </div>
    );
  };

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
            <h2 style={{fontSize:22,fontWeight:900,color:'var(--ink)',letterSpacing:-.4}}>Mise Premium</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginTop:4}}>Your fridge, your meals, on autopilot.</p>
          </div>
          <div style={{background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'2px solid #C68A2E',borderRadius:16,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div><span style={{fontSize:34,fontWeight:900,color:'#92400E'}}>₹299</span><span style={{fontSize:14,color:'#B45309',fontWeight:600}}>/month</span></div>
            <div style={{textAlign:'right'}}><p style={{fontSize:12,color:'#B45309',fontWeight:700}}>7-day free trial</p><p style={{fontSize:11,color:'#A57522'}}>Cancel anytime</p></div>
          </div>
        </div>
        <div className="modal-body" style={{padding:'0 22px'}}>
          {[['📧','Email auto-sync','Amazon, Swiggy, Blinkit, Foodpanda'],['🔔','Daily meal push','All 4 meals sent to you automatically'],['👶','Child safety filter','Every recipe pre-checked for toddler safety'],['📅','7-day meal plan','Full week planned every Sunday'],['📊','Spending insights','Waste tracking and efficiency score'],['🌍','All grocery apps','Zepto, BigBasket, Instacart, RedMart & more']].map(([ic,lb,sub])=>(
            <div key={lb} style={{display:'flex',alignItems:'flex-start',gap:12,paddingBottom:12,marginBottom:12,borderBottom:'1px solid var(--border)'}}>
              <div style={{width:34,height:34,borderRadius:10,background:'#FFFBEB',border:'1px solid #FDE68A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{ic}</div>
              <div style={{flex:1}}><p style={{fontWeight:700,fontSize:13,color:'var(--ink)'}}>{lb}</p><p style={{fontSize:12,color:'var(--gray)',marginTop:2}}>{sub}</p></div>
              <div style={{width:18,height:18,borderRadius:9,background:'#DCFCE7',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2,fontSize:11}}>✓</div>
            </div>
          ))}
          <div style={{background:'#FAF2EE',border:'1px solid #F4D8C8',borderRadius:12,padding:14,marginBottom:16}}>
            <p style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:8}}>💡 The math</p>
            <p style={{fontSize:12,color:'var(--inkM)',lineHeight:1.7}}>One unnecessary Swiggy/Deliveroo order = ₹600–800. Mise costs <strong>₹299/month</strong>. Stop one delivery order and the app pays for itself.</p>
          </div>
        </div>
        <div style={{padding:'12px 22px',paddingBottom:'max(28px,env(safe-area-inset-bottom))'}}>
          <button onClick={()=>{setIsPremium(true);save({isPremium:true});setShowPremium(false);showToast('🎉 Welcome to Premium!');}}
            style={{width:'100%',background:'linear-gradient(135deg,#C68A2E,#A57522)',border:'none',borderRadius:16,padding:16,fontSize:16,fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit',marginBottom:10}}>
            👑 Start 7-day free trial
          </button>
          <button onClick={()=>setShowPremium(false)} style={{width:'100%',background:'none',border:'none',color:'var(--gray)',fontSize:13,cursor:'pointer',padding:6,fontFamily:'inherit'}}>Maybe later</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════
  // ADD SHEET (Voice / Type / Scan) — scan = premium
  // ════════════════════════════════════════════════
  const [addMode, setAddMode] = useState<'voice'|'type'|'scan'>('voice');
  const [typedAdd, setTypedAdd] = useState('');
  const renderAddSheet = () => {
    const tabStyle = (on:boolean) => ({
      flex:1, background: on?'var(--ink)':'var(--cream)',
      color: on?'var(--surf)':'var(--ink)',
      border:`1px solid ${on?'var(--ink)':'var(--border)'}`,
      borderRadius:12, padding:'10px 8px', cursor:'pointer',
      fontFamily:'inherit', fontSize:12.5, fontWeight:700,
      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
    });
    const submitType = async () => {
      if(!typedAdd.trim()) return;
      await parseText(typedAdd);
      setTypedAdd('');
      setShowAdd(false);
    };
    return (
      <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false);}}>
        <div className="modal-sheet" style={{borderRadius:'22px 22px 0 0'}}>
          <div className="modal-handle"/>
          <div style={{padding:'10px 22px 0'}}>
            <h2 style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:500,color:'var(--ink)',letterSpacing:-.3,padding:'4px 0 14px'}}>Add to fridge</h2>
            <div style={{display:'flex',gap:6,marginBottom:16}}>
              <button style={tabStyle(addMode==='voice')} onClick={()=>setAddMode('voice')}>🎙 Voice</button>
              <button style={tabStyle(addMode==='type')}  onClick={()=>setAddMode('type')}>✍️ Type</button>
              <button style={tabStyle(addMode==='scan')}  onClick={()=>setAddMode('scan')}>📷 Scan</button>
            </div>
          </div>
          <div className="modal-body" style={{padding:'0 22px 26px'}}>
            {addMode==='voice'&&(
              <button onClick={startVoice} style={{width:'100%',background:recording?'#FCE8E5':'var(--cream)',border:`1.5px solid ${recording?'#F4C8C1':'var(--border)'}`,borderRadius:14,padding:'26px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:12,cursor:'pointer',fontFamily:'inherit'}}>
                <div style={{width:70,height:70,borderRadius:70,background:recording?'#C94A3A':'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" fill="#FFF"/><path d="M5 11a7 7 0 0014 0M12 18v4" stroke="#FFF" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                <div style={{fontSize:14,fontWeight:700,color:recording?'#C94A3A':'var(--ink)'}}>{recording?'Listening…':'Tap to speak'}</div>
                <div style={{fontSize:12,color:'var(--gray)',textAlign:'center'}}>Say: &ldquo;2 tomatoes, 1L milk, 250g paneer&rdquo;</div>
              </button>
            )}
            {addMode==='type'&&(
              <div>
                <textarea value={typedAdd} onChange={e=>setTypedAdd(e.target.value)} placeholder="2 tomatoes, 1L milk, 500g paneer, bunch coriander" style={{width:'100%',minHeight:100,padding:14,borderRadius:14,border:'1.5px solid var(--border)',background:'var(--cream)',color:'var(--ink)',fontFamily:'inherit',fontSize:14,outline:'none',resize:'vertical'}}/>
                <button onClick={submitType} style={{marginTop:10,background:'var(--navy)',color:'#fff',border:'none',borderRadius:14,padding:'12px 18px',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'inherit',width:'100%'}}>Parse items</button>
              </div>
            )}
            {/* Parsing indicator */}
            {parsing && pendingItems.length===0 && (
              <div style={{marginTop:16,background:'var(--cream)',border:'1px solid var(--border)',borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:18,height:18,border:'2px solid var(--border)',borderTopColor:'var(--navy)',borderRadius:18,animation:'spin .8s linear infinite'}}/>
                <div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>Processing…</div>
              </div>
            )}

            {/* Pending items preview — edit qty, confirm */}
            {pendingItems.length>0 && (
              <div style={{marginTop:16}}>
                <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)',marginBottom:8}}>{pendingItems.length} ITEM{pendingItems.length>1?'S':''} DETECTED</div>
                <div style={{display:'grid',gap:6,marginBottom:12}}>
                  {pendingItems.map((p,idx)=>{
                    const ccySymbol = CURRENCY[profile.country].symbol;
                    return (
                      <div key={idx} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--white)',border:'1px solid var(--border)',borderRadius:14}}>
                        <span style={{fontSize:24}}>{p.emoji}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>{p.item_name}</div>
                          {p.price?<div style={{fontSize:11,color:'var(--gray)',marginTop:2}}>~{ccySymbol}{p.price}</div>:null}
                        </div>
                        <input type="number" min="0" value={p.quantity} onChange={e=>{
                          const n = parseFloat(e.target.value)||0;
                          setPendingItems(list=>list.map((x,i)=>i===idx?{...x,quantity:n}:x));
                        }} style={{width:60,textAlign:'center',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit',fontSize:13,fontWeight:700,background:'var(--cream)'}}/>
                        <select value={p.unit} onChange={e=>setPendingItems(list=>list.map((x,i)=>i===idx?{...x,unit:e.target.value}:x))} style={{padding:'6px 4px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit',fontSize:12,background:'var(--cream)'}}>
                          {['pcs','g','kg','ml','L','bunch','loaf','dozen','packet'].map(u=><option key={u} value={u}>{u}</option>)}
                        </select>
                        <button onClick={()=>setPendingItems(list=>list.filter((_,i)=>i!==idx))} style={{background:'none',border:'none',color:'var(--gray)',cursor:'pointer',fontSize:18,padding:0,lineHeight:1}}>×</button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={confirmPending} style={{width:'100%',background:'var(--navy)',color:'#fff',border:'none',borderRadius:14,padding:14,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>Add {pendingItems.length} item{pendingItems.length>1?'s':''} to fridge</button>
              </div>
            )}

            {addMode==='scan'&&!pendingItems.length&&(
              <div style={{display:'grid',gap:10}}>
                <div style={{fontSize:12,color:'var(--gray)',marginBottom:2,lineHeight:1.5}}>
                  Snap a receipt, a grocery-app screenshot, or open your fridge and shoot the shelf. AI identifies every item.
                </div>
                {/* Camera capture (mobile: opens camera directly) */}
                <label style={{background:'var(--cream)',border:'1.5px dashed var(--border)',borderRadius:14,padding:18,display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
                  <input type="file" accept="image/*" capture="environment"
                    onChange={async e=>{const f=e.target.files?.[0]; if(f) await sendToScan(f); e.currentTarget.value='';}}
                    style={{display:'none'}}/>
                  <div style={{width:50,height:50,borderRadius:14,background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>Take photo now</div>
                    <div style={{fontSize:11.5,color:'var(--gray)',marginTop:2}}>Opens your camera (mobile) — point at fridge or receipt</div>
                  </div>
                </label>
                {/* Upload from library */}
                <label style={{background:'var(--white)',border:'1px solid var(--border)',borderRadius:14,padding:18,display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
                  <input type="file" accept="image/*"
                    onChange={async e=>{const f=e.target.files?.[0]; if(f) await sendToScan(f); e.currentTarget.value='';}}
                    style={{display:'none'}}/>
                  <div style={{width:50,height:50,borderRadius:14,background:'var(--cream)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:22}}>🖼️</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>Upload from library</div>
                    <div style={{fontSize:11.5,color:'var(--gray)',marginTop:2}}>Pick a receipt, order screenshot, or fridge photo</div>
                  </div>
                </label>
                <div style={{fontSize:11,color:'var(--gray)',textAlign:'center',marginTop:4,lineHeight:1.5}}>
                  Works with receipts, Blinkit/Zepto/Swiggy/Shopee/FairPrice screenshots, or a photo of your fridge shelf.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // ITEM DETAIL SHEET (Butter-style — ate / wasted / edit / delete)
  // ════════════════════════════════════════════════
  const [editExpiryMode, setEditExpiryMode] = useState(false);
  const deleteItem = (id:string) => {
    const updated = pantry.filter(i=>i.id!==id);
    setPantry(updated); save({pantry:updated});
    setOpenItem(null);
    showToast('Removed from fridge');
  };
  const renderItemSheet = () => {
    if(!openItem) return null;
    const ct = catTint(openItem.cat);
    const ccy = CURRENCY[profile.country].symbol;
    const dl = daysLeft(openItem.expiry);
    return (
      <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget){setOpenItem(null);setEditExpiryMode(false);}}}>
        <div className="modal-sheet" style={{borderRadius:'22px 22px 0 0'}}>
          <div className="modal-handle"/>
          <div style={{padding:'8px 22px 0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <h2 style={{fontFamily:'var(--serif)',fontSize:24,fontWeight:500,color:'var(--ink)',letterSpacing:-.3}}>{openItem.name}</h2>
            <button onClick={()=>deleteItem(openItem.id)} title="Delete" style={{background:'none',border:'none',cursor:'pointer',color:'var(--gray)',fontSize:22,lineHeight:1,padding:4}}>🗑</button>
          </div>
          <div className="modal-body" style={{padding:'10px 22px 26px'}}>
            {/* Emoji tile */}
            <div style={{height:120,borderRadius:14,background:ct.bg,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14,fontSize:64}}>
              {openItem.emoji||'📦'}
            </div>
            {/* Stats */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,paddingBottom:16,borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:.8,color:'var(--gray)'}}>QUANTITY</div>
                <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:500,color:'var(--ink)',marginTop:2}}>{openItem.qty}{openItem.unit}</div>
              </div>
              <div>
                <div style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:.8,color:'var(--gray)'}}>EXPIRES</div>
                {editExpiryMode?(
                  <input autoFocus type="number" value={newExpiryDays} onChange={e=>setNewExpiryDays(e.target.value)} onBlur={()=>{applyExpiryEdit();setEditExpiryMode(false);}} onKeyDown={e=>{if(e.key==='Enter'){applyExpiryEdit();setEditExpiryMode(false);}}} placeholder={String(openItem.expDays)} style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:500,color:'var(--ink)',marginTop:2,width:'100%',border:'none',borderBottom:'1.5px solid var(--navy)',background:'transparent',outline:'none',padding:0}}/>
                ):(
                  <button onClick={()=>{setEditExpiry(openItem);setNewExpiryDays(String(openItem.expDays));setEditExpiryMode(true);}} style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:'var(--serif)',fontSize:18,fontWeight:500,color:'var(--ink)',marginTop:2,textAlign:'left'}}>{fmtDays(dl)}</button>
                )}
              </div>
              <div>
                <div style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:.8,color:'var(--gray)'}}>COST</div>
                <div style={{fontFamily:'var(--serif)',fontSize:18,fontWeight:500,color:'var(--ink)',marginTop:2}}>{ccy}{openItem.price||0}</div>
              </div>
            </div>
            {/* Actions */}
            <div style={{marginTop:16}}>
              <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)',marginBottom:10}}>WHAT TO DO</div>
              <div style={{display:'grid',gap:8}}>
                <button onClick={()=>{markUsed(openItem.id);setOpenItem(null);showToast(`✓ Ate the ${openItem.name}`);}} style={{background:'#4A6B3A',color:'#fff',border:'none',borderRadius:14,padding:14,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>✓ Ate it</button>
                <button onClick={()=>{markWasted(openItem.id);setOpenItem(null);showToast(`✗ Wasted ${openItem.name} — noted`);}} style={{background:'var(--surf)',color:'#C94A3A',border:'1.5px solid #C94A3A',borderRadius:14,padding:14,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>✗ Threw it / wasted</button>
              </div>
            </div>
            {/* Added by */}
            <div style={{marginTop:16,padding:14,background:'var(--cream)',borderRadius:14}}>
              <div style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:1,color:'var(--gray)',marginBottom:6}}>ADDED BY</div>
              <div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>
                {openItem.src==='🎙️'?'🎙 Voice':openItem.src==='📷'?'📷 Photo scan':'✍️ Manual'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
          tab==='shop'     ? renderShop() :
          tab==='insights' ? renderInsights() :
          renderProfile()}
      </div>

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
      {showAdd&&renderAddSheet()}
      {openItem&&renderItemSheet()}

      {/* Toast */}
      {toast&&<div style={{position:'absolute',bottom:100,left:'50%',transform:'translateX(-50%)',background:'#111827',color:'#fff',padding:'10px 18px',borderRadius:24,fontSize:13,fontWeight:700,zIndex:200,whiteSpace:'nowrap',animation:'fadeIn .2s'}}>{toast}</div>}
    </div>
  );
}
