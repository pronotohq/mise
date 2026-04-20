// FreshNudge — client-side web push helper.
// - Registers the service worker
// - Subscribes to PushManager using the VAPID public key
// - POSTs the subscription + user prefs to /api/push-subscription
// Called after the user grants Notification permission, and whenever prefs change.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = typeof window !== 'undefined' ? window.atob(base64) : '';
  const output  = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function getOrCreateUserId(): string {
  if (typeof localStorage === 'undefined') return 'anon';
  let id = localStorage.getItem('fn_user_id');
  if (!id) {
    id = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('fn_user_id', id);
  }
  return id;
}

interface SyncArgs {
  userId: string;
  name: string;
  notifTimes: Record<string, string>;
  tz: string;
  country: string;
  hasToddler: boolean;
}

export async function enablePushAndSync(args: SyncArgs): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'Push not supported in this browser' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'VAPID public key not configured (set NEXT_PUBLIC_VAPID_PUBLIC_KEY)' };
  }

  // Register SW if needed
  let reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Get or create push subscription
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (err) {
      return { ok: false, reason: `Subscribe failed: ${(err as Error).message}` };
    }
  }

  // POST to server (stores sub + prefs, indexes userId)
  const body = { userId: args.userId, subscription: sub, prefs: {
    name: args.name,
    notifTimes: args.notifTimes,
    tz: args.tz,
    country: args.country,
    hasToddler: args.hasToddler,
  }};
  try {
    const res = await fetch('/api/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, reason: `Server rejected subscription (${res.status})` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Network: ${(err as Error).message}` };
  }
}

// Lightweight re-sync when prefs change (same endpoint, no re-subscribe)
export async function resyncPrefs(args: SyncArgs): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  try {
    await fetch('/api/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: args.userId, subscription: sub, prefs: {
        name: args.name, notifTimes: args.notifTimes, tz: args.tz, country: args.country, hasToddler: args.hasToddler,
      }}),
    });
  } catch {}
}
