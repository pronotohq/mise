/**
 * FreshNudge Gmail Auto-Sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Paste this into Google Apps Script (script.google.com), set your config
 * below, then click "Run" once to grant permissions, then set a trigger:
 *   Triggers → Add trigger → onNewOrderEmail → Time-driven → Every 5 minutes
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
const FRESHNUDGE_WEBHOOK = 'https://echokitchen-lac.vercel.app/api/inbound-email/webhook';
const FRESHNUDGE_USER_ID = 'YOUR_USER_ID_HERE';  // e.g. user_rc41spjy
const LABEL_PROCESSED    = 'FreshNudge/Synced';   // created automatically

// Senders to watch for (add more as needed)
const WATCHED_SENDERS = [
  'grab.com', 'grabmart', 'foodpanda', 'pandamart',
  'blinkit.com', 'swiggy.com', 'bigbasket.com', 'zeptonow.com',
  'instacart.com', 'walmart.com', 'amazon.com',
  'ocado.com', 'tesco.com', 'woolworths.com.au',
];

// Subject keywords that confirm it's an order confirmation
const ORDER_KEYWORDS = [
  'order', 'delivered', 'delivery', 'confirmation', 'receipt', 'invoice',
  'your purchase', 'thank you for shopping', 'thanks for your order',
];
// ─────────────────────────────────────────────────────────────────────────────

function onNewOrderEmail() {
  const processedLabel = getOrCreateLabel(LABEL_PROCESSED);

  // Build Gmail search query
  const fromQuery = WATCHED_SENDERS.map(s => `from:${s}`).join(' OR ');
  const threads = GmailApp.search(`(${fromQuery}) -label:${LABEL_PROCESSED} newer_than:7d`, 0, 20);

  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(msg => {
      const subject = msg.getSubject().toLowerCase();
      const isOrderEmail = ORDER_KEYWORDS.some(kw => subject.includes(kw));
      if (!isOrderEmail) return;

      const body = msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, ' ');

      try {
        const res = UrlFetchApp.fetch(FRESHNUDGE_WEBHOOK, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            userId: FRESHNUDGE_USER_ID,
            from:    msg.getFrom(),
            to:      msg.getTo(),
            subject: msg.getSubject(),
            text:    body.slice(0, 8000),
            html:    '',
          }),
          muteHttpExceptions: true,
        });

        const result = JSON.parse(res.getContentText());
        Logger.log(`[FreshNudge] ${result.status} — ${result.itemCount || 0} items from ${result.store || 'unknown'}`);
      } catch (e) {
        Logger.log(`[FreshNudge] Error: ${e}`);
      }
    });

    // Mark thread as processed so we don't re-send
    thread.addLabel(processedLabel);
  });
}

function getOrCreateLabel(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) {
    // Create nested label (FreshNudge/Synced)
    try { label = GmailApp.createLabel(name); } catch(e) {}
  }
  return label;
}
