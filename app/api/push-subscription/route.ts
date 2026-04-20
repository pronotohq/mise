/**
 * /api/push-subscription
 *
 * POST — Saves a browser Web Push subscription + user prefs for a userId,
 *        and adds the userId to an index so the cron job can iterate.
 *        Body: { userId, subscription, prefs: { name, notifTimes, tz, country, hasToddler } }
 *
 * GET  ?userId=xxx — Returns the stored subscription + prefs (admin/debug).
 */

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

interface StoredSub {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  prefs: {
    name: string;
    notifTimes: Record<string, string>;
    tz: string;
    country: string;
    hasToddler: boolean;
  };
  updatedAt: number;
}

const USERS_INDEX = 'fn:users';
const subKey = (userId: string) => `fn:pushsub:${userId}`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body required.' }, { status: 400 });
    }
    const { userId, subscription, prefs } = body as {
      userId?: unknown; subscription?: unknown; prefs?: unknown;
    };

    if (typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json({ error: 'userId required.' }, { status: 400 });
    }
    if (!subscription || typeof subscription !== 'object' ||
        !('endpoint' in subscription) || !('keys' in subscription)) {
      return NextResponse.json({ error: 'subscription.endpoint/keys required.' }, { status: 400 });
    }
    const sub = subscription as { endpoint: unknown; keys: unknown };
    if (typeof sub.endpoint !== 'string' || !sub.keys || typeof sub.keys !== 'object' ||
        !('p256dh' in sub.keys) || !('auth' in sub.keys)) {
      return NextResponse.json({ error: 'subscription.keys malformed.' }, { status: 400 });
    }
    const keys = sub.keys as { p256dh: unknown; auth: unknown };
    if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return NextResponse.json({ error: 'keys must be strings.' }, { status: 400 });
    }

    const p = (prefs ?? {}) as Partial<StoredSub['prefs']>;
    const record: StoredSub = {
      subscription: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      prefs: {
        name:       typeof p.name === 'string' ? p.name : '',
        notifTimes: (p.notifTimes && typeof p.notifTimes === 'object') ? p.notifTimes : {},
        tz:         typeof p.tz === 'string' ? p.tz : 'UTC',
        country:    typeof p.country === 'string' ? p.country : 'IN',
        hasToddler: !!p.hasToddler,
      },
      updatedAt: Date.now(),
    };

    await kv.set(subKey(userId.trim()), record, { ex: 60 * 60 * 24 * 180 });
    await kv.sadd(USERS_INDEX, userId.trim());

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push-subscription] POST error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    if (!userId) return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    const rec = await kv.get<StoredSub>(subKey(userId));
    return NextResponse.json({ record: rec ?? null });
  } catch (err) {
    console.error('[push-subscription] GET error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    if (!userId) return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    await kv.del(subKey(userId));
    await kv.srem(USERS_INDEX, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push-subscription] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
