// app/api/transcribe/route.ts
// Receives audio blob → Whisper transcription → GPT-4o item extraction
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
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
        prompt: 'Grocery items list. May include quantities like grams, kg, litres, pieces. Speaker may mix Hindi, Spanish, or other languages with English.',
      });
      transcript = transcription.text;
    }

    if (!transcript.trim()) {
      return NextResponse.json({ items: [], transcript: '' });
    }

    // ── 2. Extract structured items with GPT-4o-mini ──────────
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You extract grocery items from speech or text.
Return a JSON object with key "items" — an array of objects:
{ "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string }

Rules:
- item_name: preserve the name in the language spoken. If the user said "Tamatar", use "Tamatar". If they said "Tomato", use "Tomato". If they said "1 kg Tamatar", use "Tamatar". Keep regional names authentic.
- quantity: numeric (default 1)
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji

User's locale: ${lang}. Display item names in the language/dialect the user spoke.
Diet context: ${dietary.isVeg ? 'vegetarian' : 'omnivore'}${dietary.eatsEggs ? ', eats eggs' : ''}
Ignore filler words like "bought", "got", "picked up", "some", "aur", "y", "und".
The user may speak in mixed languages — extract items regardless of language used.
Hindi: doodh=Milk, paneer=Paneer, aloo=Potato, pyaaz=Onion, dahi=Curd/Yogurt, atta=Flour, chawal=Rice, dal=Lentils, tamatar=Tomato, adrak=Ginger, lehsun=Garlic, namak=Salt, tel=Oil, sabzi=Vegetables, gosht=Meat, murgh=Chicken, machli=Fish, besan=Chickpea flour, maida=White flour, cheeni=Sugar, chai=Tea.
Spanish: leche=Milk, huevos=Eggs, pollo=Chicken, carne=Meat, arroz=Rice, frijoles=Beans, tomate=Tomato, cebolla=Onion, ajo=Garlic, aceite=Oil, pan=Bread, queso=Cheese, manzana=Apple, plátano=Banana, naranja=Orange, zanahoria=Carrot, papa=Potato, azúcar=Sugar, sal=Salt, mantequilla=Butter.
Arabic: laban=Milk, bayd=Eggs, dajaj=Chicken, lahm=Meat, ruz=Rice, zayt=Oil, khubz=Bread, jibn=Cheese, tuffah=Apple, mawz=Banana, bassal=Onion, toom=Garlic, sukkar=Sugar,ملح=Salt.`
      }, {
        role: 'user',
        content: `Extract grocery items from: "${transcript}"`
      }]
    });

    const content = JSON.parse(completion.choices[0].message.content ?? '{"items":[]}');
    return NextResponse.json({ items: content.items ?? [], transcript });

  } catch (err: unknown) {
    console.error('Transcribe error:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
