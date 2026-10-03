# Rally sandbox hosting

Use `https://rally.gowthamsarveswaran.com` for the sandbox product. Keep the
existing Supabase Auth/database and Astropods gateway. Deploy the existing
Render web service and settlement worker from `render.yaml`; AWS adds no
needed capability to this release.

## Verified account preflight

Read-only checks on October 2, 2026 found:

- Cloudflare manages `gowthamsarveswaran.com` on its Free plan. Its eight DNS
  records include the portfolio, Kin and email routing. There is no `rally`
  record or wildcard record in the observed table.
- The Render Hobby workspace has zero services, $50.00 remaining hackathon
  credit, no pending charges and no card on file. The credit expires
  September 30, 2027. The dashboard says credits apply to the next invoice.
- Render's current price is $7/month for each 0.5 CPU / 512 MB service
  (legacy `starter`, still supported in Blueprints). Two instances cost
  $14/month in base compute. $50 covers about 3.57 months of this compute
  alone; bandwidth, builds and any other usage reduce that runway.
- The workspace includes two custom domains and is using none. This
  subdomain fits the included allocation. Render supplies HTTPS certificates.

This is a preflight, not a deployed-site claim. Confirm the final creation UI
accepts the credits without requiring a payment method, paid charge or new
agreement before provisioning. Do not add a card, upgrade the workspace,
enable autoscaling or accept extra costs under the current authorization.
Provider behavior after credit exhaustion for paid services has not been
verified. Review remaining credit before every deployment and suspend the
demo before it can consume the authorized balance; never promise an automatic
hard spending cap based only on the absence of a card.

## Release order

1. Finish isolated judge access and verify distinct managed sessions, privacy,
   stale-tab role binding, checkout and recovery. Public opening depends on
   those gates; synthetic accounts are not observed human consent or feedback.
2. Apply additive migrations to hosted `rally_private` using the provisioning
   owner, then run the restricted-role/TLS audit. Runtime never receives the
   provisioning token or Auth admin secret. See `hosted-database.md`.
3. Deploy one web process and one worker from the same reviewed commit. Inject
   hosted secrets through Render; do not deploy local database credentials or
   private evidence. Keep automatic deployment off during verification.
4. Verify readiness and recovery with the service's assigned `onrender.com`
   hostname. Obtain that actual hostname before configuring DNS.
5. Add the exact custom hostname `rally.gowthamsarveswaran.com` to the web
   service. Add one Cloudflare CNAME named `rally`, targeting the actual
   assigned hostname, with **DNS only** and TTL Auto. Do not use a guessed
   `rally.onrender.com` target. This single-subdomain release does not require
   an apex, `www`, wildcard, nameserver or global SSL-mode change.
6. Verify the domain and valid TLS in Render. Review any conflicting record
   or CAA restriction for this hostname if verification fails.
7. Set `APP_ORIGIN=https://rally.gowthamsarveswaran.com` on the web service.
   Register the matching Supabase login callback and site URL; check the
   application's generated sandbox PayPal return/cancel URLs and register
   the incoming sandbox webhook endpoint. Preserve useful local Auth
   redirects for development.
8. From the custom domain, prove login return, private participant intake,
   merchant approval, sandbox checkout return and worker recovery. Check
   browser-visible errors, server readiness and payment exceptions during
   the initial release. Only then use this URL in judge instructions.

## Undo

Before release, exercise demo-disable and previous-commit redeployment using
the expanded schema. Keep additive tables and all payment history. Do not
run a populated down migration as a deployment rollback. If checkout has
started, the settlement worker must remain running until outstanding
authorizations/captures are reconciled and recovery is complete. Suspend
new checkout before rolling back a web release; no DNS change compensates
a payment. These hosting undo drills remain pending until deployment.

Sources: [Render pricing](https://render.com/pricing),
[compute-plan compatibility](https://render.com/docs/compute-plans),
[custom domains and HTTPS](https://render.com/docs/custom-domains),
[Cloudflare DNS setup](https://render.com/docs/configure-cloudflare-dns).
