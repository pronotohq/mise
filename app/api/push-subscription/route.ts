/**
 * /api/push-subscription
 *
 * POST — Saves a browser Web Push subscription for a userId.
 *        Body: { userId: string, subscription: PushSubscription }
 *
 * GET  ?userId=xxx — Returns the stored push subscription (used server-side).
 */

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();

    if (!body || typeof body !== 'object' || !('userId' in body) || !('subscription' in body)) {
      return NextResponse.json({ error: 'Body must include userId and subscription.' }, { status: 400 });
    }

    const { userId, subscription } = body as { userId: unknown; subscription: unknown };

    if (typeof userId !== 'string' || userId.trim().length === 0) {
      return NextResponse.json({ error: 'userId must be a non-empty string.' }, { status: 400 });
    }

    if (!subscription || typeof subscription !== 'object' || !('endpoint' in subscription) || !('keys' in subscription)) {
      return NextResponse.json({ error: 'subscription must include endpoint and keys.' }, { status: 400 });
    }

    const sub = subscription as { endpoint: unknown; keys: unknown };
    if (typeof sub.endpoint !== 'string' || !sub.keys || typeof sub.keys !== 'object' || !('p256dh' in sub.keys) || !('auth' in sub.keys)) {
      return NextResponse.json({ error: 'subscription.keys must include p256dh and auth.' }, { status: 400 });
    }

    const keys = sub.keys as { p256dh: unknown; auth: unknown };
    if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return NextResponse.json({ error: 'p256dh and auth must be strings.' }, { status: 400 });
    }

    const stored: StoredPushSubscription = { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
    await kv.set(`fn:pushsub:${userId.trim()}`, stored, { ex: 60 * 60 * 24 * 365 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push-subscription] POST error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId query parameter.' }, { status: 400 });
    }

    const sub = await kv.get<StoredPushSubscription>(`fn:pushsub:${userId}`);
    return NextResponse.json({ subscription: sub ?? null });
  } catch (err) {
    console.error('[push-subscription] GET error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
