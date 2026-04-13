/**
 * /api/push-subscription
 *
 * POST — Saves a browser Web Push subscription for a userId.
 *        Body: { userId: string, subscription: PushSubscription }
 *        Response: { ok: true }
 *
 * GET  ?userId=xxx — Returns the stored push subscription for that user
 *                    (used server-side when sending push notifications).
 *                    Response: { subscription: {...} } or { subscription: null }
 *
 * Data stored in data/push-subscriptions.json:
 * {
 *   "userId": {
 *     "endpoint": "https://...",
 *     "keys": { "p256dh": "...", "auth": "..." }
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushSubscriptionsFile {
  [userId: string]: StoredPushSubscription;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readSubscriptions(): Promise<PushSubscriptionsFile> {
  try {
    const raw = await fs.readFile(SUBSCRIPTIONS_FILE, 'utf-8');
    return JSON.parse(raw) as PushSubscriptionsFile;
  } catch {
    return {};
  }
}

async function writeSubscriptions(data: PushSubscriptionsFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * POST — Register or update a push subscription for a user.
 *
 * Accepts a full browser PushSubscription object but stores only the
 * fields required to send a notification (endpoint + keys).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();

    if (
      !body ||
      typeof body !== 'object' ||
      !('userId' in body) ||
      !('subscription' in body)
    ) {
      return NextResponse.json(
        { error: 'Body must include userId (string) and subscription (object).' },
        { status: 400 },
      );
    }

    const { userId, subscription } = body as {
      userId: unknown;
      subscription: unknown;
    };

    if (typeof userId !== 'string' || userId.trim().length === 0) {
      return NextResponse.json(
        { error: 'userId must be a non-empty string.' },
        { status: 400 },
      );
    }

    if (
      !subscription ||
      typeof subscription !== 'object' ||
      !('endpoint' in subscription) ||
      !('keys' in subscription)
    ) {
      return NextResponse.json(
        { error: 'subscription must include endpoint and keys.' },
        { status: 400 },
      );
    }

    const sub = subscription as {
      endpoint: unknown;
      keys: unknown;
    };

    if (
      typeof sub.endpoint !== 'string' ||
      !sub.keys ||
      typeof sub.keys !== 'object' ||
      !('p256dh' in sub.keys) ||
      !('auth' in sub.keys)
    ) {
      return NextResponse.json(
        { error: 'subscription.keys must include p256dh and auth.' },
        { status: 400 },
      );
    }

    const keys = sub.keys as { p256dh: unknown; auth: unknown };

    if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return NextResponse.json(
        { error: 'subscription.keys.p256dh and auth must be strings.' },
        { status: 400 },
      );
    }

    const stored: StoredPushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    };

    const subscriptions = await readSubscriptions();
    subscriptions[userId.trim()] = stored;
    await writeSubscriptions(subscriptions);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push-subscription] POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}

/**
 * GET ?userId=xxx
 *
 * Returns the stored push subscription for a user, or null if none exists.
 * Intended for internal server-side use when sending push notifications.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const userId = req.nextUrl.searchParams.get('userId');

    if (!userId || userId.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty userId query parameter.' },
        { status: 400 },
      );
    }

    const subscriptions = await readSubscriptions();
    const sub = subscriptions[userId.trim()] ?? null;

    return NextResponse.json({ subscription: sub });
  } catch (err) {
    console.error('[push-subscription] GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
