// app/api/scan/route.ts
// Receives an image (receipt photo or FoodPanda/Grab screenshot)
// → GPT-4o Vision extracts grocery items → returns structured list
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image    = formData.get('image') as File | null;
    const dietary  = JSON.parse((formData.get('dietary') as string) ?? '{}');

    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const bytes  = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mime   = image.type || 'image/jpeg';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          {
            type: 'text',
            text: `You are extracting grocery/food items from a receipt, order confirmation screenshot, or grocery app screenshot (FoodPanda, GrabMart, Swiggy, Blinkit, Amazon Fresh, NTUC, Woolworths, etc).

Return a JSON object with key "items" — an array of objects:
{ "item_name": string, "quantity": number, "unit": string, "category": string, "emoji": string }

Also return "store": the store/app name if visible, or null.

Rules:
- item_name: clean title-case singular (e.g. "Whole Milk", "Chicken Breast", "Brown Eggs")
- quantity: numeric (default 1)
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen" | "box"
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji per item
- Skip delivery fees, packaging, promotions, non-food items
- Diet context: ${dietary.isVeg ? 'vegetarian' : 'omnivore'}${dietary.eatsEggs ? ', eats eggs' : ''}

If this is not a grocery/food receipt, return { "items": [], "store": null }.`
          }
        ]
      }]
    });

    const content = JSON.parse(response.choices[0].message.content ?? '{"items":[]}');
    return NextResponse.json({ items: content.items ?? [], store: content.store ?? null });

  } catch (err) {
    console.error('Scan error:', err);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
