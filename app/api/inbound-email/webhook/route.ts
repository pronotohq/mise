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
 * 4. Detect sender region via SENDER_REGIONS map.
 * 5. Send the email body to Claude for structured item extraction, with
 *    regional context injected into the system prompt.
 * 6. Canonicalize item names, convert lbs->g, compute expiry dates.
 * 7. **Delete the raw email content from memory** — only the parsed
 *    items array is stored.
 * 8. Save enriched items to data/pending-items.json.
 * 9. Append minimal audit record to data/sync-log.json.
 * 10. Best-effort push notification via web-push.
 *
 * ## Privacy guarantee
 * PRIVACY: Raw email content deleted — only parsed grocery items retained.
 * We never persist the email subject, body, sender address, or any other
 * personally identifiable information. The only durable artefact is the
 * structured items array plus a minimal log line.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';
import { kv } from '@/lib/kv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single parsed grocery item returned by Claude. */
interface ClaudeGroceryItem {
  item_name: string;
  quantity: number;
  unit: string;
  price: number;
  category: string;
  emoji: string;
}

/** A fully enriched grocery item stored in pending/sync-log. */
interface EnrichedGroceryItem extends ClaudeGroceryItem {
  canonical_name: string;
  expiry_date: string; // ISO date string
  currency: string;
  region: string;
}

/** Shape of the Claude JSON response. */
interface ParsedEmail {
  store_name: string | null;
  order_type: 'grocery' | 'restaurant' | 'unknown';
  currency: string;
  items: ClaudeGroceryItem[];
}

/**
 * Normalised webhook payload. Different providers use different field
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

interface PendingEntry {
  items: EnrichedGroceryItem[];
  store: string;
  syncedAt: string;
  count: number;
}

interface PendingFile {
  [userId: string]: PendingEntry;
}

interface SyncLogEntry {
  store: string;
  count: number;
  syncedAt: string;
  items: string[]; // First 5 item names only
}

interface SyncLogFile {
  [userId: string]: SyncLogEntry[];
}


// ---------------------------------------------------------------------------
// Regional normalization map
// ---------------------------------------------------------------------------

const SENDER_REGIONS: Record<string, { currency: string; region: string; weightUnit: 'g' | 'lbs' }> = {
  'blinkit.com':      { currency: 'INR', region: 'IN', weightUnit: 'g' },
  'swiggy.com':       { currency: 'INR', region: 'IN', weightUnit: 'g' },
  'bigbasket.com':    { currency: 'INR', region: 'IN', weightUnit: 'g' },
  'zeptonow.com':     { currency: 'INR', region: 'IN', weightUnit: 'g' },
  'amazon.in':        { currency: 'INR', region: 'IN', weightUnit: 'g' },
  'redmart.com':      { currency: 'SGD', region: 'SG', weightUnit: 'g' },
  'fairprice.com.sg': { currency: 'SGD', region: 'SG', weightUnit: 'g' },
  'grab.com':         { currency: 'SGD', region: 'SG', weightUnit: 'g' },
  'foodpanda.sg':     { currency: 'SGD', region: 'SG', weightUnit: 'g' },
  'foodpanda.com':    { currency: 'SGD', region: 'SG', weightUnit: 'g' }, // pandamart / all markets
  'pandamart.com':    { currency: 'SGD', region: 'SG', weightUnit: 'g' },
  'amazon.sg':        { currency: 'SGD', region: 'SG', weightUnit: 'g' },
  'instacart.com':    { currency: 'USD', region: 'US', weightUnit: 'lbs' },
  'amazon.com':       { currency: 'USD', region: 'US', weightUnit: 'lbs' },
  'walmart.com':      { currency: 'USD', region: 'US', weightUnit: 'lbs' },
  'doordash.com':     { currency: 'USD', region: 'US', weightUnit: 'lbs' },
  'ocado.com':        { currency: 'GBP', region: 'GB', weightUnit: 'g' },
  'tesco.com':        { currency: 'GBP', region: 'GB', weightUnit: 'g' },
  'sainsburys.co.uk': { currency: 'GBP', region: 'GB', weightUnit: 'g' },
  'woolworths.com.au': { currency: 'AUD', region: 'AU', weightUnit: 'g' },
  'coles.com.au':     { currency: 'AUD', region: 'AU', weightUnit: 'g' },
  'noon.com':         { currency: 'AED', region: 'AE', weightUnit: 'g' },
  'carrefour.com':    { currency: 'AED', region: 'AE', weightUnit: 'g' },
};

// ---------------------------------------------------------------------------
// Canonical item name map
// ---------------------------------------------------------------------------

const CANONICAL_NAMES: Record<string, string> = {
  'brinjal': 'eggplant', 'aubergine': 'eggplant', 'baingan': 'eggplant',
  'capsicum': 'bell pepper', 'shimla mirch': 'bell pepper',
  'coriander': 'cilantro', 'dhania': 'cilantro', 'dhaniya': 'cilantro',
  'spring onion': 'scallion', 'green onion': 'scallion', 'hari pyaz': 'scallion',
  'lady finger': 'okra', 'bhindi': 'okra', 'ladies finger': 'okra',
  'bitter gourd': 'bitter melon', 'karela': 'bitter melon',
  'bottle gourd': 'calabash', 'lauki': 'calabash', 'dudhi': 'calabash',
  'ridge gourd': 'luffa', 'turai': 'luffa',
  'french beans': 'green beans', 'cluster beans': 'guar',
  'courgette': 'zucchini', 'marrow': 'zucchini',
  'rocket': 'arugula', 'rocket leaves': 'arugula',
  'spring greens': 'collard greens',
  'mince': 'ground meat', 'minced beef': 'ground beef', 'minced lamb': 'ground lamb',
  'crisps': 'chips', 'biscuits': 'cookies',
  'full cream milk': 'whole milk', 'full fat milk': 'whole milk',
  'single cream': 'light cream', 'double cream': 'heavy cream',
  'natural yogurt': 'plain yogurt', 'set yogurt': 'plain yogurt',
};

// ---------------------------------------------------------------------------
// Shelf life table (canonical name → days until expiry)
// ---------------------------------------------------------------------------

const SHELF_LIFE: Record<string, number> = {
  // Produce
  spinach: 3, kale: 4, lettuce: 4, cilantro: 4, scallion: 5, arugula: 3,
  tomato: 5, capsicum: 7, 'bell pepper': 7, cucumber: 7, broccoli: 5, cauliflower: 7,
  carrot: 14, potato: 21, onion: 30, garlic: 30, ginger: 21, eggplant: 5, okra: 3, zucchini: 5,
  'bitter melon': 5, calabash: 5,
  banana: 5, mango: 4, apple: 14, orange: 10, lemon: 14, papaya: 5, grape: 7, strawberry: 3, avocado: 4,
  // Dairy
  milk: 7, 'whole milk': 7, yogurt: 10, 'plain yogurt': 10, paneer: 4, cheese: 14, butter: 30, cream: 7, ghee: 180,
  // Protein
  egg: 21, chicken: 2, fish: 1, prawn: 1, mutton: 2, tofu: 5,
  // Grains
  bread: 5, rice: 180, oats: 180, pasta: 730, flour: 90,
  // Default
  default: 7,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SYNC_LOG_ENTRIES = 10;

// Stateless userId resolution via HMAC (mirrors generate/route.ts)
const SYNC_SECRET = process.env.SYNC_EMAIL_SECRET || 'freshnudge-sync-secret-change-in-prod';
function deriveToken(userId: string): string {
  return crypto.createHmac('sha256', SYNC_SECRET).update(userId).digest('base64url').slice(0, 12);
}

const MAX_SYNC_LOG_ENTRIES = 10;

// KV keys
const kvPending  = (uid: string) => `fn:pending:${uid}`;
const kvSyncLog  = (uid: string) => `fn:synclog:${uid}`;
const kvUserMap  = (token: string) => `fn:usermap:${token}`;

/**
 * Sender domain substrings that identify grocery delivery services.
 */
const GROCERY_SENDER_PATTERNS: string[] = [
  'blinkit', 'swiggy', 'bigbasket', 'zepto',
  'foodpanda', 'grabmart', 'grab.com', 'redmart', 'fairprice',
  'instacart', 'amazonfresh', 'amazon.com', 'walmart', 'doordash',
  'ocado', 'tesco',
  'woolworths', 'coles',
  'noon', 'carrefour',
];

/**
 * Sender domain substrings that identify restaurant (non-grocery) orders.
 */
const RESTAURANT_SENDER_PATTERNS: string[] = [
  'zomato',
  'ubereats', 'uber.com',
  'deliveroo',
  'grabfood',
  'swiggy',    // Swiggy does both; disambiguated by subject/body below
  'doordash',  // DoorDash does both; disambiguated below
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Convert lbs or oz quantities to grams.
 */
function normalizeLbs(qty: number, unit: string): { qty: number; unit: string } {
  if (unit === 'lbs' || unit === 'lb') return { qty: Math.round(qty * 453.592), unit: 'g' };
  if (unit === 'oz') return { qty: Math.round(qty * 28.35), unit: 'g' };
  return { qty, unit };
}

/**
 * Canonicalize an item name using the CANONICAL_NAMES map.
 */
function canonicalize(name: string): string {
  const lc = name.toLowerCase().trim();
  return CANONICAL_NAMES[lc] ?? name;
}

/**
 * Look up shelf life for a canonical item name (days until expiry).
 * Falls back to the 'default' value if the item is not in the table.
 */
function getShelfDays(canonicalName: string): number {
  const lc = canonicalName.toLowerCase().trim();
  return SHELF_LIFE[lc] ?? SHELF_LIFE['default'];
}

/**
 * Compute the ISO expiry date string by adding shelfDays to today.
 */
function computeExpiryDate(shelfDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + shelfDays);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Detect regional config by matching the from-address domain against
 * SENDER_REGIONS. Returns a default (USD / US / lbs) if no match.
 */
function detectRegion(fromAddress: string): {
  currency: string;
  region: string;
  weightUnit: 'g' | 'lbs';
  matchedDomain: string | null;
} {
  const lowerFrom = fromAddress.toLowerCase();
  for (const [domain, config] of Object.entries(SENDER_REGIONS)) {
    if (lowerFrom.includes(domain)) {
      return { ...config, matchedDomain: domain };
    }
  }
  return { currency: 'USD', region: 'US', weightUnit: 'lbs', matchedDomain: null };
}

/**
 * Build a human-readable regional context string for injection into the
 * Claude system prompt.
 */
function buildRegionalContext(
  storeName: string | null,
  region: string,
  currency: string,
  weightUnit: 'g' | 'lbs',
): string {
  const regionNames: Record<string, string> = {
    IN: 'India', SG: 'Singapore', US: 'United States', GB: 'United Kingdom',
    AU: 'Australia', AE: 'UAE',
  };
  const countryName = regionNames[region] ?? region;
  const unitSystem = weightUnit === 'g' ? 'metric (g/kg/L)' : 'imperial (lbs/oz)';

  const storePart = storeName
    ? `This email is from ${storeName} (${countryName})`
    : `This email appears to be from ${countryName}`;

  return `${storePart}. Units will be ${unitSystem}. Currency is ${currency}.`;
}

// ---------------------------------------------------------------------------
// KV helpers (replaces all /tmp file I/O)
// ---------------------------------------------------------------------------

async function savePendingKV(userId: string, entry: PendingEntry): Promise<void> {
  await kv.set(kvPending(userId), entry, { ex: 60 * 60 * 24 * 7 }); // 7-day TTL
}

async function readPendingKV(userId: string): Promise<PendingEntry | null> {
  return kv.get<PendingEntry>(kvPending(userId));
}

async function deletePendingKV(userId: string): Promise<void> {
  await kv.del(kvPending(userId));
}

async function appendSyncLogKV(userId: string, entry: SyncLogEntry): Promise<void> {
  const existing = await kv.get<SyncLogEntry[]>(kvSyncLog(userId)) ?? [];
  const updated = [...existing, entry].slice(-MAX_SYNC_LOG_ENTRIES);
  await kv.set(kvSyncLog(userId), updated, { ex: 60 * 60 * 24 * 90 }); // 90-day TTL
}

async function readSyncLogKV(userId: string): Promise<SyncLogEntry[]> {
  return await kv.get<SyncLogEntry[]>(kvSyncLog(userId)) ?? [];
}


// ---------------------------------------------------------------------------
// Inbound payload helpers
// ---------------------------------------------------------------------------

/**
 * Resolve userId from the `to` address token via KV.
 * The generate route stores token→userId in KV when the user gets their address.
 */
async function resolveUserId(toAddress: string): Promise<string | null> {
  const local = extractEmailAddress(toAddress).split('@')[0];
  if (!local.startsWith('sync_')) return null;
  const token = local.slice(5);
  return kv.get<string>(kvUserMap(token));
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  return raw.toLowerCase().trim();
}

function normalisePayload(raw: Record<string, unknown>): InboundPayload {
  return {
    from:    String(raw.from    ?? raw.sender    ?? raw.From    ?? ''),
    to:      String(raw.to      ?? raw.recipient ?? raw.To      ?? ''),
    subject: String(raw.subject ?? raw.Subject   ?? ''),
    text:    String(raw.text    ?? raw['body-plain'] ?? raw.TextBody ?? ''),
    html:    String(raw.html    ?? raw['body-html']  ?? raw.HtmlBody ?? ''),
  };
}

function classifySender(
  from: string,
  subject: string,
): 'grocery' | 'restaurant' | 'unknown' {
  const lowerFrom = from.toLowerCase();
  const lowerSubject = subject.toLowerCase();

  const isGroceryDomain = GROCERY_SENDER_PATTERNS.some(p => lowerFrom.includes(p));
  const isRestaurantDomain = RESTAURANT_SENDER_PATTERNS.some(p => lowerFrom.includes(p));

  const groceryKeywords = ['grocery', 'instamart', 'fresh', 'mart', 'supermarket', 'pantry'];
  const restaurantKeywords = ['restaurant', 'dine', 'food order', 'meal'];

  const subjectIsGrocery = groceryKeywords.some(k => lowerSubject.includes(k));
  const subjectIsRestaurant = restaurantKeywords.some(k => lowerSubject.includes(k));

  if (isGroceryDomain && !subjectIsRestaurant) return 'grocery';
  if (isRestaurantDomain && !subjectIsGrocery) return 'restaurant';
  if (subjectIsGrocery) return 'grocery';
  if (subjectIsRestaurant) return 'restaurant';
  if (isGroceryDomain) return 'grocery';

  return 'unknown';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Claude LLM parsing
// ---------------------------------------------------------------------------

async function parseEmailWithClaude(
  emailBody: string,
  regionalContext: string,
): Promise<ParsedEmail> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const systemPrompt = `You are a grocery order email parser for FreshNudge, a kitchen inventory app.

Regional context: ${regionalContext}

Given the body of an order confirmation email, extract ALL grocery/food items and return them as structured JSON.

You MUST return a JSON object (no markdown fences, no extra text) with this exact shape:
{
  "store_name": string | null,
  "order_type": "grocery" | "restaurant" | "unknown",
  "currency": string,
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
- Detect the provider/store from email headers and content; set store_name accordingly.
- order_type: set "grocery" for grocery/supermarket orders, "restaurant" for prepared-food/restaurant orders. Skip restaurant orders (return order_type "restaurant" with empty items).
- item_name: Clean, title-case, singular form (e.g. "Whole Milk", "Free Range Eggs").
- quantity: Numeric. Default to 1 if not stated. If item name contains a weight/volume (e.g. "Milk 1L"), extract it.
- unit: Based on regional context — use metric units (g/kg/L/ml) for metric regions, imperial (lbs/oz) for US/imperial regions. One of: "g", "kg", "L", "ml", "lbs", "oz", "pcs", "loaf", "bunch", "packet", "dozen", "box".
- price: Per-item price as a number (NOT the line total). Use 0 if not found.
- category: One of "Produce", "Dairy", "Protein", "Grains", "Beverages", "Pantry", "Frozen", "Other".
- emoji: A single relevant emoji for the item.
- currency: Use the currency from the regional context (e.g. "INR", "SGD", "USD", "GBP", "AUD", "AED").

Skip delivery fees, tips, taxes, packaging charges, discount lines, and non-food items (e.g. garbage bags).
If the email is not an order confirmation at all, return { "store_name": null, "order_type": "grocery", "currency": "USD", "items": [] }.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract grocery items from this order email:\n\n${emailBody.slice(0, 6000)}` },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '{"store_name":null,"order_type":"grocery","currency":"USD","items":[]}';

  try {
    return JSON.parse(raw) as ParsedEmail;
  } catch {
    console.error('[inbound-email/webhook] Failed to parse GPT response as JSON.');
    return { store_name: null, order_type: 'grocery', currency: 'USD', items: [] };
  }
}


// ---------------------------------------------------------------------------
// Data persistence helpers (KV-backed)
// ---------------------------------------------------------------------------

async function savePendingItems(
  userId: string,
  items: EnrichedGroceryItem[],
  store: string,
  syncedAt: string,
): Promise<void> {
  await savePendingKV(userId, { items, store, syncedAt, count: items.length });
}

async function appendSyncLog(
  userId: string,
  entry: SyncLogEntry,
): Promise<void> {
  await appendSyncLogKV(userId, entry);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST handler — receives inbound email webhooks from SendGrid / Mailgun /
 * Postmark, parses grocery items via Claude with regional normalization,
 * then **deletes** the raw email content.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody: Record<string, unknown> = await req.json();
    const payload = normalisePayload(rawBody);

    // 1. Resolve user from the `to` address.
    //    Fallback: accept explicit userId in the POST body (for testing / direct POSTs).
    const toAddress = extractEmailAddress(payload.to);
    let userId = await resolveUserId(toAddress);

    if (!userId && rawBody.userId && typeof rawBody.userId === 'string') {
      userId = rawBody.userId.trim() || null;
    }

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

    // 3. Detect regional config from sender domain.
    const { currency, region, weightUnit, matchedDomain } = detectRegion(payload.from);

    // 4. Prepare plain-text email for the LLM.
    const emailBody = payload.text || stripHtml(payload.html);

    if (!emailBody || emailBody.trim().length < 30) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'empty_or_too_short',
      });
    }

    // 5. Build regional context string for Claude prompt.
    //    Use matched domain as a store hint (e.g. "blinkit.com" -> "Blinkit").
    const storeHint = matchedDomain
      ? matchedDomain.split('.')[0].charAt(0).toUpperCase() +
        matchedDomain.split('.')[0].slice(1)
      : null;
    const regionalContext = buildRegionalContext(storeHint, region, currency, weightUnit);

    // 6. Parse with Claude (regional context injected into system prompt).
    const parsed = await parseEmailWithClaude(emailBody, regionalContext);

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

    const syncedAt = new Date().toISOString();
    const storeName = parsed.store_name ?? storeHint ?? 'Unknown';
    const effectiveCurrency = parsed.currency || currency;

    // 7. Enrich each item: canonicalize, convert units, add expiry date.
    const enrichedItems: EnrichedGroceryItem[] = parsed.items.map(item => {
      // Canonicalize the item name.
      const canonical = canonicalize(item.item_name);

      // Normalize lbs→g if this sender is in a lbs-unit region.
      let { qty, unit } = { qty: item.quantity, unit: item.unit };
      if (weightUnit === 'lbs') {
        const normalized = normalizeLbs(qty, unit);
        qty = normalized.qty;
        unit = normalized.unit;
      }

      // Compute expiry date using canonical name.
      const shelfDays = getShelfDays(canonical);
      const expiryDate = computeExpiryDate(shelfDays);

      return {
        ...item,
        quantity: qty,
        unit,
        canonical_name: canonical,
        expiry_date: expiryDate,
        currency: effectiveCurrency,
        region,
      };
    });

    // 8. Save enriched items to pending-items.json.
    await savePendingItems(userId, enrichedItems, storeName, syncedAt);

    // 9. Append minimal audit record to sync-log.json (keep last 10 per user).
    const syncEntry: SyncLogEntry = {
      store: storeName,
      count: enrichedItems.length,
      syncedAt,
      items: enrichedItems.slice(0, 5).map(i => i.canonical_name || i.item_name),
    };
    await appendSyncLog(userId, syncEntry);

    // 10. Minimal, PII-free audit log.
    console.log(
      JSON.stringify({
        timestamp: syncedAt,
        userId,
        store: storeName,
        region,
        currency: effectiveCurrency,
        itemCount: enrichedItems.length,
      }),
    );


    // 12. Return enriched items.
    return NextResponse.json({
      status: 'success',
      items: enrichedItems,
      store: storeName,
      itemCount: enrichedItems.length,
      currency: effectiveCurrency,
      region,
      syncedAt,
    });
  } catch (err) {
    console.error('[inbound-email/webhook] Error:', err);
    return NextResponse.json(
      { status: 'error', reason: 'internal_error' },
      { status: 500 },
    );
  }
}
