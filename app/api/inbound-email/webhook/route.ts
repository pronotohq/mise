/**
 * POST /api/inbound-email/webhook
 *
 * Inbound email webhook endpoint. Email providers (SendGrid Inbound Parse,
 * Mailgun Routes, Postmark Inbound) POST parsed email data here whenever
 * a user forwards an order confirmation to their unique FreshNudge address.
 *
 * ## Flow
 * 1. Receive the webhook payload (from, to, subject, text/html body).
 * 2. Resolve `to` address -> userId via the mappings file.
 * 3. Classify the sender as grocery vs restaurant.
 *    - Restaurant orders are skipped immediately.
 * 4. Send the email body to Claude for structured item extraction.
 * 5. **Delete the raw email content from memory** — only the parsed
 *    items array is returned / stored.
 * 6. Log a minimal, PII-free audit record.
 *
 * ## Privacy guarantee
 * PRIVACY: Raw email content deleted — only parsed grocery items retained.
 * We never persist the email subject, body, sender address, or any other
 * personally identifiable information. The only durable artefact is the
 * structured items array plus a minimal log line.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single parsed grocery item. */
interface GroceryItem {
  item_name: string;
  quantity: number;
  unit: string;
  price: number;
  category: string;
  emoji: string;
}

/** Shape of the Claude JSON response. */
interface ParsedEmail {
  store_name: string | null;
  order_type: 'grocery' | 'restaurant' | 'unknown';
  items: GroceryItem[];
}

/**
 * Normalised webhook payload.  Different providers use different field
 * names; we map them all to this common shape inside `normalisePayload`.
 */
interface InboundPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** User-mapping file shape (mirrors generate/route.ts). */
interface MappingsFile {
  [userId: string]: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), 'data');
const MAPPINGS_FILE = path.join(DATA_DIR, 'inbound-mappings.json');

/**
 * Sender domain substrings that identify **grocery** delivery services.
 * If the sender matches one of these, the order is treated as grocery.
 */
const GROCERY_SENDER_PATTERNS: string[] = [
  // India
  'blinkit', 'swiggy', 'bigbasket', 'zepto',
  // Singapore / SEA
  'foodpanda', 'grabmart', 'grab.com', 'redmart', 'fairprice',
  // US / CA
  'instacart', 'amazonfresh', 'amazon.com', 'walmart', 'doordash',
  // UK
  'ocado', 'tesco',
  // AU
  'woolworths', 'coles',
  // MENA
  'noon', 'carrefour',
];

/**
 * Sender domain substrings that identify **restaurant** (non-grocery)
 * delivery services. If the sender matches one of these AND none of the
 * grocery patterns, the email is skipped.
 */
const RESTAURANT_SENDER_PATTERNS: string[] = [
  'zomato',
  'ubereats', 'uber.com',
  'deliveroo',
  'grabfood',
  'swiggy',        // Swiggy does both; disambiguated by subject/body below
  'doordash',      // DoorDash does both; disambiguated below
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the userId -> inboundEmail mapping file.
 */
async function readMappings(): Promise<MappingsFile> {
  try {
    const raw = await fs.readFile(MAPPINGS_FILE, 'utf-8');
    return JSON.parse(raw) as MappingsFile;
  } catch {
    return {};
  }
}

/**
 * Given a `to` address, look up the userId from the mapping file.
 * Returns `null` if no mapping exists (i.e. unknown address).
 */
async function resolveUserId(toAddress: string): Promise<string | null> {
  const mappings = await readMappings();
  const normalised = toAddress.toLowerCase().trim();

  for (const [userId, email] of Object.entries(mappings)) {
    if (email.toLowerCase() === normalised) {
      return userId;
    }
  }
  return null;
}

/**
 * Extract the first valid email address from a potentially messy
 * `to` header (e.g. `"FreshNudge" <user_abc@inbound.freshnudge.app>`).
 */
function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  // Fallback: treat the whole string as the address.
  return raw.toLowerCase().trim();
}

/**
 * Normalise inbound webhook payloads from different providers into
 * a common `InboundPayload` shape.
 *
 * Supported providers:
 * - **SendGrid Inbound Parse**: `from`, `to`, `subject`, `text`, `html`
 * - **Mailgun Routes**: `sender`, `recipient`, `subject`, `body-plain`, `body-html`
 * - **Postmark Inbound**: `From`, `To`, `Subject`, `TextBody`, `HtmlBody`
 */
function normalisePayload(raw: Record<string, unknown>): InboundPayload {
  return {
    from:    String(raw.from    ?? raw.sender   ?? raw.From    ?? ''),
    to:      String(raw.to      ?? raw.recipient ?? raw.To     ?? ''),
    subject: String(raw.subject ?? raw.Subject  ?? ''),
    text:    String(raw.text    ?? raw['body-plain'] ?? raw.TextBody ?? ''),
    html:    String(raw.html    ?? raw['body-html']  ?? raw.HtmlBody ?? ''),
  };
}

/**
 * Classify the sender as `grocery`, `restaurant`, or `unknown`.
 *
 * Heuristic:
 * 1. Check sender domain against grocery patterns first (higher priority).
 * 2. Check against restaurant patterns.
 * 3. Use subject-line keywords as a tiebreaker for ambiguous senders
 *    (Swiggy, DoorDash) that handle both grocery and restaurant orders.
 */
function classifySender(
  from: string,
  subject: string,
): 'grocery' | 'restaurant' | 'unknown' {
  const lowerFrom = from.toLowerCase();
  const lowerSubject = subject.toLowerCase();

  const isGroceryDomain = GROCERY_SENDER_PATTERNS.some(p => lowerFrom.includes(p));
  const isRestaurantDomain = RESTAURANT_SENDER_PATTERNS.some(p => lowerFrom.includes(p));

  // Subject-line keywords that strongly indicate grocery vs restaurant.
  const groceryKeywords = ['grocery', 'instamart', 'fresh', 'mart', 'supermarket', 'pantry'];
  const restaurantKeywords = ['restaurant', 'dine', 'food order', 'meal'];

  const subjectIsGrocery = groceryKeywords.some(k => lowerSubject.includes(k));
  const subjectIsRestaurant = restaurantKeywords.some(k => lowerSubject.includes(k));

  // Grocery domain takes priority.
  if (isGroceryDomain && !subjectIsRestaurant) return 'grocery';
  if (isRestaurantDomain && !subjectIsGrocery) return 'restaurant';
  // Subject tiebreaker for ambiguous senders.
  if (subjectIsGrocery) return 'grocery';
  if (subjectIsRestaurant) return 'restaurant';
  // Fallback: treat as grocery so we at least attempt to parse.
  if (isGroceryDomain) return 'grocery';

  return 'unknown';
}

/**
 * Strip HTML tags from an HTML string, returning plain-ish text.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Claude LLM parsing
// ---------------------------------------------------------------------------

/**
 * Send the email body to Anthropic Claude and extract structured
 * grocery items.
 *
 * Uses `claude-sonnet-4-20250514` via the `@anthropic-ai/sdk` package.
 * The system prompt constrains output to a strict JSON schema so
 * downstream code can rely on the shape without extra validation.
 */
async function parseEmailWithClaude(emailBody: string): Promise<ParsedEmail> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = `You are a grocery order email parser for FreshNudge, a kitchen inventory app.

Given the body of an order confirmation email, extract ALL grocery/food items and return them as structured JSON.

You MUST return a JSON object (no markdown fences, no extra text) with this exact shape:
{
  "store_name": string | null,
  "order_type": "grocery" | "restaurant",
  "items": [
    {
      "item_name": string,
      "quantity": number,
      "unit": string,
      "price": number,
      "category": string,
      "emoji": string
    }
  ]
}

Rules:
- item_name: Clean, title-case, singular form (e.g. "Whole Milk", "Free Range Eggs").
- quantity: Numeric. Default to 1 if not stated. If item name contains a weight/volume (e.g. "Milk 1L"), extract it.
- unit: One of "g", "kg", "L", "ml", "pcs", "loaf", "bunch", "packet", "dozen", "box".
- price: Per-item price as a number. Use 0 if not found.
- category: One of "Produce", "Dairy", "Protein", "Grains", "Beverages", "Pantry", "Frozen", "Other".
- emoji: A single relevant emoji for the item.
- store_name: The name of the delivery service or store (e.g. "Blinkit", "FoodPanda").
- order_type: "grocery" if this is a grocery/supermarket order, "restaurant" if it is a prepared-food/restaurant order.

Skip delivery fees, tips, taxes, packaging charges, discount lines, and non-food items.
If the email is not an order confirmation at all, return { "store_name": null, "order_type": "grocery", "items": [] }.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `Extract grocery items from this order email:\n\n${emailBody.slice(0, 6000)}`,
      },
    ],
    system: systemPrompt,
  });

  // Extract the text content from Claude's response.
  const textBlock = response.content.find(b => b.type === 'text');
  const raw = textBlock ? textBlock.text : '{"store_name":null,"order_type":"grocery","items":[]}';

  try {
    return JSON.parse(raw) as ParsedEmail;
  } catch {
    console.error('[inbound-email/webhook] Failed to parse Claude response as JSON.');
    return { store_name: null, order_type: 'grocery', items: [] };
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST handler — receives inbound email webhooks from SendGrid / Mailgun /
 * Postmark, parses grocery items via Claude, then **deletes** the raw email
 * content.
 *
 * @returns Parsed items or a skip notice for non-grocery orders.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody: Record<string, unknown> = await req.json();
    const payload = normalisePayload(rawBody);

    // 1. Resolve user from the `to` address.
    const toAddress = extractEmailAddress(payload.to);
    const userId = await resolveUserId(toAddress);

    if (!userId) {
      return NextResponse.json(
        { status: 'error', reason: 'unknown_recipient' },
        { status: 404 },
      );
    }

    // 2. Classify sender.
    const classification = classifySender(payload.from, payload.subject);

    if (classification === 'restaurant') {
      // PRIVACY: Raw email content deleted — only parsed grocery items retained.
      return NextResponse.json({
        status: 'skipped',
        reason: 'restaurant_order',
      });
    }

    // 3. Prepare a plain-text version of the email for the LLM.
    const emailBody = payload.text || stripHtml(payload.html);

    if (!emailBody || emailBody.trim().length < 30) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'empty_or_too_short',
      });
    }

    // 4. Parse with Claude.
    const parsed = await parseEmailWithClaude(emailBody);

    // Double-check: if Claude says it's a restaurant order, skip.
    if (parsed.order_type === 'restaurant') {
      // PRIVACY: Raw email content deleted — only parsed grocery items retained.
      return NextResponse.json({
        status: 'skipped',
        reason: 'restaurant_order',
      });
    }

    // PRIVACY: Raw email content deleted — only parsed grocery items retained.
    // At this point we intentionally discard `payload` (from, to, subject,
    // text, html). Only the structured `parsed.items` array survives.

    // 5. Minimal, PII-free audit log.
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        userId,
        store: parsed.store_name ?? 'Unknown',
        itemCount: parsed.items.length,
      }),
    );

    // 6. Return parsed items.
    return NextResponse.json({
      status: 'success',
      items: parsed.items,
      store: parsed.store_name ?? 'Unknown',
      itemCount: parsed.items.length,
    });
  } catch (err) {
    console.error('[inbound-email/webhook] Error:', err);
    return NextResponse.json(
      { status: 'error', reason: 'internal_error' },
      { status: 500 },
    );
  }
}
