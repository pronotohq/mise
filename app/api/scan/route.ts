// app/api/scan/route.ts
// Receives an image (receipt, order screenshot, or fridge photo) → GPT-4o Vision extracts items
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
    const image    = formData.get('image') as File | null;
    const dietary  = JSON.parse((formData.get('dietary') as string) ?? '{}');
    const country  = (dietary.country ?? 'IN') as 'IN'|'SG'|'US';
    const currencyLabel = country === 'SG' ? 'SGD' : country === 'US' ? 'USD' : 'INR';

    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const bytes  = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mime   = image.type || 'image/jpeg';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } },
          {
            type: 'text',
            text: `You are a smart grocery scanner for a fridge inventory app. Identify ALL food and grocery items in this image.

This image could be:
- A receipt or order confirmation — extract every line item
- A grocery app screenshot (FoodPanda, GrabMart, Swiggy, Blinkit, Amazon Fresh, NTUC, etc.)
- A FRIDGE or pantry shelf photo — identify everything visible
- Items in PLASTIC BAGS, cling wrap, or containers — look through packaging

FRIDGE/SHELF PHOTO RULES (critical):
- Identify items even through plastic bags, cling wrap, or packaging
- Use visual cues: shape, colour, size, any visible text or logos on packaging
- Green leafy bundle in bag = vegetables (spinach/coriander/lettuce/herbs)
- Red/orange round item = tomatoes or capsicum
- Yellow curved item = banana
- White liquid in clear bottle = milk
- Orange root vegetable = carrot
- Purple/white bulb = onion or garlic
- Brown wrapped parcel = meat or paneer
- Eggs in tray or bowl = eggs
- Clear bag with green = cucumber or zucchini
- Be GENEROUS — better to identify imprecisely than miss an item entirely
- If you see multiple items in one bag, list each separately

Return JSON:
{
  "items": [
    { "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string, "price": number }
  ],
  "store": string | null,
  "image_type": "receipt" | "screenshot" | "fridge_photo" | "other"
}

PRICE:
- If this is a RECEIPT or screenshot, use the ACTUAL price printed on the image (convert to ${currencyLabel} whole number if different currency).
- If it's a FRIDGE photo, estimate realistic ${currencyLabel} retail price for that quantity at supermarket level (Blinkit/BigBasket for IN, FairPrice/RedMart for SG, US chains for US). If unsure, omit price rather than guess wildly.

Rules:
- item_name: clean title-case singular (e.g. "Fresh Spinach", "Whole Milk", "Chicken Breast")
- quantity: numeric, default 1 if unclear
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen" | "box"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji
- Skip non-food items, delivery fees, promotions
- Diet context: ${dietary.isVeg ? 'vegetarian' : 'omnivore'}${dietary.eatsEggs ? ', eats eggs' : ''}

If nothing identifiable: { "items": [], "store": null, "image_type": "other" }`
          }
        ]
      }]
    });

    const content = JSON.parse(response.choices[0].message.content ?? '{"items":[]}');
    const isReceipt = content.image_type === 'receipt' || content.image_type === 'screenshot';
    const items = (content.items ?? []).map((it: {item_name:string;quantity?:number;unit?:string;price?:number;category?:string;emoji?:string}) => {
      if (isReceipt && typeof it.price === 'number' && it.price > 0) {
        // Receipt-printed price — trust it as-is
        return it;
      }
      // Fridge-photo or no price: enrich from the curated lookup (deterministic)
      const looked = priceForItem({ name: it.item_name, quantity: it.quantity ?? 1, unit: it.unit ?? 'pcs', country: country as Country });
      return { ...it, price: looked };
    });
    return NextResponse.json({
      items,
      store: content.store ?? null,
      image_type: content.image_type ?? 'other',
    });

  } catch (err) {
    console.error('Scan error:', err);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
