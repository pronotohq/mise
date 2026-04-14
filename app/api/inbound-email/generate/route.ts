/**
 * POST /api/inbound-email/generate
 *
 * Stateless address generation — derives email from userId via HMAC.
 * Also writes userId→token to /tmp/fn-usermap.json so the webhook
 * can resolve inbound emails back to the correct userId.
 *
 * Format: sync_<12-char-base64url>@inbound.freshnudge.app
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs/promises';

const INBOUND_DOMAIN = 'inbound.freshnudge.app';
const SECRET = process.env.SYNC_EMAIL_SECRET || 'freshnudge-sync-secret-change-in-prod';
const USERMAP_FILE = '/tmp/fn-usermap.json';

function deriveToken(userId: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(userId)
    .digest('base64url')
    .slice(0, 12);
}

async function saveToUserMap(userId: string, token: string): Promise<void> {
  try {
    let map: Record<string, string> = {};
    try {
      const raw = await fs.readFile(USERMAP_FILE, 'utf-8');
      map = JSON.parse(raw);
    } catch { /* doesn't exist yet */ }
    map[userId] = token;
    await fs.writeFile(USERMAP_FILE, JSON.stringify(map), 'utf-8');
  } catch { /* /tmp write failure — non-fatal, webhook has fallback */ }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const userId = (body?.userId ?? '').toString().trim();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const token = deriveToken(userId);
    const inboundEmail = `sync_${token}@${INBOUND_DOMAIN}`;

    // Best-effort: persist mapping so webhook can resolve this userId
    await saveToUserMap(userId, token);

    return NextResponse.json({ inboundEmail });

  } catch (err) {
    console.error('[generate] error:', err);
    return NextResponse.json({ error: 'Failed to generate address' }, { status: 500 });
  }
}
