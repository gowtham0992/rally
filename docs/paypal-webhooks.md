# PayPal sandbox webhooks

The Node receiver is `POST /api/paypal/webhook`. It authenticates PayPal's
signature over the original request bytes, using the locally configured
`PAYPAL_WEBHOOK_ID`. Browser cookies and Origin are not provider authentication.

The receiver bounds JSON to 256,000 bytes, rejects malformed signature headers,
reserves the durable public API quota, and downloads RSA certificates only from
the allowlisted PayPal HTTPS certificate paths. Redirects are rejected, TLS
verification stays enabled, downloads are capped at 16 KB, and the public
certificate cache is bounded. The CRC is part of PayPal's message format;
native RSA-SHA256 verification provides authentication. Signed retries are
allowed within the certificate's validity period and deduplicated in PostgreSQL.

A verified notification records only its ID, event type and resource ID. It
can associate a capture or refund with its existing logical operation; it
cannot declare a booking or payment successful. The settlement worker still
uses independent provider GETs to verify resource ownership, amount, currency
and current status. No raw event, signature, certificate header or credential
is logged or returned to the browser.

## Configure the deployed sandbox app

1. Deploy this route to the already approved free preview. Verify HTTPS
   `/api/health` is ready and an unsigned webhook POST returns 403.
2. With the sandbox app credentials in ignored `.env.local`, run:

   ```sh
   ENABLE_SANDBOX_WEBHOOK_CONFIG=true node --env-file=.env.local --import tsx scripts/configure-paypal-webhook.ts
   ```

   This configures only `https://rally.gowthamsarveswaran.com/api/paypal/webhook`.
   It reuses an existing exact subscription, recovers an uncertain create by
   listing subscriptions, audits the provider result, and preserves unrelated
   listeners. The actual ID is stored in ignored mode-600 `.env.webhook`.
3. Save that ID in Render's private `PAYPAL_WEBHOOK_ID` environment setting
   and deploy/restart the same free service. For local processing, also load
   `.env.webhook`; do not replace local database or origin settings.
4. Generate an actual sandbox event using this app, then verify the sanitized
   database receipt and current provider resource. Resend that actual event to
   prove persistent deduplication. Retain failures as well as successful receipts.

The development simulator signs with the special ID `WEBHOOK_ID`, and its
events do not belong to the app. Rally does not fall back to that ID in its
public receiver. Disposable locally signed unit fixtures prove defensive
behavior; they are not evidence of actual PayPal delivery. Registration alone
does not prove delivery either.

## Recovery and rollback

Certificate-fetch or database failures return a sanitized 503 so PayPal can
retry; bad signatures return 403 and change no payment records. A quota denial
returns 429. Preserve the subscribed ID across compatible redeploys and keep
the durable worker operating until unresolved financial work is reconciled.
If rolling back to the previous build without a receiver, webhook deliveries
will fail and retry; do not call that a successful webhook rollback. Existing
payment operations and GET-based recovery remain schema-compatible.

References: [PayPal webhook integration](https://developer.paypal.com/api/rest/webhooks/rest/),
[Payments v2 event names](https://developer.paypal.com/api/rest/webhooks/event-names/),
[Webhook management API](https://developer.paypal.com/api/webhooks/v1/).
