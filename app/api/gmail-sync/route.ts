// app/api/gmail-sync/route.ts
// Receives a Gmail OAuth access token from the client.
// Searches Gmail for grocery order confirmation emails from known delivery apps.
// Parses each email body through GPT and returns all grocery items found.
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Grocery delivery sender domains — covers all supported regions
const GROCERY_SENDERS = [
  // Singapore
  'foodpanda.sg', 'grab.com', 'redmart.com', 'fairprice.com.sg', 'amazon.sg',
  // India
  'swiggy.com', 'blinkit.com', 'zeptonow.com', 'bigbasket.com', 'amazon.in',
  // US/CA
  'instacart.com', 'amazon.com', 'doordash.com', 'walmart.com',
  // UK
  'ocado.com', 'tesco.com', 'sainsburys.co.uk',
  // AU
  'woolworths.com.au', 'coles.com.au',
  // Generic
  'noreply', 'orders', 'no-reply',
];

const GROCERY_QUERY = GROCERY_SENDERS
  .map(s => `from:${s}`)
  .join(' OR ');

const FULL_QUERY = `(${GROCERY_QUERY}) (subject:order OR subject:delivered OR subject:confirmation OR subject:receipt OR subject:grocery)`;

async function gmailFetch(path: string, token: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
  return res.json();
}

function decodeBase64(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBody(payload: Record<string, unknown>): string {
  // Try plain text first, then HTML
  if (payload.body && (payload.body as Record<string,unknown>).data) {
    return decodeBase64((payload.body as Record<string,string>).data);
  }
  const parts = (payload.parts as Record<string,unknown>[] | undefined) ?? [];
  for (const part of parts) {
    const p = part as Record<string, unknown>;
    if (p.mimeType === 'text/plain' && (p.body as Record<string,unknown>)?.data) {
      return decodeBase64((p.body as Record<string,string>).data);
    }
  }
  for (const part of parts) {
    const p = part as Record<string, unknown>;
    if (p.mimeType === 'text/html' && (p.body as Record<string,unknown>)?.data) {
      const html = decodeBase64((p.body as Record<string,string>).data);
      // Strip HTML tags for GPT
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

async function parseEmailItems(
  body: string,
  dietary: Record<string, unknown>
): Promise<{ item_name: string; quantity: number; unit: string; price: number; category: string; emoji: string }[]> {
  if (!body.trim() || body.length < 50) return [];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1000,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `Extract grocery/food items from a delivery order confirmation email.
Return JSON: {
  "items": [{ "item_name": string, "quantity": number, "unit": string, "price": number, "category": string, "emoji": string }],
  "store": string|null
}
Rules:
- item_name: clean title-case names
- quantity: numeric, default 1
- unit: g/kg/ml/L/pcs/packet/bunch/box/dozen
- price: per-item price as a number (IMPORTANT: extract from email line items, not totals. Use 0 if not found)
- category: Produce/Dairy/Protein/Grains/Snacks/Beverages/Condiments/Frozen/Other
- emoji: one relevant emoji
- Skip delivery fees, discounts, packaging charges, non-food items
Diet: ${dietary?.isVeg ? 'vegetarian' : 'omnivore'}${dietary?.eatsEggs ? ', eats eggs' : ''}.
IMPORTANT: Accurate per-item prices are critical — used to calculate waste cost in the app.
If not a grocery order, return { "items": [], "store": null }.`,
    }, {
      role: 'user',
      content: body.slice(0, 4000),
    }],
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? '{"items":[]}');
  return parsed.items ?? [];
}

export async function POST(req: NextRequest) {
  try {
    const { accessToken, dietary, sinceDate } = await req.json();
    if (!accessToken) return NextResponse.json({ error: 'No access token' }, { status: 400 });

    // Build date filter — default: last 60 days, or since user's join date
    const since = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 60 * 86400000);
    const afterEpoch = Math.floor(since.getTime() / 1000);
    const query = `${FULL_QUERY} after:${afterEpoch}`;

    // 1. List matching emails
    const listData = await gmailFetch(
      `/users/me/messages?q=${encodeURIComponent(query)}&maxResults=30`,
      accessToken
    );

    const messages: { id: string }[] = listData.messages ?? [];
    if (!messages.length) {
      return NextResponse.json({ items: [], emailsScanned: 0, stores: [] });
    }

    // 2. Fetch each message and parse items
    const allItems: Record<string, unknown>[] = [];
    const stores = new Set<string>();

    await Promise.all(
      messages.slice(0, 15).map(async ({ id }) => {
        try {
          const msg = await gmailFetch(`/users/me/messages/${id}?format=full`, accessToken);
          const body = extractBody(msg.payload);
          const items = await parseEmailItems(body, dietary ?? {});

          // Extract store from headers
          const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
          const from = headers.find((h: { name: string }) => h.name === 'From')?.value ?? '';
          const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value ?? '';
          const date = headers.find((h: { name: string }) => h.name === 'Date')?.value ?? '';

          if (items.length) {
            const store = GROCERY_SENDERS.find(s => from.toLowerCase().includes(s)) ?? from.split('@')[1] ?? 'Unknown';
            stores.add(store);
            items.forEach(item => allItems.push({ ...item, _src: `📧 ${store}`, _date: date, _subject: subject }));
          }
        } catch {
          // Skip individual email errors
        }
      })
    );

    return NextResponse.json({
      items: allItems,
      emailsScanned: messages.length,
      stores: [...stores],
    });

  } catch (err) {
    console.error('Gmail sync error:', err);
    return NextResponse.json({ error: 'Gmail sync failed' }, { status: 500 });
  }
}
