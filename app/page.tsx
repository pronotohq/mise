'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────
interface PantryItem {
  id: string; name: string; emoji: string; cat: string;
  qty: number; unit: string; price: number;
  expiry: string; expDays: number; src: string;
  addedAt?: string;
}
interface FamilyMember { id: number; name: string; role: string; age: number; avatar: string; }
interface Meal {
  id: string; name: string; emoji: string; time_minutes: number;
  servings: number; calories: number; protein: number; carbs: number; fat: number; fibre: number;
  kid_safe: boolean; uses_expiring: boolean;
  ingredients_used: {name: string; qty: string}[];
  steps: string[]; notes: string;
}
interface Profile {
  name: string; city: string; isVeg: boolean; eatsEggs: boolean;
  hasToddler: boolean; toddlerName: string; toddlerAge: number;
  childMode?: 'none' | 'toddler' | 'kid';
  childName?: string;
  childAge?: number;
  familySize: number; allergies: string[];
  notifTimes: Record<string, string>;
  cuisines: string[];
  safetyFilters?: string[];
}
interface CookLog { id: string; name: string; period: string; date: string; }
interface ItemLog  {
  id: string;
  name: string;
  emoji: string;
  price: number;
  date: string;
  qty?: number;
  unit?: string;
  cat?: string;
  daysRemaining?: number;
  expDays?: number;
}
interface Region   { symbol: string; avgTakeout: number; groceryApps: string[]; monthlyPrice: string; monthlyPriceNum: number; avgOrderSize: number; priceMultiplier: number; }
type MarketPriceBasis = 'item' | 'kg' | '100g' | 'liter' | '100ml' | 'dozen' | 'pack';
interface MarketPriceEntry { amount: number; basis: MarketPriceBasis; }

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
  return DEFAULT_REGION;
}

function inferRegionCodeFromProfile(profile: Profile): string {
  const city = (profile.city || '').trim().toLowerCase();
  if (!city) return 'IN';
  if (['mumbai','delhi','bangalore','bengaluru','hyderabad','chennai','pune'].includes(city)) return 'IN';
  if (['singapore'].includes(city)) return 'SG';
  if (['london','manchester'].includes(city)) return 'GB';
  if (['sydney','melbourne'].includes(city)) return 'AU';
  if (['dubai','abu dhabi'].includes(city)) return 'AE';
  if (['kuala lumpur'].includes(city)) return 'MY';
  if (['toronto','vancouver'].includes(city)) return 'CA';
  if (['new york','san francisco','seattle','austin','los angeles'].includes(city)) return 'US';
  return 'IN';
}

function inferCityFromTimeZone(timeZone: string): string {
  const tz = timeZone || '';
  const cityMap: Record<string, string> = {
    'Asia/Singapore': 'Singapore',
    'Europe/London': 'London',
    'Asia/Dubai': 'Dubai',
    'Asia/Kuala_Lumpur': 'Kuala Lumpur',
    'America/Toronto': 'Toronto',
    'America/Vancouver': 'Vancouver',
    'America/New_York': 'New York',
    'America/Los_Angeles': 'Los Angeles',
    'America/Chicago': 'Austin',
    'America/Denver': 'Seattle',
    'Australia/Sydney': 'Sydney',
    'Australia/Melbourne': 'Melbourne',
    'Asia/Kolkata': 'Mumbai',
    'Asia/Calcutta': 'Mumbai',
  };
  return cityMap[tz] ?? '';
}

function detectBrowserLocation(): {regionCode: string; city: string} {
  if (typeof navigator === 'undefined' || typeof Intl === 'undefined') {
    return { regionCode: 'IN', city: '' };
  }
  const locale = (navigator.language || 'en-IN').toUpperCase();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const city = inferCityFromTimeZone(timeZone);

  if (locale.includes('-US') || timeZone.startsWith('America/')) return { regionCode: 'US', city };
  if (locale.includes('-SG') || timeZone === 'Asia/Singapore') return { regionCode: 'SG', city: city || 'Singapore' };
  if (locale.includes('-GB') || timeZone.startsWith('Europe/London')) return { regionCode: 'GB', city: city || 'London' };
  if (locale.includes('-AU') || timeZone.startsWith('Australia/')) return { regionCode: 'AU', city };
  if (locale.includes('-AE') || timeZone === 'Asia/Dubai') return { regionCode: 'AE', city: city || 'Dubai' };
  if (locale.includes('-MY') || timeZone === 'Asia/Kuala_Lumpur') return { regionCode: 'MY', city: city || 'Kuala Lumpur' };
  if (locale.includes('-CA') || timeZone.startsWith('America/Toronto') || timeZone.startsWith('America/Vancouver')) return { regionCode: 'CA', city };
  return { regionCode: 'IN', city };
}

function detectRegionCodeFromBrowser(): string {
  return detectBrowserLocation().regionCode;
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

// ── Real market prices by region (normalized by unit basis) ─────────────────
const MARKET_PRICE_GUIDE: Record<string, Record<string, MarketPriceEntry>> = {
  SG: {
    milk:{amount:4.5,basis:'liter'}, yogurt:{amount:3.2,basis:'pack'}, paneer:{amount:4.8,basis:'pack'}, cheese:{amount:5.5,basis:'pack'},
    egg:{amount:4.8,basis:'dozen'}, bread:{amount:3.6,basis:'pack'}, rice:{amount:4.5,basis:'kg'}, oats:{amount:4,basis:'kg'}, pasta:{amount:3.2,basis:'pack'},
    spinach:{amount:1.6,basis:'pack'}, lettuce:{amount:2.2,basis:'item'}, tomato:{amount:4,basis:'kg'}, cucumber:{amount:1.5,basis:'item'},
    carrot:{amount:2.4,basis:'kg'}, onion:{amount:2,basis:'kg'}, potato:{amount:2.8,basis:'kg'}, garlic:{amount:0.3,basis:'100g'},
    ginger:{amount:0.4,basis:'100g'}, banana:{amount:0.45,basis:'item'}, apple:{amount:1.2,basis:'item'}, mango:{amount:2.4,basis:'item'},
    cauliflower:{amount:3.2,basis:'item'}, broccoli:{amount:2.5,basis:'item'}, capsicum:{amount:1.8,basis:'item'},
    chicken:{amount:11,basis:'kg'}, fish:{amount:14,basis:'kg'}, prawn:{amount:18,basis:'kg'}, mutton:{amount:20,basis:'kg'},
    tofu:{amount:2.2,basis:'pack'}, juice:{amount:3,basis:'liter'}, tea:{amount:3,basis:'pack'}, coffee:{amount:6,basis:'pack'}, oil:{amount:4,basis:'liter'},
  },
  IN: {
    milk:{amount:62,basis:'liter'}, yogurt:{amount:50,basis:'pack'}, paneer:{amount:95,basis:'pack'}, cheese:{amount:140,basis:'pack'},
    egg:{amount:90,basis:'dozen'}, bread:{amount:40,basis:'pack'}, rice:{amount:70,basis:'kg'}, oats:{amount:120,basis:'kg'}, pasta:{amount:80,basis:'pack'},
    spinach:{amount:30,basis:'pack'}, lettuce:{amount:45,basis:'item'}, tomato:{amount:40,basis:'kg'}, cucumber:{amount:20,basis:'item'},
    carrot:{amount:40,basis:'kg'}, onion:{amount:30,basis:'kg'}, potato:{amount:28,basis:'kg'}, garlic:{amount:12,basis:'100g'},
    ginger:{amount:10,basis:'100g'}, banana:{amount:6,basis:'item'}, apple:{amount:28,basis:'item'}, mango:{amount:35,basis:'item'},
    cauliflower:{amount:45,basis:'item'}, broccoli:{amount:70,basis:'item'}, capsicum:{amount:12,basis:'item'},
    chicken:{amount:220,basis:'kg'}, fish:{amount:280,basis:'kg'}, prawn:{amount:420,basis:'kg'}, mutton:{amount:720,basis:'kg'},
    tofu:{amount:60,basis:'pack'}, juice:{amount:80,basis:'liter'}, tea:{amount:60,basis:'pack'}, coffee:{amount:200,basis:'pack'}, oil:{amount:160,basis:'liter'},
  },
  US: {
    milk:{amount:4,basis:'liter'}, yogurt:{amount:4,basis:'pack'}, paneer:{amount:6,basis:'pack'}, cheese:{amount:5,basis:'pack'},
    egg:{amount:4.2,basis:'dozen'}, bread:{amount:4,basis:'pack'}, rice:{amount:4,basis:'kg'}, oats:{amount:5,basis:'kg'}, pasta:{amount:2.8,basis:'pack'},
    spinach:{amount:3.5,basis:'pack'}, lettuce:{amount:2.5,basis:'item'}, tomato:{amount:4.4,basis:'kg'}, cucumber:{amount:1.3,basis:'item'},
    carrot:{amount:2.2,basis:'kg'}, onion:{amount:2.1,basis:'kg'}, potato:{amount:2.5,basis:'kg'}, garlic:{amount:0.5,basis:'100g'},
    ginger:{amount:0.7,basis:'100g'}, banana:{amount:0.3,basis:'item'}, apple:{amount:1.2,basis:'item'}, mango:{amount:1.8,basis:'item'},
    cauliflower:{amount:3.8,basis:'item'}, broccoli:{amount:2.4,basis:'item'}, capsicum:{amount:1.6,basis:'item'},
    chicken:{amount:8,basis:'kg'}, fish:{amount:13,basis:'kg'}, prawn:{amount:19,basis:'kg'}, mutton:{amount:16,basis:'kg'},
    tofu:{amount:2.5,basis:'pack'}, juice:{amount:3.5,basis:'liter'}, tea:{amount:4,basis:'pack'}, coffee:{amount:8,basis:'pack'}, oil:{amount:8,basis:'liter'},
  },
  GB: {
    milk:{amount:1.6,basis:'liter'}, yogurt:{amount:1.8,basis:'pack'}, paneer:{amount:3.2,basis:'pack'}, cheese:{amount:4,basis:'pack'},
    egg:{amount:2.6,basis:'dozen'}, bread:{amount:1.5,basis:'pack'}, rice:{amount:2.3,basis:'kg'}, oats:{amount:2,basis:'kg'}, pasta:{amount:1.5,basis:'pack'},
    spinach:{amount:1.3,basis:'pack'}, lettuce:{amount:1.2,basis:'item'}, tomato:{amount:3,basis:'kg'}, cucumber:{amount:0.7,basis:'item'},
    carrot:{amount:1.2,basis:'kg'}, onion:{amount:1,basis:'kg'}, potato:{amount:1.2,basis:'kg'}, garlic:{amount:0.35,basis:'100g'},
    ginger:{amount:0.45,basis:'100g'}, banana:{amount:0.2,basis:'item'}, apple:{amount:0.7,basis:'item'}, mango:{amount:1.8,basis:'item'},
    cauliflower:{amount:1.9,basis:'item'}, broccoli:{amount:1,basis:'item'}, capsicum:{amount:0.8,basis:'item'},
    chicken:{amount:7,basis:'kg'}, fish:{amount:11,basis:'kg'}, prawn:{amount:12,basis:'kg'}, mutton:{amount:13,basis:'kg'},
    tofu:{amount:2,basis:'pack'}, juice:{amount:2,basis:'liter'}, tea:{amount:2,basis:'pack'}, coffee:{amount:4,basis:'pack'}, oil:{amount:4,basis:'liter'},
  },
};
const MARKET_NAME_ALIASES: Record<string, string> = {
  doodh:'milk', dahi:'yogurt', curd:'yogurt', thakkali:'tomato', tamatar:'tomato', aloo:'potato',
  pyaaz:'onion', pyaz:'onion', adrak:'ginger', lehsun:'garlic', gobi:'cauliflower', 'phool gobi':'cauliflower',
  'patta gobhi':'cauliflower', 'pata gobhi':'cauliflower', muttakose:'cabbage', muttaikose:'cabbage',
  cauliflower:'cauliflower', capsicum:'capsicum', 'shimla mirch':'capsicum', bhindi:'okra', vendakkai:'okra',
  spinach:'spinach', keerai:'spinach', saag:'spinach', paneer:'paneer', anda:'egg', eggs:'egg',
  chawal:'rice', atta:'flour', maida:'flour', tel:'oil', 'chicken breast':'chicken', 'fish fillet':'fish',
};
function normalizeMarketName(name: string): string {
  const lc = name.toLowerCase().trim();
  const direct = Object.keys(MARKET_NAME_ALIASES).sort((a,b)=>b.length-a.length).find(key => lc.includes(key));
  if (direct) return MARKET_NAME_ALIASES[direct];
  return lc;
}
function convertToPriceBasis(qty: number, unit: string, basis: MarketPriceBasis): number {
  const normalizedUnit = unit.toLowerCase();
  if (basis === 'pack') {
    if (['pack', 'packet', 'box', 'loaf', 'bunch'].includes(normalizedUnit)) return qty;
    if (normalizedUnit === 'pcs') return Math.max(qty, 1);
    // For weighted/liquid units sold as a pack in our price guide, treat it as one retail pack.
    if (['g', 'kg', 'ml', 'l'].includes(normalizedUnit)) return 1;
    return Math.max(qty, 1);
  }
  if (basis === 'item') {
    if (normalizedUnit === 'pcs') return qty;
    if (normalizedUnit === 'bunch' || normalizedUnit === 'packet' || normalizedUnit === 'pack' || normalizedUnit === 'box' || normalizedUnit === 'loaf') return qty;
    return Math.max(qty, 1);
  }
  if (basis === 'kg') {
    if (normalizedUnit === 'kg') return qty;
    if (normalizedUnit === 'g') return qty / 1000;
    if (normalizedUnit === 'pcs') return Math.max(qty, 1);
  }
  if (basis === '100g') {
    if (normalizedUnit === 'g') return qty / 100;
    if (normalizedUnit === 'kg') return qty * 10;
    return Math.max(qty, 1);
  }
  if (basis === 'liter') {
    if (normalizedUnit === 'l') return qty;
    if (normalizedUnit === 'ml') return qty / 1000;
    return Math.max(qty, 1);
  }
  if (basis === '100ml') {
    if (normalizedUnit === 'ml') return qty / 100;
    if (normalizedUnit === 'l') return qty * 10;
    return Math.max(qty, 1);
  }
  if (basis === 'dozen') {
    if (normalizedUnit === 'dozen') return qty;
    if (normalizedUnit === 'pcs') return qty / 12;
    return Math.max(qty, 1);
  }
  return Math.max(qty, 1);
}
function estimateItemValue(name: string, qty: number, unit: string, regionCode: string): number {
  const guide = MARKET_PRICE_GUIDE[regionCode] ?? MARKET_PRICE_GUIDE.SG;
  const normalizedName = normalizeMarketName(name);
  const matchKey = Object.keys(guide).sort((a,b)=>b.length-a.length).find(key => normalizedName.includes(key));
  if (!matchKey) {
    const baselineByUnit = unit.toLowerCase() === 'kg' ? 4 : unit.toLowerCase() === 'l' ? 3 : 1.5;
    return Math.max(0.5, Math.round(baselineByUnit * Math.max(qty, 1) * 100) / 100);
  }
  const entry = guide[matchKey];
  const multiplier = convertToPriceBasis(qty || 1, unit || 'pcs', entry.basis);
  return Math.max(0.25, Math.round(entry.amount * Math.max(multiplier, 0.25) * 100) / 100);
}
function getMarketPrice(name: string, regionCode: string, priceMultiplier: number, qty = 1, unit = 'pcs'): number {
  const value = estimateItemValue(name, qty, unit, regionCode);
  if (Number.isFinite(value) && value > 0) return value;
  return Math.max(0.5, Math.round((2 / Math.max(priceMultiplier, 0.01)) * 100) / 100);
}
// Keep estimatePrice as alias for backwards compat
function estimatePrice(name: string, priceMultiplier: number, regionCode?: string, qty = 1, unit = 'pcs'): number {
  return getMarketPrice(name, regionCode ?? 'SG', priceMultiplier, qty, unit);
}

// ── Regional buy links ────────────────────────────────────────────────────────
function getBuyLinks(regionCode: string): {app:string; url:(q:string)=>string; emoji:string; color:string}[] {
  const enc = (q:string) => encodeURIComponent(q);
  const links: Record<string, {app:string; url:(q:string)=>string; emoji:string; color:string}[]> = {
    SG: [
      { app:'FoodPanda', url:(q)=>`https://www.foodpanda.sg/groceries/search?q=${enc(q)}`, emoji:'🐼', color:'#E91E8C' },
      { app:'GrabMart',  url:(q)=>`https://mart.grab.com/sg/search?query=${enc(q)}`,       emoji:'🟢', color:'#00B14F' },
    ],
    IN: [
      { app:'Blinkit',   url:(q)=>`https://blinkit.com/s/?q=${enc(q)}`,                    emoji:'🟡', color:'#F8C200' },
      { app:'Swiggy',    url:(q)=>`https://www.swiggy.com/instamart/search?query=${enc(q)}`,emoji:'🟠', color:'#FC8019' },
      { app:'Zepto',     url:(q)=>`https://www.zeptonow.com/search?query=${enc(q)}`,        emoji:'🟣', color:'#7B2FBE' },
    ],
    US: [
      { app:'Instacart', url:(q)=>`https://www.instacart.com/products/search?q=${enc(q)}`,  emoji:'🛒', color:'#43B02A' },
      { app:'Amazon',    url:(q)=>`https://www.amazon.com/s?k=${enc(q)}+grocery`,            emoji:'📦', color:'#FF9900' },
    ],
    GB: [
      { app:'Ocado',     url:(q)=>`https://www.ocado.com/search?entry=${enc(q)}`,            emoji:'🟣', color:'#5C2D91' },
      { app:'Tesco',     url:(q)=>`https://www.tesco.com/groceries/en-GB/search?query=${enc(q)}`, emoji:'🔵', color:'#00539F' },
    ],
    AU: [
      { app:'Woolworths',url:(q)=>`https://www.woolworths.com.au/shop/search/products?searchTerm=${enc(q)}`, emoji:'🟢', color:'#00833E' },
      { app:'Coles',     url:(q)=>`https://www.coles.com.au/search?q=${enc(q)}`,             emoji:'🔴', color:'#E2231A' },
    ],
    AE: [
      { app:'Noon',      url:(q)=>`https://www.noon.com/uae-en/search/?q=${enc(q)}`,         emoji:'🟡', color:'#FEEE00' },
      { app:'Talabat',   url:(q)=>`https://www.talabat.com/uae/groceries`,                   emoji:'🟠', color:'#FF6B00' },
    ],
    MY: [
      { app:'FoodPanda', url:(q)=>`https://www.foodpanda.my/groceries/search?q=${enc(q)}`,   emoji:'🐼', color:'#E91E8C' },
      { app:'GrabMart',  url:(q)=>`https://mart.grab.com/my/search?query=${enc(q)}`,          emoji:'🟢', color:'#00B14F' },
    ],
  };
  return links[regionCode] ?? links.SG;
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

const DEFAULT_SAFETY_FILTERS = ['Spicy food', 'Whole nuts', 'Raw honey', 'Raw fish / shellfish', 'Choking hazards', 'Excess salt'];
const SAFETY_FILTER_LIBRARY = [
  'Spicy food',
  'Whole nuts',
  'Raw honey',
  'Raw fish / shellfish',
  'Choking hazards',
  'Excess salt',
  'Whole grapes',
  'Popcorn',
  'Large raw carrot sticks',
  'Fizzy drinks',
  'Too much added sugar',
];

function getChildLabel(profile: Profile): string | null {
  if (profile.childMode === 'kid') return profile.childName || profile.toddlerName || 'Kid';
  if (profile.childMode === 'toddler' || profile.hasToddler) return profile.childName || profile.toddlerName || 'Little one';
  return null;
}

function buildFamilyMembers(profile: Profile): FamilyMember[] {
  const members: FamilyMember[] = [
    {id:1,name:profile.name||'You',role:'Adult',age:30,avatar:'👤'},
  ];
  if((profile.childMode ?? 'none') !== 'none') {
    members.push({
      id:2,
      name:getChildLabel(profile)||'Little one',
      role:profile.childMode === 'kid' ? 'Kid' : 'Toddler',
      age:profile.childAge ?? profile.toddlerAge,
      avatar:'👶'
    });
  }
  return members;
}

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

function isLiquidItem(name: string, unit?: string, cat?: string): boolean {
  const lc = name.toLowerCase();
  if (cat === 'Beverages') return true;
  if (unit && ['l', 'ml'].includes(unit.toLowerCase())) return true;
  return ['milk','juice','water','doodh','paal','susu','lassi','smoothie','tea','teh','coffee','kopi','oil','broth','soup','stock'].some(l => lc.includes(l));
}

function getUrgencyLevel(item: PantryItem): 'urgent' | 'soon' | 'fresh' {
  const remaining = daysLeft(item.expiry);
  const dynamicSoonThreshold = Math.min(4, Math.max(2, Math.ceil((item.expDays || getShelfDays(item.name)) * 0.45)));
  if (remaining <= 1) return 'urgent';
  if (remaining <= dynamicSoonThreshold) return 'soon';
  return 'fresh';
}

// ── Consume verb helper (for markUsed toast) ──────────────────────
function consumeVerb(name: string, unit?: string, cat?: string): string {
  return isLiquidItem(name, unit, cat) ? 'Consumed' : 'Finished';
}

function shouldUseSmartVoiceDefault(
  itemName: string,
  category: string | undefined,
  qty: number,
  unit: string,
  source: string | undefined,
): boolean {
  if (!source || !['🎙️', '✏️'].includes(source)) return false;
  if (qty !== 1 || unit.toLowerCase() !== 'pcs') return false;
  const commonBulkProduce = ['tomato', 'tomatoes', 'onion', 'potato', 'banana', 'spinach', 'cabbage', 'cauliflower', 'gobi', 'patta gobhi', 'lettuce'];
  const normalized = itemName.toLowerCase();
  return category === 'Produce' && commonBulkProduce.some(item => normalized.includes(item));
}

function getLoggedValue(
  entry: {name: string; price?: number; qty?: number; unit?: string},
  regionCode: string,
  region: Region,
): number {
  if (entry.qty && entry.unit) {
    return estimateItemValue(entry.name, entry.qty, entry.unit, regionCode);
  }
  if (entry.price && entry.price > 0) return entry.price;
  return getMarketPrice(entry.name, regionCode, region.priceMultiplier, entry.qty ?? 1, entry.unit ?? 'pcs');
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
  const urgency = getUrgencyLevel(item);
  const urgent = urgency === 'urgent';
  const badgeClass = urgency === 'urgent' ? 'pill pill-red' : urgency === 'soon' ? 'pill pill-amber' : 'pill pill-green';
  const badgeText = urgency === 'urgent' ? `Urgent · ${fmtDays(dl)}` : urgency === 'soon' ? `Soon · ${fmtDays(dl)}` : fmtDays(dl);
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--white)',border:`1.5px solid ${urgent?'#FCA5A540':'var(--border)'}`,borderRadius:14,padding:'11px 12px',marginBottom:8,cursor:'pointer'}}
      onClick={()=>onTap(item)}>
      <span style={{fontSize:24}}>{item.emoji}</span>
      <div style={{flex:1}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
          <span style={{fontWeight:800,fontSize:14,color:'var(--ink)'}}>{item.name}</span>
          <span className={badgeClass}>{badgeText}</span>
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
    hasToddler:false, toddlerName:'', toddlerAge:2, childMode:'none', childName:'', childAge:2, familySize:2, allergies:[],
    notifTimes:{breakfast:'07:30',lunch:'11:30',snack:'16:00',dinner:'17:30'},
    cuisines:[],
    safetyFilters: DEFAULT_SAFETY_FILTERS,
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
  const [regionCode, setRegionCode] = useState<string>('IN');
  const [storePromptRegionCode, setStorePromptRegionCode] = useState<string>('IN');
  useEffect(()=>{
    const profileRegionCode = inferRegionCodeFromProfile(profile);
    const browserLocation = detectBrowserLocation();
    const nextRegionCode = profile.city?.trim() ? profileRegionCode : browserLocation.regionCode;
    setRegionCode(nextRegionCode);
    setRegion(REGIONS[nextRegionCode] ?? detectRegion());
  },[profile.city]);
  useEffect(()=>{
    const profileRegionCode = inferRegionCodeFromProfile(profile);
    if (profile.city?.trim()) {
      setStorePromptRegionCode(profileRegionCode);
      return;
    }
    setStorePromptRegionCode(detectBrowserLocation().regionCode);
  },[profile.city]);
  const fmt = (n:number) => `${region.symbol}${n.toLocaleString(undefined,{maximumFractionDigits:0})}`;

  // ── UI state ────────────────────────────────────────────────────
  const [tab, setTab] = useState('fridge');
  const [obStep, setObStep] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [period, setPeriod] = useState('dinner');
  const [mealMode, setMealMode] = useState<'default' | 'rescue'>('default');
  const [meals, setMeals] = useState<Record<string,Meal[]>>({});
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [cooking, setCooking] = useState<Meal|null>(null);
  const [cookStep, setCookStep] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [editExpiry, setEditExpiry] = useState<PantryItem|null>(null);
  const [editQty, setEditQty] = useState('');
  const [newExpiryDays, setNewExpiryDays] = useState('');
  const [customSafetyFilter, setCustomSafetyFilter] = useState('');
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
  const [showPasteEmail, setShowPasteEmail] = useState(false);
  const [pasteEmailText, setPasteEmailText] = useState('');
  const [pasteEmailLoading, setPasteEmailLoading] = useState(false);
  const [autoSyncInterest, setAutoSyncInterest] = useState(false);
  const [gmailFilterDone, setGmailFilterDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState(false);
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
        if(d.profile)  setProfile({
          ...d.profile,
          childMode: d.profile.childMode ?? (d.profile.hasToddler ? 'toddler' : 'none'),
          childName: d.profile.childName ?? d.profile.toddlerName ?? '',
          childAge: d.profile.childAge ?? d.profile.toddlerAge ?? 2,
          safetyFilters: d.profile.safetyFilters ?? DEFAULT_SAFETY_FILTERS,
        });
        if(d.family)   setFamily(d.family);
        if(d.pantry)   setPantry(d.pantry.map((item: PantryItem) => ({ ...item, addedAt: item.addedAt ?? new Date().toISOString() })));
        if(d.cookLog)  setCookLog(d.cookLog);
        if(d.wasteLog) setWasteLog(d.wasteLog);
        if(d.ateLog)   setAteLog(d.ateLog);
        if(d.isPremium) setIsPremium(true);
        if(d.purchaseHistory) setPurchaseHistory(d.purchaseHistory);
        if(d.syncEmail)  { setSyncEmail(d.syncEmail);  }
        if(d.syncUserId) { setSyncUserId(d.syncUserId); }
        if(d.syncLog)    { setSyncLog(d.syncLog); }
        if(d.autoSyncInterest) setAutoSyncInterest(true);
        if(d.gmailFilterDone) setGmailFilterDone(true);
        if(d.cookedTimestamps) setCookedTimestamps(d.cookedTimestamps);
      }
    } catch{}
  },[]);

  // ── Save to localStorage ────────────────────────────────────────
  const save = useCallback((updates: Partial<{onboardingDone:boolean;profile:Profile;family:FamilyMember[];pantry:PantryItem[];cookLog:CookLog[];wasteLog:ItemLog[];ateLog:ItemLog[];isPremium:boolean;purchaseHistory:PurchaseRecord[];syncEmail:string;syncUserId:string;syncLog:{store:string;count:number;syncedAt:string;items:string[]}[];autoSyncInterest:boolean;cookedTimestamps:Record<string,string>}>)=>{
    try {
      const current = JSON.parse(localStorage.getItem('mise_v1')||'{}');
      localStorage.setItem('mise_v1', JSON.stringify({...current,...updates}));
    } catch{}
  },[]);

  useEffect(()=>{
    if (profile.city?.trim()) return;
    const browserLocation = detectBrowserLocation();
    if (!browserLocation.city) return;
    setProfile(prev => {
      if (prev.city?.trim()) return prev;
      const next = { ...prev, city: browserLocation.city };
      save({ profile: next });
      return next;
    });
  },[profile.city, save]);

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
        const refillItem = pantry.find(i => {
          const addedAt = i.addedAt ? new Date(i.addedAt).getTime() : 0;
          const daysSinceAdded = addedAt ? Math.floor((Date.now() - addedAt) / 86400000) : 0;
          return daysSinceAdded >= 3 && ['milk','egg','eggs','tomato','tomatoes','banana','onion','bread','paneer'].some(k => i.name.toLowerCase().includes(k));
        });
        const body = expiring.length
          ? `Use ${expiring[0]} before it expires — tap to see what to cook.`
          : refillItem
            ? `You bought ${refillItem.name} a few days ago — time to refill soon.`
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
      // Read userId directly from localStorage to avoid stale state
      let uid_: string;
      try {
        const stored = JSON.parse(localStorage.getItem('mise_v1') || '{}');
        uid_ = stored.syncUserId || '';
      } catch { uid_ = ''; }

      if (!uid_) {
        uid_ = 'user_' + uid();
        setSyncUserId(uid_);
        // Write immediately before the fetch
        try {
          const cur = JSON.parse(localStorage.getItem('mise_v1') || '{}');
          localStorage.setItem('mise_v1', JSON.stringify({...cur, syncUserId: uid_}));
        } catch {}
      }

      const res = await fetch('/api/inbound-email/generate', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({userId: uid_}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.inboundEmail) {
        setSyncEmail(data.inboundEmail);
        // Write directly to localStorage so it persists immediately
        try {
          const cur = JSON.parse(localStorage.getItem('mise_v1') || '{}');
          localStorage.setItem('mise_v1', JSON.stringify({...cur, syncEmail: data.inboundEmail, syncUserId: uid_}));
        } catch {}
        return data.inboundEmail as string;
      }
      showToast('Could not generate address — try again');
    } catch (e) {
      console.error('[getOrCreateSyncEmail]', e);
      showToast('Could not generate address — try again');
    } finally {
      setSyncLoading(false);
    }
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

  // ── Auto-sync: check for pending items on every open/focus (throttled to 2 min) ─────────────
  useEffect(() => {
    const checkPending = async () => {
      const uid_ = syncUserId;
      if (!uid_ || !syncEmail) return;
      // Throttle: at most once every 2 minutes to avoid hammering KV
      const lastCheck = parseInt(localStorage.getItem('lastSyncCheckTs') || '0');
      if (Date.now() - lastCheck < 2 * 60 * 1000) return;
      localStorage.setItem('lastSyncCheckTs', Date.now().toString());
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

  // ── Import from pasted email text (direct webhook call → items from response) ──
  const importFromEmailText = async () => {
    if (!pasteEmailText.trim() || !syncUserId) return;
    setPasteEmailLoading(true);
    try {
      const res = await fetch('/api/inbound-email/webhook', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          userId: syncUserId,
          from: 'order@grab.com',
          to: syncEmail,
          subject: 'Your order has been delivered',
          text: pasteEmailText,
          html: '',
        }),
      });
      const data = await res.json();
      if (data.status === 'success' && data.items?.length) {
        addItems(data.items, {src: `📧 ${data.store || 'Email sync'}`});
        const entry = {store: data.store||'Email', count:data.items.length, syncedAt:new Date().toISOString(), items:data.items.slice(0,5).map((i:{item_name:string})=>i.item_name)};
        const newLog = [entry,...syncLog].slice(0,10);
        setSyncLog(newLog);
        save({syncLog:newLog});
        showToast(`🎉 ${data.items.length} items added from ${data.store||'email'}!`);
        setPasteEmailText('');
        setShowPasteEmail(false);
      } else if (data.status === 'skipped') {
        showToast('Looks like a restaurant order — skipped');
      } else {
        showToast('Could not parse items from that email');
      }
    } catch (e) {
      console.error('[importFromEmailText]', e);
      showToast('Import failed — try again');
    } finally {
      setPasteEmailLoading(false);
    }
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
  const OB_STEPS = ['welcome','family','diet','cuisine','paths','notifications','payment','done'];
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
    const fam = buildFamilyMembers(profile);
    setFamily(fam);
    save({onboardingDone:true,profile,family:fam,pantry:demo});
  };

  const updateProfileSettings = useCallback((updater: (prev: Profile) => Profile) => {
    setProfile(prev => {
      const next = updater(prev);
      const nextFamily = buildFamilyMembers(next);
      setFamily(nextFamily);
      save({ profile: next, family: nextFamily });
      return next;
    });
  }, [save]);

  const registerAutoSyncInterest = useCallback(() => {
    setAutoSyncInterest(true);
    save({ autoSyncInterest: true });
    showToast('Added to the auto-sync waitlist');
  }, [save]);

  // ── Add items to pantry ─────────────────────────────────────────
  // opts.interactive = true shows the voice quick-adjust toast
  const addItems = useCallback((
    items: {item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string;price?:number}[],
    opts?: {interactive?: boolean; src?: string}
  ) => {
    const newItems: PantryItem[] = items.map(i=>{
      const days = getShelfDays(i.item_name);
      const hist = getHistoricalDefault(i.item_name, purchaseHistory);
      const categoryDefault = getCategoryDefault(i.item_name);

      // Qty resolution: explicit → history mode → category standard → 1pcs
      let resolvedQty  = i.quantity;
      let resolvedUnit = i.unit;
      const shouldOverridePlaceholder = shouldUseSmartVoiceDefault(
        i.item_name,
        i.category,
        resolvedQty ?? 1,
        resolvedUnit ?? 'pcs',
        opts?.src,
      );
      if (!resolvedQty || shouldOverridePlaceholder) {
        if (hist) { resolvedQty = hist.qty; resolvedUnit = hist.unit; }
        else {
          resolvedQty  = categoryDefault.qty;
          resolvedUnit = categoryDefault.unit;
        }
      } else if (!resolvedUnit) {
        resolvedUnit = categoryDefault.unit;
      }

      return {
        id: uid(),
        name:    i.item_name,
        emoji:   i.emoji || getEmoji(i.item_name),
        cat:     i.category || 'Other',
        qty:     resolvedQty!,
        unit:    resolvedUnit!,
        price:   (i.price && i.price > 0) ? i.price : estimateItemValue(i.item_name, resolvedQty!, resolvedUnit!, regionCode),
        expiry:  expiryDate(days),
        expDays: days,
        src:     opts?.src ?? '🎙️',
        addedAt: new Date().toISOString(),
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
  },[save, purchaseHistory, regionCode]);

  // ── Add kitchen essentials (one-tap) ────────────────────────────
  const addEssentials = () => {
    const items: PantryItem[] = ESSENTIALS.map(e => ({
      id: uid(), name: e.name, emoji: e.emoji, cat: e.cat,
      qty: e.qty, unit: e.unit, price: 0,
      expiry: expiryDate(365), expDays: 365, src: '🧂', addedAt: new Date().toISOString(),
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
          setMealMode('default');
          generateMeals('dinner', true, 'default');
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
      rec.lang = navigator.languages?.[0] || navigator.language || '';   // follow device locale for Tamil, Malay, Singlish, etc.
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
      fd.append('lang', navigator.languages?.[0] || navigator.language || 'en');
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
      fd.append('lang', navigator.languages?.[0] || navigator.language || 'en');
      const res  = await fetch('/api/transcribe', {method:'POST',body:fd});
      const data = await res.json();
      if(data.items?.length) addItems(data.items, {interactive:true, src:'✏️'});
      else showToast('Nothing recognised — try again');
    } catch { showToast('Parse error'); }
  };

  const submitManualText = async () => {
    if(!manualText.trim()) return;
    setManualLoading(true);
    await parseText(manualText.trim());
    setManualText('');
    setManualLoading(false);
  };

  // ── Generate meals ──────────────────────────────────────────────
  const generateMeals = useCallback(async (p: string, force=false, mode: 'default' | 'rescue' = mealMode) => {
    const cacheKey = `${p}:${mode}`;
    if(meals[cacheKey] && !force) return;
    setLoadingMeals(true);
    try {
      const threeDaysAgo = Date.now() - (3 * 86400000);
      const recentlyCooked = cookLog
        .filter(l => new Date(l.date).getTime() >= threeDaysAgo)
        .map(l => `${l.name} (${l.period})`);
      const res  = await fetch('/api/meals', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({pantry, period:p, dietary:profile, recentlyCooked, mode}),
      });
      const data = await res.json();
      if(data.meals?.length) setMeals(m=>({...m,[cacheKey]:data.meals}));
    } catch { showToast('Could not generate meals'); }
    finally { setLoadingMeals(false); }
  },[pantry, cookLog, profile, meals, mealMode]);

  useEffect(()=>{ if(tab==='meals') generateMeals(period, false, mealMode); },[tab,period,mealMode]);

  // ── Pantry helpers ──────────────────────────────────────────────
  const markUsed=(id:string, partialQty?: number)=>{
    setConfetti(true); setTimeout(()=>setConfetti(false),2200);
    const item = pantry.find(i=>i.id===id);
    if(!item) return;
    let updatedPantry: PantryItem[];
    let updatedAte: ItemLog[];
    const consumedQty = partialQty !== undefined && partialQty > 0 && partialQty < item.qty ? partialQty : item.qty;
    const consumedValue = estimateItemValue(item.name, consumedQty, item.unit, regionCode);
    if(partialQty !== undefined && partialQty > 0 && partialQty < item.qty) {
      // Reduce quantity only
      const remaining = Math.round((item.qty - partialQty) * 100) / 100;
      updatedPantry = pantry.map(i=>i.id===id ? {...i, qty: remaining} : i);
      updatedAte = [...ateLog, {
        id:uid(), name:item.name, emoji:item.emoji, price: consumedValue, date: new Date().toISOString(),
        qty: consumedQty, unit: item.unit, cat: item.cat, daysRemaining: daysLeft(item.expiry), expDays: item.expDays,
      }];
    } else {
      // Remove entirely
      updatedPantry = pantry.filter(i=>i.id!==id);
      updatedAte = [...ateLog, {
        id:uid(), name:item.name, emoji:item.emoji, price: consumedValue, date: new Date().toISOString(),
        qty: consumedQty, unit: item.unit, cat: item.cat, daysRemaining: daysLeft(item.expiry), expDays: item.expDays,
      }];
    }
    setPantry(updatedPantry); setAteLog(updatedAte);
    save({pantry:updatedPantry,ateLog:updatedAte});
    showToast(`${consumeVerb(item.name, item.unit, item.cat)} ${item.name} ✓`);
  };
  const markWasted=(id:string)=>{
    const item = pantry.find(i=>i.id===id);
    const updatedPantry = pantry.filter(i=>i.id!==id);
    const updatedWaste = item ? [...wasteLog,{
      id:uid(),
      name:item.name,
      emoji:item.emoji,
      price:estimateItemValue(item.name, item.qty, item.unit, regionCode),
      date:new Date().toISOString(),
      qty:item.qty,
      unit:item.unit,
      cat:item.cat,
      daysRemaining: daysLeft(item.expiry),
      expDays: item.expDays,
    }] : wasteLog;
    setPantry(updatedPantry); setWasteLog(updatedWaste);
    save({pantry:updatedPantry,wasteLog:updatedWaste});
  };
  const openEditItem = (item: PantryItem) => {
    setEditExpiry(item);
    setEditQty(String(item.qty));
    setNewExpiryDays(String(item.expDays));
  };
  const applyExpiryEdit=()=>{
    if(!editExpiry) return;
    const qty = parseFloat(editQty);
    const d = parseInt(newExpiryDays);
    if(isNaN(d) || Number.isNaN(qty) || qty <= 0) return;
    const updated = pantry.map(i=>i.id===editExpiry.id
      ? {...i, qty, expiry:expiryDate(d), expDays:d, price:estimateItemValue(i.name, qty, i.unit, regionCode)}
      : i);
    setPantry(updated);
    save({pantry:updated});
    setEditExpiry(null);
    setEditQty('');
    setNewExpiryDays('');
    showToast('Saved changes ✓');
  };

  const deleteItem = (id: string) => {
    setPantry(p => { const updated = p.filter(i=>i.id!==id); save({pantry:updated}); return updated; });
    showToast('🗑 Item removed');
  };

  const toggleSafetyFilter = (filter: string) => {
    updateProfileSettings(prev => {
      const currentFilters = prev.safetyFilters ?? DEFAULT_SAFETY_FILTERS;
      const nextFilters = currentFilters.includes(filter)
        ? currentFilters.filter(item => item !== filter)
        : [...currentFilters, filter];
      return { ...prev, safetyFilters: nextFilters };
    });
  };

  const addCustomSafetyFilter = () => {
    const value = customSafetyFilter.trim();
    if (!value) return;
    if (!(profile.safetyFilters ?? DEFAULT_SAFETY_FILTERS).includes(value)) {
      toggleSafetyFilter(value);
    }
    setCustomSafetyFilter('');
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
  const urgent   = sortedPantry.filter(i=>getUrgencyLevel(i)==='urgent');
  const expiring = sortedPantry.filter(i=>getUrgencyLevel(i)==='soon');
  const fresh    = sortedPantry.filter(i=>getUrgencyLevel(i)==='fresh');
  const searched = search ? pantry.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())) : null;

  // ── Rescued value dashboard ────────────────────────────────────
  const rescuedValueThisMonth = (() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    return ateLog
      .filter(a => new Date(a.date) >= monthStart)
      .reduce((sum, entry) => sum + getLoggedValue(entry, regionCode, region), 0);
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

  // ── Module 5b: Refill Nudges — items expiring soon, time to restock ─
  const refillNudges = (() => {
    // Perishables expiring within 2 days — suggest buying again
    const COMMONLY_REFILLED = ['milk','eggs','egg','bread','curd','dahi','yogurt','spinach','tomato','tomatoes','banana','onion','potato','chicken','paneer','fish','vegetables','fruits'];
    return sortedPantry.filter(item => {
      const d = daysLeft(item.expiry);
      const lc = item.name.toLowerCase();
      return d >= 0 && d <= 2 && COMMONLY_REFILLED.some(k => lc.includes(k));
    }).slice(0, 3);
  })();

  // ── Recipe cooldown (4-day) filter ─────────────────────────────
  const fourDaysAgo = new Date(Date.now() - 4 * 86400000);
  const filterCooledMeals = (mealList: Meal[]) =>
    mealList.filter(m => {
      const ts = cookedTimestamps[m.name.toLowerCase()];
      return !ts || new Date(ts) < fourDaysAgo;
    });
  const storePromptApps = (REGIONS[storePromptRegionCode] ?? region).groceryApps.slice(0,2);

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
          <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',padding:'40px 28px',background:'linear-gradient(180deg,#FFFDF8 0%,#FFF7ED 100%)'}}>
            <div style={{fontSize:32,marginBottom:18}}>🍽️</div>
            <h1 style={{fontSize:34,fontWeight:900,color:'var(--ink)',letterSpacing:-1,marginBottom:12}}>FreshNudge</h1>
            <p style={{fontSize:17,fontWeight:800,color:'var(--ink)',lineHeight:1.4,marginBottom:10}}>Your fridge just got smarter.</p>
            <p style={{fontSize:14,color:'var(--gray)',lineHeight:1.7,marginBottom:34}}>Track what you buy and get instant recipes — so nothing goes to waste.</p>
            <button className="btn-primary" onClick={()=>setObStep(1)} style={{background:'#22C55E',fontSize:16,padding:16}}>Get started →</button>
            <p style={{fontSize:11,color:'#94A3B8',marginTop:18}}>Works offline · Your data stays on your device</p>
          </div>
        )}

        {step==='family'&&(
          <div style={{flex:1,padding:'24px 22px',background:'linear-gradient(180deg,#FFFDF8 0%,#FFF8EE 100%)'}}>
            <div style={{background:'linear-gradient(135deg,#FFF7ED,#FEF3C7)',border:'1.5px solid #FCD34D',borderRadius:24,padding:'20px 18px',marginBottom:16,boxShadow:'0 10px 24px rgba(245,158,11,.08)'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <div style={{width:48,height:48,borderRadius:16,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,boxShadow:'0 6px 16px rgba(15,23,42,.08)'}}>🍽️</div>
                <div>
                  <h2 style={{fontSize:24,fontWeight:900,color:'var(--ink)',letterSpacing:-.5,marginBottom:3}}>Set the table.</h2>
                  <p style={{fontSize:13,color:'#92400E'}}>Let&apos;s make FreshNudge feel like it already knows your home.</p>
                </div>
              </div>
              <div style={{background:'rgba(255,255,255,.75)',border:'1px solid rgba(251,191,36,.45)',borderRadius:16,padding:'14px 14px 12px'}}>
                <p style={{fontSize:12,fontWeight:800,color:'#B45309',letterSpacing:.4,marginBottom:8}}>WHAT SHOULD WE CALL YOU?</p>
                <input
                  type="text"
                  value={profile.name}
                  onChange={e=>setProfile(p=>({...p,name:e.target.value}))}
                  placeholder="Your first name"
                  style={{width:'100%',border:'1.5px solid #FCD34D',background:'#fff',fontWeight:700,fontSize:16,borderRadius:14,padding:'14px 16px',boxShadow:'inset 0 1px 0 rgba(255,255,255,.7)'}}
                />
              </div>
            </div>

            <div style={{background:'#fff',border:'1.5px solid #E5E7EB',borderRadius:22,padding:'18px 16px',marginBottom:14,boxShadow:'0 8px 22px rgba(15,23,42,.05)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <div style={{width:38,height:38,borderRadius:14,background:'#EEF2FF',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>🏠</div>
                <div>
                  <p style={{fontSize:15,fontWeight:800,color:'var(--ink)'}}>How many are you cooking for?</p>
                  <p style={{fontSize:12,color:'var(--gray)',marginTop:2}}>Portions and meal ideas will scale to your household.</p>
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                {[1,2,3,4,'5+'].map(n=>(
                  <button key={n} onClick={()=>setProfile(p=>({...p,familySize:typeof n==='number'?n:5}))}
                    style={{flex:1,background:profile.familySize===(typeof n==='number'?n:5)?'linear-gradient(135deg,#EEF2FF,#DBEAFE)':'#F8FAFC',border:`1.5px solid ${profile.familySize===(typeof n==='number'?n:5)?'#93C5FD':'#E5E7EB'}`,borderRadius:16,padding:'12px 0',textAlign:'center',fontSize:15,fontWeight:800,color:profile.familySize===(typeof n==='number'?n:5)?'var(--navy)':'var(--ink)',cursor:'pointer',fontFamily:'inherit',boxShadow:profile.familySize===(typeof n==='number'?n:5)?'0 8px 18px rgba(59,130,246,.12)':'none'}}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div style={{background:'linear-gradient(180deg,#FFFBEB 0%,#FFF7D6 100%)',border:'1.5px solid #FCD34D',borderRadius:22,padding:16,marginBottom:14,boxShadow:'0 8px 22px rgba(245,158,11,.08)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <div style={{width:40,height:40,borderRadius:14,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>👶</div>
                <div>
                  <p style={{fontSize:15,fontWeight:800,color:'#92400E'}}>Any little one at the table?</p>
                  <p style={{fontSize:12,color:'#B45309',marginTop:2}}>We&apos;ll adjust meal safety, spice, and serving style automatically.</p>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                {[
                  { id:'none', label:'No child' },
                  { id:'toddler', label:'Toddler' },
                  { id:'kid', label:'Kid' },
                ].map(option => (
                  <button
                    key={option.id}
                    onClick={()=>setProfile(p=>({
                      ...p,
                      childMode: option.id as Profile['childMode'],
                      hasToddler: option.id !== 'none',
                      childName: option.id === 'none' ? '' : (p.childName ?? p.toddlerName),
                      childAge: option.id === 'kid' ? Math.max(4, p.childAge ?? p.toddlerAge ?? 4) : 2,
                      toddlerName: option.id === 'none' ? '' : (p.childName ?? p.toddlerName),
                      toddlerAge: option.id === 'kid' ? Math.max(4, p.childAge ?? p.toddlerAge ?? 4) : 2,
                    }))}
                    style={{flex:1,background:(profile.childMode ?? 'none')===option.id?'#fff':'rgba(255,255,255,.55)',border:`1.5px solid ${(profile.childMode ?? 'none')===option.id?'#F59E0B':'#FCD34D'}`,borderRadius:14,padding:'11px 0',fontWeight:800,fontSize:13,color:'#92400E',cursor:'pointer',fontFamily:'inherit',boxShadow:(profile.childMode ?? 'none')===option.id?'0 8px 18px rgba(245,158,11,.14)':'none'}}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {(profile.childMode ?? 'none')!=='none'&&(
                <div style={{display:'flex',gap:8,marginTop:10}}>
                  <input type="text" placeholder="Name (e.g. Avya)" value={profile.childName ?? profile.toddlerName} onChange={e=>setProfile(p=>({...p,childName:e.target.value,toddlerName:e.target.value}))} style={{flex:2,background:'#fff',border:'1.5px solid #FCD34D',borderRadius:14,padding:'13px 14px'}}/>
                  <input type="number" placeholder="Age" value={profile.childAge ?? profile.toddlerAge ?? ''} onChange={e=>setProfile(p=>({...p,childAge:parseInt(e.target.value)||2,toddlerAge:parseInt(e.target.value)||2}))} style={{flex:1,textAlign:'center',background:'#fff',border:'1.5px solid #FCD34D',borderRadius:14,padding:'13px 10px'}}/>
                </div>
              )}
              {(profile.childMode ?? 'none')!=='none'&&(
                <div style={{border:'1px solid #FCD34D',borderRadius:16,padding:14,background:'rgba(255,255,255,.65)',marginTop:12}}>
                  <p style={{fontSize:14,fontWeight:800,color:'#92400E',marginBottom:4}}>👶 {getChildLabel(profile)}&apos;s safety filter</p>
                  <p style={{fontSize:12,color:'#B45309',marginBottom:12}}>You can edit this later in profile too.</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
                    {(profile.safetyFilters ?? DEFAULT_SAFETY_FILTERS).map(filter => (
                      <span key={filter} style={{background:'#FEF3C7',color:'#92400E',borderRadius:999,padding:'6px 10px',fontSize:12,fontWeight:700}}>• {filter}</span>
                    ))}
                  </div>
                  <p style={{fontSize:12,color:'#7C5B13',lineHeight:1.6}}>Every recipe suggestion checks these automatically, so mealtimes stay low-stress.</p>
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

            <div aria-disabled="true" style={{background:'#FFFBEB',border:'2px dashed #FCD34D',borderRadius:16,padding:'16px 14px',display:'flex',alignItems:'flex-start',gap:14,marginBottom:10,cursor:'default',opacity:.95}}>
              <div style={{width:48,height:48,borderRadius:14,background:'#FEF3C7',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>🛒</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:800,color:'#92400E'}}>Order → Fridge sync</div>
                <div style={{fontSize:12,color:'#B45309',marginTop:2}}>Coming soon. We&apos;re deciding which store integrations to build first.</div>
                <div style={{fontSize:11,color:'#B45309',marginTop:8}}>Would you want auto-sync for {storePromptApps.join(' + ')}?</div>
                <button
                  onClick={registerAutoSyncInterest}
                  disabled={autoSyncInterest}
                  style={{marginTop:8,background:autoSyncInterest?'#DCFCE7':'#fff',border:`1px solid ${autoSyncInterest?'#86EFAC':'#F59E0B'}`,borderRadius:999,padding:'7px 12px',fontSize:11,fontWeight:800,color:autoSyncInterest?'#15803D':'#B45309',cursor:autoSyncInterest?'default':'pointer',fontFamily:'inherit'}}
                >
                  {autoSyncInterest ? '✓ You asked for auto-sync' : 'Yes, count me in'}
                </button>
              </div>
            </div>

            <p style={{fontSize:11,color:'var(--gray)',marginTop:6,textAlign:'center'}}>
              {addPath==='photo'?'After setup, you\'ll snap your fridge — instant inventory!':
               addPath==='voice'?'Free forever — just talk to add items.':
               addPath==='email'?'Coming soon':
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
              {[['👨‍👩‍👧','Family',`${profile.familySize} people${getChildLabel(profile)?` · ${getChildLabel(profile)} ${(profile.childMode ?? 'toddler')} safety ON`:''}`],['🥗','Diet',`${profile.isVeg?'Vegetarian':'Omnivore'}${profile.eatsEggs?' + eggs':''}`],['🔔','Notifications','Meal times + refill nudges ready']].map(([ic,lb,val],i,arr)=>(
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
            <p style={{fontSize:11,color:'var(--gray)',marginTop:1}}>{perishable.length} items{staples.length>0?` · ${staples.length} pantry`:''}{urgent.length>0?` · ${urgent.length} urgent today`:expiring.length>0?` · ${expiring.length} use soon`:''}</p>
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

            {/* ✏️ Manual text input */}
            <div style={{background:'var(--grayL)',border:'1.5px solid var(--border)',borderRadius:14,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--gray)',marginBottom:8}}>✏️ TYPE WHAT YOU BOUGHT</div>
              <div style={{display:'flex',gap:8}}>
                <input
                  value={manualText}
                  onChange={e=>setManualText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); submitManualText(); } }}
                  placeholder='e.g. "2 mangoes, 400g curd, 1L milk"'
                  style={{flex:1,borderRadius:10,border:'1.5px solid var(--border)',padding:'9px 12px',fontSize:13,fontFamily:'inherit',color:'var(--ink)',background:'var(--white)',outline:'none'}}
                />
                <button onClick={submitManualText} disabled={manualLoading||!manualText.trim()}
                  style={{background:manualLoading||!manualText.trim()?'#D1D5DB':'var(--navy)',border:'none',borderRadius:10,padding:'9px 14px',fontSize:13,fontWeight:800,color:'#fff',cursor:manualLoading||!manualText.trim()?'default':'pointer',fontFamily:'inherit',flexShrink:0,transition:'background .2s'}}>
                  {manualLoading?'…':'Add'}
                </button>
              </div>
            </div>

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
                <div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>Say it in English, Tamil, Malay, Singlish — &quot;2 mangoes, 400g curd&quot;</div>
              </div>
            </button>
            {voiceTranscript&&<div style={{marginBottom:10,background:'var(--grayL)',borderRadius:12,padding:'10px 14px',fontSize:13,color:'var(--gray)',fontStyle:'italic'}}>🎙️ &ldquo;{voiceTranscript}&rdquo;</div>}

            {/* Photo scan — Premium */}
            <input ref={photoInputRef} type="file" accept="image/*" style={{display:'none'}}
              onChange={e=>{ const f=e.target.files?.[0]; if(f) handlePhotoScan(f); e.target.value=''; }}/>
            {isPremium ? (
              <button onClick={()=>photoInputRef.current?.click()} disabled={scanning}
                style={{width:'100%',background:scanning?'#F0FDF4':'var(--grayL)',border:'1.5px solid var(--border)',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10,opacity:scanning?.7:1}}>
                <div style={{width:42,height:42,borderRadius:21,background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>📸</div>
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:14,fontWeight:800,color:'var(--ink)'}}>{scanning?'Scanning…':'📸 Photo / Receipt'}</div>
                  <div style={{fontSize:11,color:'var(--gray)',marginTop:1}}>Upload a screenshot, choose from photos, or take a new picture</div>
                </div>
              </button>
            ) : (
              <button onClick={()=>setShowPremium(true)}
                style={{width:'100%',background:'#FFFBEB',border:'1.5px solid #FCD34D',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,cursor:'pointer',marginBottom:10}}>
                <div style={{width:42,height:42,borderRadius:21,background:'#F59E0B',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>📸</div>
                <div style={{flex:1,textAlign:'left'}}>
                  <div style={{fontSize:14,fontWeight:800,color:'#92400E'}}>📸 Photo / Receipt <span style={{fontSize:11,background:'#F59E0B',color:'#fff',borderRadius:6,padding:'1px 6px',marginLeft:4}}>👑 Premium</span></div>
                  <div style={{fontSize:11,color:'#B45309',marginTop:1}}>Upload a screenshot or receipt photo — items added automatically</div>
                </div>
              </button>
            )}

            <div aria-disabled="true" style={{width:'100%',background:'#FFFBEB',border:'1.5px dashed #FCD34D',borderRadius:14,padding:'13px 16px',display:'flex',alignItems:'flex-start',gap:14,cursor:'default',opacity:.95}}>
              <div style={{width:42,height:42,borderRadius:21,background:'#FEF3C7',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>🛒</div>
              <div style={{flex:1,textAlign:'left'}}>
                <div style={{fontSize:14,fontWeight:800,color:'#92400E'}}>Order → Fridge sync</div>
                <div style={{fontSize:11,color:'#B45309',marginTop:1}}>Coming soon. We&apos;re using this to learn which store syncs families want first.</div>
                <div style={{fontSize:11,color:'#B45309',marginTop:7}}>Would auto-sync for {storePromptApps.join(' + ')} help?</div>
                <button
                  onClick={registerAutoSyncInterest}
                  disabled={autoSyncInterest}
                  style={{marginTop:8,background:autoSyncInterest?'#DCFCE7':'#fff',border:`1px solid ${autoSyncInterest?'#86EFAC':'#F59E0B'}`,borderRadius:999,padding:'7px 12px',fontSize:11,fontWeight:800,color:autoSyncInterest?'#15803D':'#B45309',cursor:autoSyncInterest?'default':'pointer',fontFamily:'inherit'}}
                >
                  {autoSyncInterest ? '✓ Interest noted' : 'Yes, I want this'}
                </button>
              </div>
            </div>
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
        {(rescuedValueThisMonth > 0 || ateLog.filter(a=>new Date(a.date)>=new Date(new Date().setDate(1))).length > 0) && (
          <div style={{background:'linear-gradient(135deg,#ECFDF5,#D1FAE5)',border:'1.5px solid #6EE7B7',borderRadius:14,padding:'10px 14px',marginBottom:12,marginTop:8,display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:20}}>💰</span>
            <div style={{flex:1}}>
              <p style={{fontSize:12,fontWeight:800,color:'#065F46'}}>Food rescued this month</p>
              <p style={{fontSize:11,color:'#047857'}}>{rescuedValueThisMonth>0?`You saved ${fmt(rescuedValueThisMonth)} by using what was already in your fridge.`:`Every item you finish before expiry adds up here.`}</p>
            </div>
            {rescuedValueThisMonth>0&&<span style={{fontSize:17,fontWeight:900,color:'#065F46',flexShrink:0}}>{fmt(rescuedValueThisMonth)}</span>}
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

        {/* ── Refill Nudges ── */}
        {refillNudges.length>0&&(
          <div style={{background:'linear-gradient(135deg,#F0FDF4,#DCFCE7)',border:'1.5px solid #86EFAC',borderRadius:16,padding:'12px 14px',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <span style={{fontSize:18}}>🛒</span>
              <div style={{flex:1}}>
                <p style={{fontSize:12,fontWeight:800,color:'#15803D'}}>Time to restock</p>
                <p style={{fontSize:11,color:'#16A34A'}}>{refillNudges.map(i=>i.name).join(', ')} {refillNudges.length===1?'is':'are'} almost gone. If you bought them a few days ago, this is your refill nudge.</p>
              </div>
            </div>
            {/* Items */}
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
              {refillNudges.map(item=>(
                <div key={item.id} style={{display:'flex',alignItems:'center',gap:5,background:'#fff',borderRadius:20,padding:'4px 10px',border:'1px solid #86EFAC'}}>
                  <span style={{fontSize:14}}>{item.emoji}</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#15803D'}}>{item.name}</span>
                  <span style={{fontSize:10,color:'#16A34A'}}>
                    {item.addedAt ? `bought ${Math.max(0, Math.floor((Date.now() - new Date(item.addedAt).getTime()) / 86400000))}d ago` : fmtDays(daysLeft(item.expiry))}
                  </span>
                </div>
              ))}
            </div>
            {/* Buy buttons */}
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {getBuyLinks(regionCode).map(lnk=>(
                <a key={lnk.app} href={lnk.url(refillNudges[0].name)} target="_blank" rel="noreferrer"
                  style={{display:'flex',alignItems:'center',gap:5,background:lnk.color,color:'#fff',borderRadius:10,padding:'7px 12px',fontSize:11,fontWeight:700,textDecoration:'none',whiteSpace:'nowrap'}}>
                  {lnk.emoji} {lnk.app}
                </a>
              ))}
            </div>
          </div>
        )}

        {searched ? (
          searched.length===0
            ? <p style={{textAlign:'center',padding:'40px',color:'var(--gray)'}}>&ldquo;{search}&rdquo; not in fridge</p>
            : searched.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={openEditItem} onDelete={deleteItem}/>)
        ) : (
          <>
            {urgent.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:12,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--red)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'var(--red)',letterSpacing:.6}}>URGENT — USE TODAY</span>
                <span className="pill pill-red">{urgent.length}</span>
              </div>
              {urgent.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={openEditItem} onDelete={deleteItem}/>)}
            </>}
            {expiring.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:14,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--gold)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'var(--goldD)',letterSpacing:.6}}>USE IN NEXT FEW DAYS</span>
                <span className="pill pill-amber">{expiring.length}</span>
              </div>
              {expiring.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={openEditItem} onDelete={deleteItem}/>)}
            </>}
            {fresh.length>0&&<>
              <div style={{display:'flex',alignItems:'center',gap:7,marginTop:14,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:4,background:'var(--sage)'}}/>
                <span style={{fontWeight:800,fontSize:11,color:'#15803D',letterSpacing:.6}}>FRESH & STOCKED</span>
                <span className="pill pill-green">{fresh.length}</span>
              </div>
              {fresh.map(i=><PantryRow key={i.id} item={i} onTap={setActionItem} onEditExpiry={openEditItem} onDelete={deleteItem}/>)}
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
                <input ref={fridgeAuditRef} type="file" accept="image/*" style={{display:'none'}}
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
              {isLiquidItem(actionItem.name, actionItem.unit, actionItem.cat) ? '🥤 Consumed it' : '😋 Ate it'}
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
    const currentMeals = meals[`${period}:${mealMode}`];
    const urgentNames  = pantry.filter(i=>daysLeft(i.expiry)<=1).map(i=>i.name);
    const userName = profile.name || 'Your';
    const childName = getChildLabel(profile) || 'little one';
    return (
      <div className="screen" style={{display:'flex',flexDirection:'column',background:'var(--cream)'}}>
        <div style={{padding:'18px 20px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:10}}>
            <div>
              <h1 style={{fontSize:28,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>Meal Ideas</h1>
              <p style={{fontSize:12,color:'var(--gray)',marginTop:4}}>{mealMode === 'rescue' ? `${userName}'s fastest dinner path tonight` : `${userName}, here&apos;s what your fridge can become tonight.`}</p>
            </div>
            <button onClick={()=>{setMeals(m=>({...m,[`${period}:${mealMode}`]:undefined as unknown as Meal[]}));generateMeals(period,true,mealMode);}}
              style={{display:'flex',alignItems:'center',gap:5,background:'transparent',border:'none',padding:'8px 0',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:800,color:cfg.color}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:loadingMeals?'spin 1s linear infinite':'none'}}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Refresh
            </button>
          </div>
        </div>

        <div style={{padding:'6px 20px 0',flexShrink:0}}>
          <div style={{padding:'14px 0 16px',borderBottom:'1px solid rgba(148,163,184,.18)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
              <div style={{width:42,height:42,borderRadius:14,background:'#ECFDF5',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 21h8"/>
                  <path d="M12 17v4"/>
                  <path d="M7 8h10a4 4 0 0 1 0 8H7a4 4 0 0 1 0-8z"/>
                  <path d="M9 8a3 3 0 1 1 6 0"/>
                </svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:18,fontWeight:900,color:'var(--ink)'}}>{userName}&apos;s Quick Fix</div>
                <div style={{fontSize:12,color:'var(--gray)',marginTop:3}}>Fast meal ideas that fit your fridge and stay {childName}-friendly.</div>
              </div>
              <button
                onClick={()=>{ setMealMode('rescue'); generateMeals(period, true, 'rescue'); }}
                style={{background:'#22C55E',border:'none',borderRadius:999,padding:'11px 16px',fontSize:12,fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit',flexShrink:0,whiteSpace:'nowrap'}}
              >
                Cook Now (15 Min)
              </button>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button onClick={()=>setMealMode('default')} style={{background:mealMode==='default'?'#EFF6FF':'transparent',border:'none',borderRadius:999,padding:'7px 12px',fontSize:11,fontWeight:800,color:mealMode==='default'?'var(--navy)':'var(--gray)',cursor:'pointer',fontFamily:'inherit'}}>Balanced ideas</button>
              <button onClick={()=>{ setMealMode('rescue'); generateMeals(period, true, 'rescue'); }} style={{background:mealMode==='rescue'?'#DCFCE7':'transparent',border:'none',borderRadius:999,padding:'7px 12px',fontSize:11,fontWeight:800,color:mealMode==='rescue'?'#15803D':'var(--gray)',cursor:'pointer',fontFamily:'inherit'}}>6PM Solution</button>
            </div>
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
          <div style={{display:'flex',alignItems:'center',gap:8,background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:12,margin:'10px 20px 0',padding:'9px 13px',flexShrink:0}}>
            <span>⚠️</span>
            <span style={{fontSize:12,color:'#B91C1C',fontWeight:600,flex:1}}>{urgentNames.join(', ')} expire today — prioritised</span>
          </div>
        )}

        {/* Meal cards */}
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px 28px'}}>
          {loadingMeals?(
            [1,2,3].map(i=><div key={i} className="shimmer-card" style={{height:160}}/>)
          ):!currentMeals?.length&&pantry.length===0?(
            <div style={{textAlign:'center',paddingTop:50}}>
              <div style={{fontSize:44}}>🛒</div>
              <p style={{fontWeight:700,fontSize:18,color:'var(--inkM)',marginTop:12}}>Add groceries first</p>
              <p style={{fontSize:13,color:'var(--gray)',marginTop:5}}>Go to Fridge and add items by voice.</p>
              <button className="btn-primary" onClick={()=>setTab('fridge')} style={{marginTop:16,width:'auto',padding:'11px 24px'}}>Go to Fridge →</button>
            </div>
          ):(filterCooledMeals(currentMeals||[])).map((m, index)=>(
            <div key={m.id} style={{background:'var(--white)',border:`1.5px solid ${m.uses_expiring?'#FCA5A5':'var(--border)'}`,borderRadius:20,padding:16,marginBottom:14,position:'relative'}}>
              {m.uses_expiring&&<div style={{position:'absolute',top:12,right:12,background:'#FEE2E2',color:'#B91C1C',fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:10}}>{mealMode==='rescue' && index===0 ? 'RESCUE PICK' : 'USE TODAY'}</div>}
              <div style={{display:'flex',gap:12,alignItems:'flex-start',marginBottom:10}}>
                <span style={{fontSize:42,lineHeight:1.1}}>{m.emoji}</span>
                <div style={{flex:1,paddingRight:m.uses_expiring?50:0}}>
                  <div style={{fontWeight:800,fontSize:15,color:'var(--ink)',letterSpacing:-.3,lineHeight:1.3}}>{m.name}</div>
                  <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:'var(--gray)'}}>⏱ {m.time_minutes} min</span>
                    <span style={{fontSize:11,color:'#EF4444'}}>🔥 {m.calories} kcal</span>
                    <span style={{fontSize:11,color:'#1E3A8A'}}>💪 {m.protein}g</span>
                    {m.carbs>0&&<span style={{fontSize:11,color:'#D97706'}}>🌾 {m.carbs}g</span>}
                    {m.fat>0&&<span style={{fontSize:11,color:'#7C3AED'}}>🥑 {m.fat}g</span>}
                    {m.fibre>0&&<span style={{fontSize:11,color:'#15803D'}}>🌿 {m.fibre}g F</span>}
                    {m.kid_safe&&<span style={{fontSize:11,color:'#15803D'}}>👶 {getChildLabel(profile)||'Kid'}-safe</span>}
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
            <div style={{fontWeight:700,fontSize:13,color:'#14532D'}}>Safe for {getChildLabel(profile)||'little ones'} — mild, no choking hazards</div>
          </div>}
          {cooking.uses_expiring&&<div style={{background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:12,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <span>⚠️</span>
            <div style={{fontSize:13,color:'#92400E',fontWeight:600}}>Uses items expiring today — great choice!</div>
          </div>}
          {/* Macros */}
          <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
            {([['🔥',cooking.calories,'kcal','#EF4444'],['💪',cooking.protein,'g P','#1E3A8A'],['🌾',cooking.carbs,'g C','#D97706'],['🥑',cooking.fat,'g F','#7C3AED'],['🌿',cooking.fibre,'g Fb','#15803D'],['⏱',cooking.time_minutes,'min','#22C55E']] as [string,number,string,string][]).map(([ic,v,u,c])=>(
              <div key={u} style={{flex:'1 1 60px',background:'var(--white)',borderRadius:12,padding:'8px 6px',textAlign:'center',border:'1px solid var(--border)'}}>
                <div style={{fontSize:11,color:'var(--gray)'}}>{ic}</div>
                <div style={{fontSize:13,fontWeight:800,color:c,marginTop:2}}>{v}<span style={{fontSize:10,fontWeight:600}}> {u}</span></div>
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
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
    const monthLabel = new Date().toLocaleDateString(undefined, { month:'long', year:'numeric' });
    const usedThisMonth = ateLog.filter(a=>new Date(a.date)>=thisMonth);
    const rescuedThisMonth = usedThisMonth.filter(a => (a.daysRemaining ?? 2) <= 3);
    const wasteThisMonth = wasteLog.filter(w=>new Date(w.date)>=thisMonth);

    const rescuedValue = rescuedThisMonth.reduce((sum, item)=>sum + getLoggedValue(item, regionCode, region), 0);
    const wasteValue = wasteThisMonth.reduce((sum, item)=>sum + getLoggedValue(item, regionCode, region), 0);

    const trackedThisMonth = rescuedThisMonth.length + wasteThisMonth.length;
    const rescueRate = trackedThisMonth === 0 ? 100 : Math.round((rescuedThisMonth.length / trackedThisMonth) * 100);

    const wasteCounts: Record<string,{count:number;emoji:string}> = {};
    wasteLog.forEach(w=>{ wasteCounts[w.name]={count:(wasteCounts[w.name]?.count||0)+1,emoji:w.emoji}; });
    const worstItem = Object.entries(wasteCounts).sort((a,b)=>b[1].count-a[1].count)[0];

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

    const avgLifespan = usedThisMonth.length
      ? (usedThisMonth.reduce((sum, entry) => {
          const totalShelf = entry.expDays ?? getShelfDays(entry.name);
          const usedAfter = entry.daysRemaining !== undefined ? Math.max(1, totalShelf - entry.daysRemaining) : Math.max(1, totalShelf - 2);
          return sum + usedAfter;
        }, 0) / usedThisMonth.length).toFixed(1)
      : null;

    const spendBase = pantry;
    const categorySpend = Object.entries(
      spendBase.reduce((map, item) => {
        const bucket = item.cat || 'Other';
        map[bucket] = (map[bucket] || 0) + estimateItemValue(item.name, item.qty, item.unit, regionCode);
        return map;
      }, {} as Record<string, number>)
    )
      .sort((a,b)=>b[1]-a[1])
      .slice(0,5);
    const categoryTotal = categorySpend.reduce((sum, [, amount]) => sum + amount, 0);
    const categoryColors = ['#1E3A8A','#86EFAC','#F59E0B','#FB7185','#A78BFA'];
    const donutRadius = 46;
    const donutCircumference = 2 * Math.PI * donutRadius;
    let donutOffset = 0;

    return (
      <div className="screen" style={{background:'var(--cream)'}}>
        <div style={{padding:'14px 16px 8px',flexShrink:0}}>
          <h1 style={{fontSize:26,fontWeight:900,color:'var(--ink)',letterSpacing:-.5}}>Insights</h1>
          <p style={{fontSize:11,color:'var(--gray)',marginTop:1}}>{monthLabel} · {profile.name ? `${profile.name}'s household` : 'Your household'}</p>
        </div>
        <div style={{overflowY:'auto',padding:'4px 16px 32px'}}>

          <div style={{background:'linear-gradient(135deg,#1E3A8A,#2563EB)',borderRadius:22,padding:20,marginBottom:14,position:'relative',overflow:'hidden',boxShadow:'0 12px 30px rgba(37,99,235,.22)'}}>
            <div style={{position:'absolute',right:-30,top:-16,width:120,height:120,borderRadius:60,background:'rgba(255,255,255,.08)'}}/>
            <p style={{fontSize:11,color:'#BFDBFE',fontWeight:700,letterSpacing:.6}}>THIS MONTH&apos;S WIN 🏆</p>
            <p style={{fontSize:38,fontWeight:900,color:'#fff',marginTop:6,lineHeight:1}}>{fmt(rescuedValue)}</p>
            <p style={{fontSize:13,color:'#DBEAFE',marginTop:8}}>saved by using food before it expired</p>
            <div style={{display:'flex',gap:24,marginTop:18}}>
              {[[rescuedThisMonth.length,'rescued'],[wasteThisMonth.length,'wasted'],[`${rescueRate}%`,'efficiency']].map(([value, label])=>(
                <div key={String(label)}>
                  <div style={{fontSize:18,fontWeight:900,color:'#fff'}}>{value}</div>
                  <div style={{fontSize:10,color:'#BFDBFE',marginTop:2}}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:16,height:6,background:'rgba(255,255,255,.18)',borderRadius:999}}>
              <div style={{height:6,width:`${rescueRate}%`,background:'#86EFAC',borderRadius:999}} />
            </div>
          </div>

          <div style={{background:'var(--white)',borderRadius:20,padding:18,marginBottom:12,border:'1px solid var(--border)'}}>
            <div style={{fontSize:18,fontWeight:900,color:'var(--ink)',marginBottom:2}}>Spending by category</div>
            <div style={{fontSize:12,color:'var(--gray)',marginBottom:14}}>{categoryTotal>0 ? `Estimated current fridge value · Total ${fmt(categoryTotal)}` : 'Uses local market pricing for what is in your fridge right now'}</div>
            {categorySpend.length ? (
              <div style={{display:'flex',alignItems:'center',gap:16}}>
                <svg width="128" height="128" viewBox="0 0 128 128" style={{flexShrink:0}}>
                  <circle cx="64" cy="64" r={donutRadius} fill="none" stroke="#E5E7EB" strokeWidth="18" />
                  {categorySpend.map(([label, amount], index) => {
                    const ratio = amount / categoryTotal;
                    const dash = donutCircumference * ratio;
                    const strokeDasharray = `${dash} ${donutCircumference}`;
                    const strokeDashoffset = -donutOffset;
                    donutOffset += dash;
                    return (
                      <circle
                        key={label}
                        cx="64"
                        cy="64"
                        r={donutRadius}
                        fill="none"
                        stroke={categoryColors[index % categoryColors.length]}
                        strokeWidth="18"
                        strokeLinecap="round"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        transform="rotate(-90 64 64)"
                      />
                    );
                  })}
                  <circle cx="64" cy="64" r="26" fill="#fff" />
                </svg>
                <div style={{flex:1}}>
                  {categorySpend.map(([label, amount], index)=>(
                    <div key={label} style={{display:'flex',alignItems:'center',gap:10,padding:'5px 0'}}>
                      <span style={{width:10,height:10,borderRadius:5,background:categoryColors[index % categoryColors.length],flexShrink:0}} />
                      <span style={{flex:1,fontSize:13,color:'var(--inkM)'}}>{label}</span>
                      <span style={{fontSize:13,fontWeight:800,color:'var(--ink)'}}>{fmt(amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{fontSize:13,color:'var(--gray)'}}>Start adding groceries and this view will break down where your fridge value sits.</p>
            )}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <div style={{background:'linear-gradient(135deg,#ECFDF5,#F0FDF4)',borderRadius:18,padding:16,border:'1px solid #BBF7D0'}}>
              <div style={{fontSize:20,marginBottom:8}}>📅</div>
              <div style={{fontSize:26,fontWeight:900,color:'var(--ink)'}}>{avgLifespan ?? '—'}</div>
              <div style={{fontSize:11,fontWeight:700,color:'var(--gray)',marginTop:2}}>Avg. item lifespan</div>
            </div>
            <div style={{background:'linear-gradient(135deg,#FFF1F2,#FFF7ED)',borderRadius:18,padding:16,border:'1px solid #FED7AA'}}>
              <div style={{fontSize:20,marginBottom:8}}>{worstItem ? worstItem[1].emoji : '🥬'}</div>
              <div style={{fontSize:22,fontWeight:900,color:'var(--ink)',lineHeight:1.1}}>{worstItem ? worstItem[0] : 'Nothing yet'}</div>
              <div style={{fontSize:11,fontWeight:700,color:'var(--gray)',marginTop:6}}>Most wasted</div>
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
            <p style={{fontSize:11,color:'var(--gray)',marginBottom:12}}>Waste now uses item-level local market estimates, so produce like gobi/cauliflower stays grounded instead of inflating to a takeout-sized price.</p>
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
                      <div style={{fontSize:22,fontWeight:900,color:'#DC2626'}}>{fmt(wasteValue)}</div>
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
          {[['👤','Name',profile.name||'—'],['🥗','Diet',`${profile.isVeg?'Vegetarian':'Omnivore'}${profile.eatsEggs?' + eggs':''}`],['👨‍👩‍👧','Family',`${profile.familySize} people${getChildLabel(profile)?` · ${getChildLabel(profile)} ${(profile.childMode ?? 'toddler')} safety ON`:''}`]].map(([ic,lb,val],i,arr)=>(
            <div key={lb} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:i<arr.length-1?'1px solid var(--border)':'none'}}>
              <div style={{width:34,height:34,borderRadius:10,background:'var(--grayL)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{ic}</div>
              <div style={{flex:1}}><div style={{fontSize:11,color:'var(--gray)'}}>{lb}</div><div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>{val}</div></div>
            </div>
          ))}
        </div>

        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:18,marginBottom:14,padding:16}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:12}}>Household details</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
            <input
              type="text"
              value={profile.name}
              onChange={e=>updateProfileSettings(prev=>({...prev,name:e.target.value}))}
              placeholder="Your name"
            />
            <input
              type="text"
              value={profile.city}
              onChange={e=>updateProfileSettings(prev=>({...prev,city:e.target.value}))}
              placeholder="City"
            />
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--gray)',marginBottom:8}}>How many people are in your home?</div>
            <div style={{display:'flex',gap:8}}>
              {[1,2,3,4,'5+'].map(n=>(
                <button
                  key={n}
                  onClick={()=>updateProfileSettings(prev=>({...prev,familySize:typeof n==='number'?n:5}))}
                  style={{flex:1,background:profile.familySize===(typeof n==='number'?n:5)?'#EFF6FF':'var(--grayL)',border:`1.5px solid ${profile.familySize===(typeof n==='number'?n:5)?'var(--navy)':'var(--border)'}`,borderRadius:12,padding:'10px 0',textAlign:'center',fontSize:14,fontWeight:700,color:profile.familySize===(typeof n==='number'?n:5)?'var(--navy)':'var(--ink)',cursor:'pointer',fontFamily:'inherit'}}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div style={{background:'#FEF9C3',border:'1.5px solid #FCD34D',borderRadius:14,padding:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'#92400E',marginBottom:4}}>Child mode</div>
            <div style={{fontSize:12,color:'#B45309',marginBottom:12}}>Turn this on only if you want kid-safe recipe filters and serving guidance.</div>
            <div style={{display:'flex',gap:8,marginBottom:(profile.childMode ?? 'none')!=='none'?12:0}}>
              {[
                { id:'none', label:'No child' },
                { id:'toddler', label:'Toddler' },
                { id:'kid', label:'Kid' },
              ].map(option => (
                <button
                  key={option.id}
                  onClick={()=>updateProfileSettings(prev=>({
                    ...prev,
                    childMode: option.id as Profile['childMode'],
                    hasToddler: option.id !== 'none',
                    childName: option.id === 'none' ? '' : (prev.childName ?? prev.toddlerName ?? ''),
                    toddlerName: option.id === 'none' ? '' : (prev.childName ?? prev.toddlerName ?? ''),
                    childAge: option.id === 'none' ? 2 : option.id === 'kid' ? Math.max(4, prev.childAge ?? prev.toddlerAge ?? 4) : Math.min(3, prev.childAge ?? prev.toddlerAge ?? 2),
                    toddlerAge: option.id === 'none' ? 2 : option.id === 'kid' ? Math.max(4, prev.childAge ?? prev.toddlerAge ?? 4) : Math.min(3, prev.childAge ?? prev.toddlerAge ?? 2),
                  }))}
                  style={{flex:1,background:(profile.childMode ?? 'none')===option.id?'#fff':'#FEF3C7',border:`1.5px solid ${(profile.childMode ?? 'none')===option.id?'#F59E0B':'#FCD34D'}`,borderRadius:12,padding:'10px 0',fontWeight:800,fontSize:13,color:'#92400E',cursor:'pointer',fontFamily:'inherit'}}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {(profile.childMode ?? 'none')!=='none'&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr 100px',gap:8}}>
                <input
                  type="text"
                  placeholder="Child name"
                  value={profile.childName ?? profile.toddlerName}
                  onChange={e=>updateProfileSettings(prev=>({...prev,childName:e.target.value,toddlerName:e.target.value}))}
                />
                <input
                  type="number"
                  placeholder="Age"
                  value={profile.childAge ?? profile.toddlerAge ?? ''}
                  onChange={e=>updateProfileSettings(prev=>({
                    ...prev,
                    childAge:parseInt(e.target.value)||2,
                    toddlerAge:parseInt(e.target.value)||2,
                  }))}
                  style={{textAlign:'center'}}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:18,marginBottom:14,padding:16}}>
          <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:12}}>Food preferences</div>
          {[['🥗','Vegetarian','No meat or seafood',true],['🍽️','Everything','No restrictions',false]].map(([ic,lb,sub,isVeg])=>(
            <button
              key={lb as string}
              onClick={()=>updateProfileSettings(prev=>({...prev,isVeg:!!isVeg,eatsEggs:!!isVeg ? prev.eatsEggs : true}))}
              style={{width:'100%',background:profile.isVeg===!!isVeg?'#EFF6FF':'var(--grayL)',border:`1.5px solid ${profile.isVeg===!!isVeg?'var(--navy)':'var(--border)'}`,borderRadius:14,padding:13,display:'flex',alignItems:'center',gap:12,marginBottom:9,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}
            >
              <span style={{fontSize:22}}>{ic}</span>
              <div><div style={{fontSize:14,fontWeight:700,color:'var(--ink)'}}>{lb}</div><div style={{fontSize:12,color:'var(--gray)'}}>{sub}</div></div>
            </button>
          ))}
          {profile.isVeg&&(
            <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:14,padding:14,marginTop:6,marginBottom:12}}>
              <p style={{fontSize:13,fontWeight:700,color:'var(--navy)',marginBottom:10}}>Do you eat eggs?</p>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>updateProfileSettings(prev=>({...prev,eatsEggs:true}))} style={{flex:1,background:profile.eatsEggs?'var(--navy)':'#fff',color:profile.eatsEggs?'#fff':'var(--gray)',border:'1px solid var(--border)',borderRadius:11,padding:11,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>Yes, I eat eggs 🥚</button>
                <button onClick={()=>updateProfileSettings(prev=>({...prev,eatsEggs:false}))} style={{flex:1,background:!profile.eatsEggs?'var(--navy)':'#fff',color:!profile.eatsEggs?'#fff':'var(--gray)',border:'1px solid var(--border)',borderRadius:11,padding:11,fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>No eggs</button>
              </div>
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {([
              ['🇮🇳','Indian everyday','Indian'],
              ['🍜','Asian','Asian'],
              ['🍝','Western / Continental','Western'],
              ['🌮','Mexican / Middle Eastern','Mexican'],
              ['🥗','Mediterranean','Mediterranean'],
            ] as [string,string,string][]).map(([flag,label,val])=>{
              const sel = profile.cuisines.includes(val);
              return (
                <button
                  key={val}
                  onClick={()=>updateProfileSettings(prev=>({...prev,cuisines:sel?prev.cuisines.filter(c=>c!==val):[...prev.cuisines,val]}))}
                  style={{display:'flex',alignItems:'center',gap:12,background:sel?'#EFF6FF':'var(--grayL)',border:`1.5px solid ${sel?'var(--navy)':'var(--border)'}`,borderRadius:14,padding:'12px 14px',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}
                >
                  <span style={{fontSize:24,flexShrink:0}}>{flag}</span>
                  <span style={{flex:1,fontSize:14,fontWeight:800,color:sel?'var(--navy)':'var(--ink)'}}>{label}</span>
                  {sel&&<span style={{fontSize:12,fontWeight:800,color:'var(--navy)'}}>Selected</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Toddler / Kid Safety Filter ── */}
        {getChildLabel(profile)&&(
          <div style={{background:'#FFFBEB',border:'1.5px solid #FDE68A',borderRadius:18,marginBottom:14,padding:16}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <div style={{width:40,height:40,borderRadius:12,background:'#FEF3C7',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>👶</div>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:'#92400E'}}>{getChildLabel(profile)}&apos;s safety filter</div>
                <div style={{fontSize:11,color:'#B45309',marginTop:1}}>Fully editable. Add or remove anything that matters for your child, and recipe suggestions will use it immediately.</div>
              </div>
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
              {(profile.safetyFilters ?? DEFAULT_SAFETY_FILTERS).map(tag=>(
                <button key={tag} onClick={()=>toggleSafetyFilter(tag)} style={{display:'flex',alignItems:'center',gap:4,background:'#FEF3C7',border:'1px solid #FCD34D',borderRadius:20,padding:'4px 10px',fontSize:11,fontWeight:700,color:'#92400E',cursor:'pointer',fontFamily:'inherit'}}>
                  <span style={{fontSize:10}}>✕</span> {tag}
                </button>
              ))}
            </div>
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <input
                type="text"
                value={customSafetyFilter}
                onChange={e=>setCustomSafetyFilter(e.target.value)}
                onKeyDown={e=>{ if (e.key === 'Enter') { e.preventDefault(); addCustomSafetyFilter(); } }}
                placeholder="Add a custom safety filter"
                style={{flex:1}}
              />
              <button onClick={addCustomSafetyFilter} style={{background:'#F59E0B',border:'none',borderRadius:10,padding:'0 14px',fontSize:12,fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Add</button>
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
              {SAFETY_FILTER_LIBRARY.filter(tag=>!(profile.safetyFilters ?? DEFAULT_SAFETY_FILTERS).includes(tag)).slice(0,8).map(tag=>(
                <button key={tag} onClick={()=>toggleSafetyFilter(tag)} style={{background:'#fff',border:'1px dashed #F59E0B',borderRadius:999,padding:'5px 10px',fontSize:11,fontWeight:700,color:'#B45309',cursor:'pointer',fontFamily:'inherit'}}>
                  + {tag}
                </button>
              ))}
            </div>
            <p style={{fontSize:11,color:'#B45309',lineHeight:1.6}}>Tap an active filter to remove it. Suggestions below are quick add-ons when your child’s needs change.</p>
          </div>
        )}

        {/* ── Notification settings ── */}
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:18,marginBottom:14,overflow:'hidden'}}>
          <div style={{padding:'14px 16px'}}>
            <div style={{fontSize:14,fontWeight:800,color:'var(--ink)',marginBottom:12}}>Daily dinner notification</div>
            {[['🔔','Send suggestion at',profile.notifTimes.dinner],['📱','Send to','Push'],['🔄','Suggestion changes when','New items added'],['🛒','Refill reminder','Bought tomatoes 3 days ago? Nudge to restock'],['🏪','Nearby stores',region.groceryApps.slice(0,2).join(' + ')]].map(([ic,lb,val],i,arr)=>(
              <div key={lb} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<arr.length-1?'1px solid var(--border)':'none'}}>
                <span style={{fontSize:18,flexShrink:0,width:24,textAlign:'center'}}>{ic}</span>
                <div style={{flex:1,fontSize:13,color:'var(--inkM)'}}>{lb}</div>
                <div style={{fontSize:13,fontWeight:700,color:'var(--ink)'}}>{val}</div>
              </div>
            ))}
          </div>
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
            ['💰','Real savings tracking',`See exactly how much you save vs ${region.groceryApps[0]}`],
            ['🛒','Order sync','Coming soon — nearby grocery handoff when refill is due'],
            ['🔔','Daily meal push','All 4 meals sent to you automatically'],
            ['👶','Child safety filter','Every recipe pre-checked for toddler and kid safety'],
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
    <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget){setEditExpiry(null);setEditQty('');setNewExpiryDays('');}}}>
      <div className="modal-sheet" style={{borderRadius:'26px 26px 0 0'}}>
        <div className="modal-handle"/>
        <div style={{padding:'20px 22px 32px'}}>
          <p style={{fontWeight:800,fontSize:18,color:'var(--ink)',marginBottom:4}}>Edit item — {editExpiry?.name}</p>
          <p style={{fontSize:13,color:'var(--gray)',marginBottom:20}}>Update quantity and shelf life together so your fridge and waste watch stay accurate.</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:14,alignItems:'center'}}>
            <input
              type="number"
              value={editQty}
              onChange={e=>setEditQty(e.target.value)}
              placeholder="Quantity"
              style={{width:'100%',fontSize:22,fontWeight:700,textAlign:'center',borderRadius:14,padding:'14px',border:'2px solid var(--navy)'}}
            />
            <div style={{minWidth:72,textAlign:'center',fontSize:14,fontWeight:800,color:'var(--navy)',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:12,padding:'13px 10px'}}>
              {editExpiry?.unit}
            </div>
          </div>
          <input
            type="number"
            value={newExpiryDays}
            onChange={e=>setNewExpiryDays(e.target.value)}
            placeholder="e.g. 5"
            style={{width:'100%',marginBottom:16,fontSize:22,fontWeight:700,textAlign:'center',borderRadius:14,padding:'14px',border:'2px solid var(--navy)'}}
          />
          <button className="btn-primary" onClick={applyExpiryEdit} style={{marginBottom:10}}>Save</button>
          <button onClick={()=>{setEditExpiry(null);setEditQty('');setNewExpiryDays('');}} style={{width:'100%',background:'none',border:'none',color:'var(--gray)',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
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
