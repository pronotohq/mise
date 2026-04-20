// app/api/transcribe/route.ts
// Receives audio blob → Whisper transcription → GPT-4o item extraction
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

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

    const country = (dietary.country ?? 'IN') as 'IN'|'SG'|'US';
    const currencyLabel = country === 'SG' ? 'SGD' : country === 'US' ? 'USD' : 'INR';

    const priceRef: Record<typeof country, string> = {
      IN: `Real Blinkit/BigBasket INR prices (reference — never exceed these significantly):
- Spinach (palak) 1 bunch/200g: ₹20-40
- Tomatoes 500g: ₹30-50
- Onion 1kg: ₹30-50
- Potato 1kg: ₹30-45
- Paneer 200g: ₹80-100
- Milk 1L: ₹60-75
- Curd 400g: ₹60-90
- Eggs 12pcs: ₹80-100
- Bread 1 loaf: ₹40-60
- Chicken 1kg: ₹200-280
- Atta 5kg: ₹250-300
- Rice 1kg: ₹60-120
- Coriander 1 bunch: ₹10-20
- Lemons 4pcs: ₹15-30
- Capsicum 250g: ₹30-50
- Ginger 100g: ₹15-30
- Garlic 200g: ₹25-50`,
      SG: `Real FairPrice/RedMart SGD prices:
- Spinach 200g: S$2-3
- Tomatoes 500g: S$2.50-4
- Onion 1kg: S$2-3
- Potato 1kg: S$2.50-4
- Paneer 200g: S$4-6
- Milk 1L: S$2.50-3.50
- Yogurt 400g: S$3-5
- Eggs 10pcs: S$3-5
- Bread 1 loaf: S$2.50-4
- Chicken 1kg: S$8-12
- Rice 1kg: S$3-6
- Lemons 4pcs: S$2-3
- Ginger 100g: S$1-2`,
      US: `Real US grocery USD prices:
- Spinach 10oz (280g): $3-4
- Tomatoes 1lb (450g): $2-3
- Onion 3lb: $3-5
- Potato 5lb: $4-6
- Milk 1 gallon (3.8L): $3.50-5
- Eggs 12pcs: $3-6
- Bread 1 loaf: $3-5
- Chicken breast 1lb: $5-8
- Rice 1kg: $3-5
- Greek yogurt 32oz: $5-7`,
    };

    // ── 2. Extract structured items with GPT-4o ──────────
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You extract grocery items from speech or text.
Return a JSON object with key "items" — an array of objects:
{ "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string, "price": number }

PRICE RULES (CRITICAL):
- Currency: ${currencyLabel} (whole number). Country: ${country}.
- Scale to the actual quantity ordered. Most household produce/dairy is cheap — never default to a high number.
- If you are NOT highly confident of a realistic retail price, OMIT the price field entirely. Do not guess. It's better to return no price than a wrong one.
- Never use restaurant/wholesale/imported-premium prices. Assume everyday supermarket/q-commerce.
- Cross-check against this reference before outputting:
${priceRef[country]}
- If the item you computed is more than 2x the reference range, it's wrong — drop the price.

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

    // Hard caps per country — if price exceeds this ceiling for a typical grocery quantity, drop it
    const PRICE_CEIL: Record<typeof country, number> = { IN: 500, SG: 25, US: 20 };
    const items = (content.items ?? []).map((it: {item_name:string;price?:number;quantity?:number;unit?:string}) => {
      if (typeof it.price === 'number') {
        if (it.price > PRICE_CEIL[country] || it.price < 0) {
          return { ...it, price: undefined };
        }
      }
      return it;
    });

    return NextResponse.json({ items, transcript });

  } catch (err: unknown) {
    console.error('Transcribe error:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
