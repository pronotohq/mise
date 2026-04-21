/**
 * /api/cron/send-nudges
 *
 * Vercel Cron hits this every 5 minutes. For each subscribed user, if any of their
 * configured notifTimes falls within (now - 2min, now + 3min) in their timezone,
 * we send a web push via VAPID-signed web-push.
 *
 * Protected by CRON_SECRET — Vercel Cron adds the secret as `Authorization: Bearer <CRON_SECRET>`.
 *
 * Required env:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@domain.com)
 *   CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
// Dynamic import keeps the module out of the edge bundle analysis and is CJS-compatible
async function getWebPush() {
  const mod = await import('web-push');
  // web-push is CJS; default export lives on .default in ESM interop
  return (mod as unknown as { default: typeof import('web-push') }).default ?? mod;
}

export const runtime = 'nodejs';

interface StoredSub {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
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

// Parse "HH:MM" string → minutes since midnight
function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

// Minutes-since-midnight for "now" in a given IANA timezone
function minutesInTz(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    const h  = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
    const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
    return h * 60 + mm;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast nudge',
  lunch:     'Lunch nudge',
  snack:     'Snack time',
  dinner:    'Dinner nudge',
  tea:       'Tea time',
  latenight: 'Late-night bite',
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Auth — Vercel Cron uses Authorization header
  const auth = req.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const vPub = process.env.VAPID_PUBLIC_KEY;
  const vPri = process.env.VAPID_PRIVATE_KEY;
  const vSub = process.env.VAPID_SUBJECT || 'mailto:hello@fridgebee.com';
  if (!vPub || !vPri) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
  }
  const webpush = await getWebPush();
  webpush.setVapidDetails(vSub, vPub, vPri);

  const now = new Date();
  const WINDOW_BEFORE = 2; // minutes — covers the cron having just ticked
  const WINDOW_AFTER  = 3; // minutes

  const userIds = await kv.smembers(USERS_INDEX);
  const results: { userId: string; meal?: string; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = [];

  for (const userId of userIds) {
    try {
      const rec = await kv.get<StoredSub>(subKey(userId));
      if (!rec) { await kv.srem(USERS_INDEX, userId); continue; }

      const nowMin = minutesInTz(now, rec.prefs.tz || 'UTC');
      let mealToSend: string | null = null;

      for (const [meal, hhmm] of Object.entries(rec.prefs.notifTimes || {})) {
        const mm = hhmmToMinutes(hhmm);
        if (mm == null) continue;
        const delta = nowMin - mm;
        if (delta >= -WINDOW_BEFORE && delta <= WINDOW_AFTER) {
          mealToSend = meal;
          break;
        }
      }

      if (!mealToSend) {
        results.push({ userId, status: 'skipped' });
        continue;
      }

      // Avoid duplicate fires in the same 10-min window — dedupe key per user+meal+dayHourSlot
      const slot   = Math.floor(now.getTime() / (5 * 60 * 1000));
      const dedupe = `fn:sent:${userId}:${mealToSend}:${slot}`;
      const already = await kv.get<number>(dedupe);
      if (already) { results.push({ userId, meal: mealToSend, status: 'skipped', reason: 'dedupe' }); continue; }
      await kv.set(dedupe, 1, { ex: 60 * 10 });

      const payload = JSON.stringify({
        title: MEAL_LABEL[mealToSend] || 'fridgeBee',
        body:  `Hey ${rec.prefs.name || 'there'} — what's for ${mealToSend}? Open fridgeBee to see what you can cook.`,
        url:   '/',
        tag:   `fn-${mealToSend}`,
      });

      try {
        await webpush.sendNotification(rec.subscription, payload);
        results.push({ userId, meal: mealToSend, status: 'sent' });
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string };
        // Subscription expired/invalid → clean up
        if (e.statusCode === 404 || e.statusCode === 410) {
          await kv.del(subKey(userId));
          await kv.srem(USERS_INDEX, userId);
          results.push({ userId, meal: mealToSend, status: 'error', reason: 'subscription gone — removed' });
        } else {
          results.push({ userId, meal: mealToSend, status: 'error', reason: e.message || 'push failed' });
        }
      }
    } catch (err) {
      results.push({ userId, status: 'error', reason: (err as Error).message });
    }
  }

  const sent = results.filter(r => r.status === 'sent').length;
  return NextResponse.json({ ok: true, now: now.toISOString(), users: userIds.length, sent, results });
}
