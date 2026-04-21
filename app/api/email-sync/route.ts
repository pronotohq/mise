// app/api/email-sync/route.ts
// Parses a grocery order confirmation email (FoodPanda, GrabMart, Swiggy,
// Blinkit, Amazon Fresh, NTUC, etc.) and returns structured grocery items.
// The user either pastes the email body, or forwards it to their unique
// fridgeBee address which calls this endpoint via webhook.
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
    const { emailText, emailHtml, dietary } = await req.json();
    const content = emailText || emailHtml || '';

    if (!content.trim()) {
      return NextResponse.json({ items: [], store: null, orderTotal: 0 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You extract grocery items from food delivery order confirmation emails.
Supported services: FoodPanda, GrabMart, Swiggy Instamart, Blinkit, Zepto, BigBasket, Amazon Fresh, NTUC FairPrice Online, RedMart, Woolworths, Coles, Instacart, Ocado, Tesco, Carrefour, and similar.

Return a JSON object with these keys:
{
  "store": string (app/store name, e.g. "FoodPanda"),
  "orderTotal": number (total order value, 0 if not found),
  "currency": string (e.g. "INR", "SGD", "USD", infer from email content),
  "items": [{ "item_name": string, "quantity": number, "unit": string, "price": number, "category": string, "emoji": string }]
}

Rules for items:
- item_name: clean title-case singular (e.g. "Whole Milk", "Free Range Eggs")
- quantity: numeric (default 1)
- unit: "g" | "kg" | "ml" | "L" | "pcs" | "loaf" | "bunch" | "packet" | "dozen" | "box"
- price: per-item price as a number (0 if not found). Extract from the email line item, NOT the total.
- category: "Produce" | "Dairy" | "Protein" | "Grains" | "Snacks" | "Beverages" | "Condiments" | "Frozen" | "Other"
- emoji: one relevant emoji
- Skip delivery fees, tips, packaging charges, discount lines, non-food items
- If item has a weight/volume in the name (e.g. "Fresh Milk 1L"), extract that as the quantity+unit
- Diet context: ${dietary?.isVeg ? 'vegetarian' : 'omnivore'}${dietary?.eatsEggs ? ', eats eggs' : ''}

IMPORTANT: Accurate prices per item are critical — they are used to calculate food waste costs in the app.
If this email is NOT a grocery order confirmation, return { "store": null, "orderTotal": 0, "currency": null, "items": [] }.`
      }, {
        role: 'user',
        content: `Extract grocery items from this order email:\n\n${content.slice(0, 6000)}`
      }]
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? '{"items":[]}');
    return NextResponse.json({
      items:      parsed.items      ?? [],
      store:      parsed.store      ?? null,
      orderTotal: parsed.orderTotal ?? 0,
    });

  } catch (err) {
    console.error('Email sync error:', err);
    return NextResponse.json({ error: 'Email parsing failed' }, { status: 500 });
  }
}
