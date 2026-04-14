/**
 * POST /api/inbound-email/generate
 * Derives sync email from userId via HMAC. Stores token→userId in KV.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { kv } from '@vercel/kv';

const INBOUND_DOMAIN = 'inbound.freshnudge.app';
const SECRET = process.env.SYNC_EMAIL_SECRET || 'freshnudge-sync-secret-change-in-prod';

function deriveToken(userId: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(userId)
    .digest('base64url')
    .slice(0, 12);
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

    // Store token→userId in KV so the webhook can resolve it
    await kv.set(`fn:usermap:${token}`, userId, { ex: 60 * 60 * 24 * 365 }); // 1 year

    return NextResponse.json({ inboundEmail });
  } catch (err) {
    console.error('[generate] error:', err);
    return NextResponse.json({ error: 'Failed to generate address' }, { status: 500 });
  }
}
