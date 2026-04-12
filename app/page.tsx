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
}
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
function PantryRow({item,onUsed,onWasted,onEditExpiry}:{item:PantryItem;onUsed:(id:string)=>void;onWasted:(id:string)=>void;onEditExpiry:(item:PantryItem)=>void}) {
  const [dx,setDx]=useState(0),[gone,setGone]=useState(false);
  const sX=useRef<number|null>(null),drag=useRef(false);
  const dl = daysLeft(item.expiry);
  const urgent = dl <= 1;

  const start=(x:number)=>{sX.current=x;drag.current=true;};
  const move=(x:number)=>{if(!drag.current)return;setDx(Math.max(-115,Math.min(115,x-sX.current!)));};
  const end=()=>{
    if(!drag.current)return;drag.current=false;
    if(dx>80){setGone(true);setTimeout(()=>onUsed(item.id),280);}
    else if(dx<-80){setGone(true);setTimeout(()=>onWasted(item.id),280);}
    else setDx(0);
  };

  if(gone) return null;

  const gn=dx>20,rd=dx<-20;
  return (
    <div className="swipe-row" style={{marginBottom:8}}>
      <div className="swipe-bg" style={{background:gn?'linear-gradient(90deg,#86EFAC,#22C55E)':rd?'linear-gradient(270deg,#EF4444,#DC2626)':'#F0F2F5'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,color:'#14532D',fontWeight:800,fontSize:13}}>✓ Used!</div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,color:'#7F1D1D',fontWeight:800,fontSize:13}}>Wasted 🗑</div>
      </div>
      <div
        className="swipe-card"
        style={{transform:`translateX(${dx}px)`,transition:drag.current?'none':'transform .28s cubic-bezier(.34,1.56,.64,1)',borderColor:urgent?'#FCA5A540':'var(--border)'}}
        onMouseDown={e=>start(e.clientX)} onMouseMove={e=>{if(e.buttons)move(e.clientX);}} onMouseUp={end} onMouseLeave={end}
        onTouchStart={e=>start(e.touches[0].clientX)} onTouchMove={e=>{e.preventDefault();move(e.touches[0].clientX);}} onTouchEnd={end}
      >
        <span style={{fontSize:24}}>{item.emoji}</span>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
            <span style={{fontWeight:800,fontSize:14,color:'var(--ink)'}}>{item.name}</span>
            <span className={urgent?'pill pill-red':'pill pill-green'}>{urgent?'⚠ ':''}{fmtDays(dl)}</span>
          </div>
          <span style={{fontSize:11,color:'var(--gray)'}}>{item.qty}{item.unit} · {item.src}</span>
        </div>
        <button onClick={()=>onEditExpiry(item)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--gray)',fontSize:11,fontWeight:700,textDecoration:'underline',padding:'4px',flexShrink:0}}>edit</button>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────
export default function App() {
  // ── Persistent state (localStorage) ────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    name:'', city:'Mumbai', isVeg:true, eatsEggs:true,
    hasToddler:false, toddlerName:'', toddlerAge:2, familySize:2, allergies:[],
    notifTimes:{breakfast:'07:30',lunch:'11:30',snack:'16:00',dinner:'17:30'},
  });
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [cookLog, setCookLog] = useState<CookLog[]>([]);
  const [isPremium, setIsPremium] = useState(false);

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
        if(d.isPremium) setIsPremium(true);
      }
    } catch{}
  },[]);

  // ── Save to localStorage ────────────────────────────────────────
  const save = useCallback((updates: Partial<{onboardingDone:boolean;profile:Profile;family:FamilyMember[];pantry:PantryItem[];cookLog:CookLog[];isPremium:boolean}>)=>{
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
  const OB_STEPS = ['welcome','name','family','diet','sources','notifications','done'];
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
    // @ts-ignore webkit prefix
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SR) {
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = 'en-IN';
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
      const res  = await fetch('/api/transcribe', {method:'POST',body:fd});
      const data = await res.json();
      if(data.transcript) setVoiceTranscript(data.transcript);
      if(data.items?.length) addItems(data.items);
      else showToast('Could not parse that — try again');
    } catch { showToast('Voice processing failed'); }
  };

  const parseText = async (text: string) => {
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('dietary', JSON.stringify({isVeg:profile.isVeg,eatsEggs:profile.eatsEggs}));
      const res  = await fetch('/api/transcribe', {method:'POST',body:fd});
      const data = await res.json();
      if(data.items?.length) addItems(data.items);
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
  const markUsed=(id:string)=>{
    setConfetti(true); setTimeout(()=>setConfetti(false),2200);
    const updated = pantry.filter(i=>i.id!==id);
    setPantry(updated); save({pantry:updated});
  };
  const markWasted=(id:string)=>{
    const updated = pantry.filter(i=>i.id!==id);
    setPantry(updated); save({pantry:updated});
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
    setCooking(null);
    setConfetti(true); setTimeout(()=>setConfetti(false),2200);
    showToast(`🎉 ${cooking.name} cooked! Fridge updated.`);
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
            <h1 style={{fontSize:32,fontWeight:900,color:'#fff',letterSpacing:-1,marginBottom:8}}>Mise</h1>
            <p style={{fontSize:14,color:'#93C5FD',textAlign:'center',lineHeight:1.6,marginBottom:40}}>Your kitchen, always ready.<br/>Never wonder what to cook again.</p>
            <button className="btn-primary" onClick={()=>setObStep(1)} style={{background:'#22C55E',fontSize:16,padding:16}}>Get started →</button>
            <p style={{fontSize:11,color:'#475569',marginTop:20,textAlign:'center'}}>🔒 Works offline · Your data stays on your device</p>
          </div>
        )}

        {step==='name'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>What&apos;s your name?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:28}}>We&apos;ll personalise everything for you.</p>
            <input type="text" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))}
              placeholder="Your first name" style={{width:'100%',marginBottom:20,border:'2px solid var(--navy)',fontWeight:700,fontSize:16}}/>
            <p style={{fontSize:13,fontWeight:700,color:'var(--gray)',marginBottom:10}}>Your city</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {['Mumbai','Delhi','Bangalore','Singapore','London','Sydney','New York','Toronto'].map(c=>(
                <div key={c} onClick={()=>setProfile(p=>({...p,city:c}))}
                  style={{background:profile.city===c?'#EFF6FF':'',border:`1.5px solid ${profile.city===c?'var(--navy)':'var(--border)'}`,borderRadius:12,padding:11,textAlign:'center',fontSize:13,fontWeight:profile.city===c?700:500,color:profile.city===c?'var(--navy)':'var(--ink)',cursor:'pointer'}}>
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}

        {step==='family'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>Who are you<br/>cooking for?</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Every recipe adapts to your family.</p>
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

        {step==='sources'&&(
          <div style={{flex:1,padding:'28px 22px'}}>
            <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:6}}>How you&apos;ll add groceries</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Voice is ready now. More ways coming soon.</p>
            {[['🎙️','Voice note','Tap and say what you bought',true],['📧','Email sync','Amazon, Swiggy, Blinkit — Premium v2',false],['📸','Scan receipt','Photo any paper bill — Premium v2',false]].map(([ic,lb,sub,on])=>(
              <div key={lb as string} style={{background:on?'#EFF6FF':'var(--grayL)',border:`1.5px solid ${on?'#BFDBFE':'var(--border)'}`,borderRadius:13,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,marginBottom:9}}>
                <span style={{fontSize:22}}>{ic}</span>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:'var(--ink)'}}>{lb}</div><div style={{fontSize:11,color:'var(--gray)'}}>{sub}</div></div>
                <div style={{width:34,height:19,borderRadius:10,background:on?'#22C55E':'#D1D5DB',display:'flex',alignItems:'center',flexShrink:0}}>
                  <div style={{width:15,height:15,borderRadius:8,background:'#fff',marginLeft:on?17:2,boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                </div>
              </div>
            ))}
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
              {[['👨‍👩‍👧','Family',`${profile.familySize} people${profile.hasToddler?` · ${profile.toddlerName} safety filter ON`:''}`],['🥗','Diet',`${profile.isVeg?'Vegetarian':'Omnivore'}${profile.eatsEggs?' + eggs':''}`],['📍','City',profile.city],['🔔','Notifications','All 4 meal periods set']].map(([ic,lb,val],i,arr)=>(
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
  const renderFridge = () => (
    <div className="screen" style={{background:'var(--cream)'}}>
      {/* Header */}
      <div style={{padding:'14px 16px 8px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>My Fridge</h1>
            <p style={{fontSize:11,color:'var(--gray)',marginTop:1}}>{pantry.length} items · {urgent.length} expiring today</p>
          </div>
          <button onClick={()=>setShowAdd(v=>!v)} className="btn-primary" style={{width:'auto',padding:'9px 14px',fontSize:13,gap:5}}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><line x1="7.5" y1="1" x2="7.5" y2="14" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="1" y1="7.5" x2="14" y2="7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
            Add
          </button>
        </div>

        {/* Voice Add Panel */}
        {showAdd&&(
          <div className="card" style={{marginBottom:12,animation:'fadeIn .2s'}}>
            <p style={{fontSize:11,fontWeight:700,color:'var(--gray)',letterSpacing:.6,marginBottom:12}}>ADD TO FRIDGE BY VOICE</p>
            <button onClick={startVoice}
              style={{width:'100%',background:recording?'#FEE2E2':'#EFF6FF',border:`1.5px solid ${recording?'#FCA5A5':'#BFDBFE'}`,borderRadius:14,padding:'16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer'}}>
              <div style={{width:48,height:48,borderRadius:24,background:recording?'var(--red)':'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background .2s'}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:14,fontWeight:800,color:recording?'var(--red)':'var(--navy)'}}>{recording?'Listening…':'Tap to speak'}</div>
                <div style={{fontSize:12,color:'var(--gray)',marginTop:2}}>Say what you bought — e.g. &quot;2 mangoes, 400g curd&quot;</div>
              </div>
            </button>
            {voiceTranscript&&<div style={{marginTop:10,background:'var(--grayL)',borderRadius:12,padding:'11px 14px',fontSize:13,color:'var(--gray)',fontStyle:'italic'}}>🎙️ &ldquo;{voiceTranscript}&rdquo;</div>}
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
          <span style={{color:'var(--sage)',fontWeight:700}}>← Swipe: Used ✓</span>
          <span style={{color:'var(--gray)'}}>·</span>
          <span style={{color:'var(--red)',fontWeight:700}}>Wasted ✗ →</span>
        </div>}
      </div>

      {/* Item list */}
      <div style={{background:'var(--surf)',padding:'4px 14px 24px',minHeight:200}}>
        {searched ? (
          searched.length===0
            ? <p style={{textAlign:'center',padding:'40px',color:'var(--gray)'}}>&ldquo;{search}&rdquo; not in fridge</p>
            : searched.map(i=><PantryRow key={i.id} item={i} onUsed={markUsed} onWasted={markWasted} onEditExpiry={setEditExpiry}/>)
        ) : (
          <>
            {urgent.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:12,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--red)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'var(--red)',letterSpacing:.6}}>EXPIRES TODAY — COOK FIRST</span>
                <span className="pill pill-red">{urgent.length}</span>
              </div>
              {urgent.map(i=><PantryRow key={i.id} item={i} onUsed={markUsed} onWasted={markWasted} onEditExpiry={setEditExpiry}/>)}
            </>}
            {expiring.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:14,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--gold)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'var(--goldD)',letterSpacing:.6}}>EXPIRING IN 2–3 DAYS</span>
                <span className="pill pill-amber">{expiring.length}</span>
              </div>
              {expiring.map(i=><PantryRow key={i.id} item={i} onUsed={markUsed} onWasted={markWasted} onEditExpiry={setEditExpiry}/>)}
            </>}
            {fresh.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:14,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--sage)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'#15803D',letterSpacing:.6}}>FRESH & STOCKED</span>
                <span className="pill pill-green">{fresh.length}</span>
              </div>
              {fresh.map(i=><PantryRow key={i.id} item={i} onUsed={markUsed} onWasted={markWasted} onEditExpiry={setEditExpiry}/>)}
            </>}
            {pantry.length===0&&<div style={{textAlign:'center',paddingTop:60}}>
              <div style={{fontSize:52}}>🎉</div>
              <p style={{fontWeight:800,fontSize:20,color:'var(--inkM)',marginTop:14}}>Fridge is clear!</p>
              <p style={{fontSize:13,color:'var(--gray)',marginTop:6}}>Tap Add to log your groceries.</p>
            </div>}
          </>
        )}
      </div>
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
          {/* Progress dots */}
          <div style={{display:'flex',justifyContent:'center',gap:5,marginBottom:14}}>
            {steps.map((_,i)=><div key={i} style={{height:6,borderRadius:3,background:i<=cookStep?'var(--navy)':'var(--border)',width:i===cookStep?22:6,transition:'all .2s'}}/>)}
          </div>
          {/* Current step */}
          <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:14,padding:16,marginBottom:16}} key={cookStep}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--navyD)',letterSpacing:.5,marginBottom:8}}>STEP {cookStep+1} OF {steps.length}</div>
            <div style={{fontSize:15,color:'var(--ink)',lineHeight:1.6}}>{steps[cookStep]}</div>
          </div>
          {/* Navigation */}
          <div style={{display:'flex',gap:10}}>
            {cookStep>0&&<button onClick={()=>setCookStep(s=>s-1)} style={{flex:1,border:'1px solid var(--border)',borderRadius:12,padding:12,fontWeight:700,fontSize:14,cursor:'pointer',background:'var(--white)',color:'var(--navy)',fontFamily:'inherit'}}>← Back</button>}
            <button onClick={()=>cookStep<steps.length-1?setCookStep(s=>s+1):doneCooking()} style={{flex:2,background:cookStep<steps.length-1?'var(--navy)':cfg.color,border:'none',borderRadius:12,padding:12,fontWeight:800,fontSize:14,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>
              {cookStep<steps.length-1?'Next →':'✓ Done — update fridge'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════
  // INSIGHTS SCREEN
  // ════════════════════════════════════════════════
  const renderInsights = () => {
    const total = pantry.reduce((a,i)=>a+(i.price||0),0);
    const cats: Record<string,number> = {};
    pantry.forEach(i=>{ cats[i.cat]=(cats[i.cat]||0)+(i.price||0); });
    return (
      <div className="screen" style={{background:'var(--cream)'}}>
        <div style={{padding:'14px 16px 0'}}>
          <h1 style={{fontSize:26,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>Insights</h1>
          <p style={{fontSize:11,color:'var(--gray)',marginTop:1}}>{profile.name}&apos;s kitchen</p>
        </div>
        <div style={{padding:'12px 16px 24px'}}>
          {/* Fridge value */}
          <div style={{background:`linear-gradient(135deg,var(--navy),var(--navyD))`,borderRadius:20,padding:20,marginBottom:12}}>
            <p style={{fontSize:11,color:'#93C5FD',fontWeight:700,letterSpacing:.6}}>FRIDGE VALUE NOW</p>
            <p style={{fontSize:34,fontWeight:900,color:'#fff',marginTop:4}}>₹{total.toLocaleString()}</p>
            <p style={{fontSize:13,color:'#BFDBFE',marginTop:3}}>worth of food in your kitchen</p>
            <div style={{display:'flex',gap:22,marginTop:14}}>
              {[[urgent.length,'expire today'],[pantry.filter(i=>daysLeft(i.expiry)<=3).length,'use in 3 days'],[cookLog.length,'meals cooked']].map(([v,l])=>(
                <div key={String(l)}><div style={{fontWeight:900,fontSize:18,color:'#fff'}}>{v}</div><div style={{fontSize:10,color:'#93C5FD'}}>{l}</div></div>
              ))}
            </div>
          </div>
          {/* Recently cooked */}
          {cookLog.length>0&&(
            <div className="card" style={{marginBottom:12}}>
              <p style={{fontWeight:800,fontSize:15,color:'var(--ink)',marginBottom:12}}>Recently cooked</p>
              {cookLog.slice(0,5).map(l=>(
                <div key={l.id} style={{display:'flex',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{l.name}</div><div style={{fontSize:11,color:'var(--gray)'}}>{l.period} · {new Date(l.date).toLocaleDateString()}</div></div>
                  <span style={{fontSize:18}}>✅</span>
                </div>
              ))}
            </div>
          )}
          {/* Spending by category */}
          {total>0&&(
            <div className="card" style={{marginBottom:12}}>
              <p style={{fontWeight:800,fontSize:15,color:'var(--ink)',marginBottom:12}}>Pantry by category</p>
              {Object.entries(cats).map(([cat,amt])=>(
                <div key={cat} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:12,color:'var(--inkM)'}}>{cat}</span>
                    <span style={{fontSize:12,fontWeight:700,color:'var(--ink)'}}>₹{amt}</span>
                  </div>
                  <div style={{height:6,background:'var(--grayL)',borderRadius:3}}>
                    <div style={{height:6,width:`${Math.min(100,Math.round(amt/total*100))}%`,background:'var(--navy)',borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isPremium&&(
            <button onClick={()=>setShowPremium(true)} style={{width:'100%',background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #F59E0B',borderRadius:16,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
              <div style={{width:40,height:40,borderRadius:20,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>👑</div>
              <div style={{textAlign:'left'}}><div style={{fontWeight:800,fontSize:14,color:'#92400E'}}>Upgrade to Premium</div><div style={{fontSize:12,color:'#B45309',marginTop:2}}>Full analytics, email sync, 7-day planning</div></div>
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
          {[['👤','Name',profile.name||'—'],['📍','City',profile.city],['🥗','Diet',`${profile.isVeg?'Vegetarian':'Omnivore'}${profile.eatsEggs?' + eggs':''}`],['👨‍👩‍👧','Family',`${profile.familySize} people${profile.hasToddler?` · ${profile.toddlerName} safety ON`:''}`]].map(([ic,lb,val],i,arr)=>(
            <div key={lb} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:i<arr.length-1?'1px solid var(--border)':'none'}}>
              <div style={{width:34,height:34,borderRadius:10,background:'var(--grayL)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{ic}</div>
              <div style={{flex:1}}><div style={{fontSize:11,color:'var(--gray)'}}>{lb}</div><div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{val}</div></div>
            </div>
          ))}
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
            <h2 style={{fontSize:22,fontWeight:900,color:'var(--ink)',letterSpacing:-.4}}>Mise Premium</h2>
            <p style={{fontSize:13,color:'var(--gray)',marginTop:4}}>Your fridge, your meals, on autopilot.</p>
          </div>
          <div style={{background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'2px solid #F59E0B',borderRadius:16,padding:'14px 16px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div><span style={{fontSize:34,fontWeight:900,color:'#92400E'}}>₹299</span><span style={{fontSize:14,color:'#B45309',fontWeight:600}}>/month</span></div>
            <div style={{textAlign:'right'}}><p style={{fontSize:12,color:'#B45309',fontWeight:700}}>7-day free trial</p><p style={{fontSize:11,color:'#D97706'}}>Cancel anytime</p></div>
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
          <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:12,padding:14,marginBottom:16}}>
            <p style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:8}}>💡 The math</p>
            <p style={{fontSize:12,color:'var(--inkM)',lineHeight:1.7}}>One unnecessary Swiggy/Deliveroo order = ₹600–800. Mise costs <strong>₹299/month</strong>. Stop one delivery order and the app pays for itself.</p>
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

      {/* Toast */}
      {toast&&<div style={{position:'absolute',bottom:100,left:'50%',transform:'translateX(-50%)',background:'#111827',color:'#fff',padding:'10px 18px',borderRadius:24,fontSize:13,fontWeight:700,zIndex:200,whiteSpace:'nowrap',animation:'fadeIn .2s'}}>{toast}</div>}
    </div>
  );
}
