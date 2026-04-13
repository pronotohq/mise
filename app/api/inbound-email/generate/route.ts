/**
 * POST /api/inbound-email/generate
 *
 * Generates a unique inbound email address for a FreshNudge user.
 * Each user gets one address like `user_abc123@inbound.freshnudge.app`.
 * They forward grocery order confirmation emails to this address, and
 * our webhook parses items then **immediately deletes** the raw email.
 *
 * ## Privacy approach
 * - The mapping file stores only `{ userId -> inboundEmail }`.
 * - No email content, PII, or credentials are persisted here.
 * - The inbound address acts as a pseudonymous relay — it cannot be
 *   reverse-mapped to a real email without this server-side mapping.
 *
 * ## Storage (MVP)
 * Uses a JSON file on disk (`data/inbound-mappings.json`). This is
 * intentionally simple for the MVP and should migrate to a database
 * (e.g. Vercel KV, Supabase) before production launch.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/** Directory where the mapping file lives (project root / data). */
const DATA_DIR = path.join(process.cwd(), 'data');

/** Full path to the JSON mapping file. */
const MAPPINGS_FILE = path.join(DATA_DIR, 'inbound-mappings.json');

/** Domain used for generated inbound addresses. */
const INBOUND_DOMAIN = 'inbound.freshnudge.app';

/**
 * Shape of the mapping file: userId -> inbound email address.
 */
interface MappingsFile {
  [userId: string]: string;
}

/**
 * Reads the current mappings from disk. Returns an empty object if
 * the file doesn't exist yet.
 */
async function readMappings(): Promise<MappingsFile> {
  try {
    const raw = await fs.readFile(MAPPINGS_FILE, 'utf-8');
    return JSON.parse(raw) as MappingsFile;
  } catch {
    // File doesn't exist yet — that's fine for the first call.
    return {};
  }
}

/**
 * Persists the mappings object to disk, creating the data directory
 * if it doesn't already exist.
 */
async function writeMappings(mappings: MappingsFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), 'utf-8');
}

/**
 * Generates a short, URL-safe random token for the local part of the
 * inbound address. 9 bytes -> 12 base64url chars, giving ~2^72
 * possible values — collision-resistant without a counter.
 */
function generateToken(): string {
  return crypto.randomBytes(9).toString('base64url');
}

/**
 * POST handler — accepts `{ userId }` and returns `{ inboundEmail }`.
 *
 * If the user already has a mapping, the existing address is returned
 * (idempotent). Otherwise a new address is generated and stored.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();

    if (
      !body ||
      typeof body !== 'object' ||
      !('userId' in body) ||
      typeof (body as Record<string, unknown>).userId !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid userId (string required).' },
        { status: 400 },
      );
    }

    const userId = (body as { userId: string }).userId.trim();
    if (userId.length === 0) {
      return NextResponse.json(
        { error: 'userId must be a non-empty string.' },
        { status: 400 },
      );
    }

    const mappings = await readMappings();

    // Idempotent: return existing address if one is already assigned.
    if (mappings[userId]) {
      return NextResponse.json({ inboundEmail: mappings[userId] });
    }

    // Generate a new unique address.
    const token = generateToken();
    const inboundEmail = `user_${token}@${INBOUND_DOMAIN}`;

    mappings[userId] = inboundEmail;
    await writeMappings(mappings);

    return NextResponse.json({ inboundEmail });
  } catch (err) {
    console.error('[inbound-email/generate] Error:', err);
    return NextResponse.json(
      { error: 'Failed to generate inbound email address.' },
      { status: 500 },
    );
  }
}
