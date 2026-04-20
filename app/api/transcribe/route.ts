// app/api/transcribe/route.ts
// Receives audio blob → Whisper transcription → GPT-4o item extraction
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { priceForItem } from '../../lib/prices';
import type { Country } from '../../lib/prices';

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  return new OpenAI({ apiKey });
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAIClient();
    const formData = await req.formData();
    const audio    = formData.get('audio') as File | null;
    const textOnly = formData.get('text') as string | null;   // bypass for typed input
    const dietary  = JSON.parse((formData.get('dietary') as string) ?? '{}');
    const lang     = (formData.get('lang') as string | null) ?? 'en';  // BCP-47 locale from device

    // Extract primary language code (e.g. "hi" from "hi-IN", "ta" from "ta-SG")
    const whisperLang = lang.split('-')[0];
    // Whisper language hint — only set for non-English to help accuracy, keep null for English/auto
    const whisperLangHint = whisperLang !== 'en' ? whisperLang : undefined;

    let transcript = textOnly ?? '';

    // ── 1. Transcribe with Whisper if audio provided ──────────
    if (audio && !textOnly) {
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file:  audio,
        language: whisperLangHint,   // hint for non-English; undefined = Whisper auto-detects
        prompt: 'Grocery items list. May include quantities like grams, kg, litres, pieces. Speaker may mix English with Tamil, Malay, Hindi, Singlish, or other local languages.',
      });
      transcript = transcription.text;
    }

    if (!transcript.trim()) {
      return NextResponse.json({ items: [], transcript: '' });
    }

    const country = (dietary.country ?? 'IN') as Country;

    // ── 2. Extract structured items with GPT-4o-mini (no pricing — done server-side from lookup) ──
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You extract grocery items from speech or text.
Return a JSON object with key "items" — an array of objects:
{ "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string }

Do NOT include a price. Pricing is handled separately.

CRITICAL:
- Each grocery item in the input = ONE object in the output. If the user says "bhindi", output ONE item named "Bhindi" — do NOT also add "Okra" as a second item. Never include translations or synonyms as separate entries.
- emoji MUST be a single unicode emoji character (e.g. "🥒"). Never a description like "lady_beetle", "cucumber-green", or a word. If you don't know an appropriate emoji, use "📦".
- item_name is a clean noun the user would recognise, NOT an English description of the emoji.

Rules:
- item_name: preserve the name in the language spoken. If the user said "Tamatar", use "Tamatar". If they said "Tomato", use "Tomato". If they said "1 kg Tamatar", use "Tamatar". Keep regional names authentic.
- quantity: numeric. Do NOT mindlessly default to 1 piece for groceries when quantity is omitted.
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji

User's locale: ${lang}. Display item names in the language/dialect the user spoke.
Diet context: ${dietary.isVeg ? 'vegetarian' : 'omnivore'}${dietary.eatsEggs ? ', eats eggs' : ''}
Ignore filler words like "bought", "got", "picked up", "some", "aur", "y", "und".
The user may speak in mixed languages — extract items regardless of language used.
Infer practical household defaults when the user names a grocery item without quantity:
- tomato / tamatar / thakkali: 4 pcs
- onion / pyaaz / vengayam / bawang: 500 g
- potato / aloo / urulaikilangu / kentang: 1 kg
- spinach / keerai: 1 bunch
- milk / doodh / paal / susu: 1 L
- eggs / muttai / telur / anda: 12 pcs
- bread / roti loaf: 1 loaf
- ginger / adrak / inji / halia: 100 g
- garlic / lehsun / poondu / bawang putih: 100 g
- cauliflower / gobi / phool gobi / patta gobhi / pata gobhi: 1 pcs
If the speech says "some", "add", "need", or "buy" without numbers, still infer a realistic grocery quantity instead of 1 pcs.
Hindi: doodh=Milk, paneer=Paneer, aloo=Potato, pyaaz=Onion, dahi=Curd/Yogurt, atta=Flour, chawal=Rice, dal=Lentils, tamatar=Tomato, adrak=Ginger, lehsun=Garlic, namak=Salt, tel=Oil, sabzi=Vegetables, gosht=Meat, murgh=Chicken, machli=Fish, besan=Chickpea flour, maida=White flour, cheeni=Sugar, chai=Tea.
Hindi produce aliases: gobi=Cauliflower, phool gobi=Cauliflower, patta gobhi or pata gobhi=Cabbage/Cauliflower family vegetable, bhindi=Okra.
Tamil: thakkali=Tomato, paal=Milk, thayir=Curd/Yogurt, muttai=Eggs, vengayam=Onion, urulaikilangu=Potato, poondu=Garlic, inji=Ginger, keerai=Greens/Spinach, arisi=Rice, paruppu=Dal, kozhi=Chicken, meen=Fish, muttakose or muttaikose=Cabbage.
Malay / Singlish: susu=Milk, telur=Eggs, bawang=Onion, kentang=Potato, halia=Ginger, bawang putih=Garlic, sayur=Vegetables, ikan=Fish, ayam=Chicken, roti=Bread, kopi=Coffee, teh=Tea. Singlish examples may sound like: "buy one packet spinach lah", "need milk and eggs can?", "faster add tomato, onion", "pata gobhi add also".
Spanish: leche=Milk, huevos=Eggs, pollo=Chicken, carne=Meat, arroz=Rice, frijoles=Beans, tomate=Tomato, cebolla=Onion, ajo=Garlic, aceite=Oil, pan=Bread, queso=Cheese, manzana=Apple, plátano=Banana, naranja=Orange, zanahoria=Carrot, papa=Potato, azúcar=Sugar, sal=Salt, mantequilla=Butter.
Arabic: laban=Milk, bayd=Eggs, dajaj=Chicken, lahm=Meat, ruz=Rice, zayt=Oil, khubz=Bread, jibn=Cheese, tuffah=Apple, mawz=Banana, bassal=Onion, toom=Garlic, sukkar=Sugar,ملح=Salt.`
      }, {
        role: 'user',
        content: `Extract grocery items from: "${transcript}"`
      }]
    });

    const content = JSON.parse(completion.choices[0].message.content ?? '{"items":[]}');

    // Validate emoji: must be a short string containing at least one non-ASCII (likely emoji) char.
    // Catches GPT outputting things like "lady_beetle" or "cucumber-green" as the emoji field.
    const isValidEmoji = (e: unknown): e is string => {
      if (typeof e !== 'string') return false;
      if (e.length === 0 || e.length > 8) return false;
      // Any non-ASCII char is a fair proxy for "this is an emoji"
      return /[^\x00-\x7F]/.test(e);
    };

    // Dedup by case-insensitive item_name — prevents "Bhindi" + "Okra" double-entries.
    const seen = new Set<string>();
    const raw  = (content.items ?? []) as {item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string}[];
    const items = raw.reduce<Array<{item_name:string;quantity?:number;unit?:string;category?:string;emoji?:string;price?:number}>>((acc, it) => {
      const name = (it.item_name || '').trim();
      if (!name) return acc;
      const key = name.toLowerCase();
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push({
        ...it,
        item_name: name,
        emoji: isValidEmoji(it.emoji) ? it.emoji : undefined,
        price: priceForItem({ name, quantity: it.quantity ?? 1, unit: it.unit ?? 'pcs', country }),
      });
      return acc;
    }, []);

    return NextResponse.json({ items, transcript });

  } catch (err: unknown) {
    console.error('Transcribe error:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
