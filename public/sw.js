// fridgeBee Service Worker
// Handles push notifications and offline caching

const CACHE = 'fridgebee-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Handle push events (from server-sent Web Push)
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'fridgeBee 🍳', {
      body:    data.body  || 'Tap to see what to cook tonight.',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     'meal-nudge',
      renotify: true,
      data:    { url: data.url || '/' },
    })
  );
});

// Tapping the notification opens the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(e.notification.data?.url || '/');
    })
  );
});

// Handle scheduled local notification messages from the page
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIF') {
    const { title, body, delayMs } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon:  '/icon-192.png',
        badge: '/icon-192.png',
        tag:   'meal-nudge',
        renotify: true,
      });
    }, delayMs);
  }
});
