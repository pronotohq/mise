/**
 * fridgeBee Gmail Auto-Sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Paste this into Google Apps Script (script.google.com), set your config
 * below, then click "Run" once to grant permissions, then set a trigger:
 *   Triggers → Add trigger → onNewOrderEmail → Time-driven → Every 5 minutes
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
const FRIDGEBEE_WEBHOOK = 'https://echokitchen-lac.vercel.app/api/inbound-email/webhook';
const FRIDGEBEE_USER_ID = 'YOUR_USER_ID_HERE';  // e.g. user_rc41spjy
const LABEL_PROCESSED    = 'fridgeBee/Synced';   // created automatically

// Senders to watch — matched against the From address domain
const WATCHED_SENDERS = [
  // Singapore / SEA
  'grab.com', 'grabmart.com', 'foodpanda.com', 'foodpanda.sg', 'pandamart.com',
  'redmart.com', 'fairprice.com.sg',
  // India
  'blinkit.com', 'swiggy.com', 'bigbasket.com', 'zeptonow.com',
  // US
  'instacart.com', 'walmart.com', 'doordash.com',
  // UK / AU
  'ocado.com', 'tesco.com', 'sainsburys.co.uk', 'woolworths.com.au', 'coles.com.au',
];

// ─────────────────────────────────────────────────────────────────────────────
// No subject filter — sender domain alone is the signal.
// GPT will skip non-order emails (promos, receipts with no items, etc.)

function onNewOrderEmail() {
  const processedLabel = getOrCreateLabel(LABEL_PROCESSED);

  // Build Gmail search query — sender domain only, no subject filtering
  const fromQuery = WATCHED_SENDERS.map(s => `from:${s}`).join(' OR ');
  const threads = GmailApp.search(`(${fromQuery}) -label:${LABEL_PROCESSED} newer_than:7d`, 0, 20);

  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(msg => {
      const body = msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, ' ');

      try {
        const res = UrlFetchApp.fetch(FRIDGEBEE_WEBHOOK, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            userId: FRIDGEBEE_USER_ID,
            from:    msg.getFrom(),
            to:      msg.getTo(),
            subject: msg.getSubject(),
            text:    body.slice(0, 8000),
            html:    '',
          }),
          muteHttpExceptions: true,
        });

        const result = JSON.parse(res.getContentText());
        Logger.log(`[fridgeBee] ${result.status} — ${result.itemCount || 0} items from ${result.store || 'unknown'}`);
      } catch (e) {
        Logger.log(`[fridgeBee] Error: ${e}`);
      }
    });

    // Mark thread as processed so we don't re-send
    thread.addLabel(processedLabel);
  });
}

function getOrCreateLabel(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) {
    // Create nested label (fridgeBee/Synced)
    try { label = GmailApp.createLabel(name); } catch(e) {}
  }
  return label;
}
