# Offline judge preparation

Five workspaces and 35 managed fictional Auth identities have been provisioned
in Rally's existing Supabase **Free** project with the participant's explicit
approval. The same identities back local and hosted isolated fixtures; no extra
accounts are created for the hosted copies. Provisioning sends no emails.
Free includes unlimited total Auth users and 50,000 monthly active users;
35 fictional users fit that allowance without a paid plan.

`scripts/provision-demo.ts` prepares five independent workspaces, each with six
fictional friends and a separate studio identity. It uses Supabase Admin
`createUser`, confirmed synthetic `.invalid` addresses and trusted app metadata.
It does not call email invitation or OTP APIs. Existing identities are adopted
only when their exact email, verified status, workspace and role match; no
password is reset and no unrelated account is modified.

Private checkpoint and derived-password configuration are written mode 0600
under ignored `evidence/private/` and `.env.demo`. Runtime needs only the demo
master key/access code, never a management token or Auth Admin credential.
The command obtains the administrative key in memory through the existing
provisioning configuration; do not store it in runtime environment settings.

Workspace state stays PROVISIONING during partial failure. Deterministic email
lookup recovers an uncertain account-create outcome. Stable group/join commands
and database checkpoints resume without replacing identities or duplicating
groups. A session advisory lock serializes concurrent offline resumptions.
Only complete, verified initial workspaces become AVAILABLE. Available/leased
workspaces are never reseeded, reset or recycled by rerunning the command.

Each prepared group has six actual registered fictional members, with four
fixture preference records for Jordan, Riley, Casey and Taylor. Alex and Sam
start without saved preferences. No member is automatically admitted; no
collection consent, merchant request, reservation offer, payment acceptance or
PayPal operation is created. Judge UI must label this prepared fictional setup.
Each studio has its own resource and immutable published synthetic catalog.

The offline command runs with private local/provisioning/hosted configuration
and explicit `ENABLE_DEMO_AUTH_PROVISION=true`. Managed identity, workspace,
lease, separate-cookie and stale-tab binding have been verified through the
local production HTTP server. Runtime judge entry requires all three private
demo settings; it fails closed when disabled or incompletely configured.
The resulting preparation must not be described as real human consent, merchant
feedback, email delivery or independent PayPal buyer approval.

Judge sessions use a separate HttpOnly Auth namespace and a private lease.
The default lease lasts 24 hours. An optional operator setting,
`RALLY_DEMO_ACCESS_END`, sets a fixed UTC end for newly claimed workspaces only;
it must be in the future and within 90 days. The approved hosted release policy for
judging ends December 16, 2026 at 00:00 UTC, after the official December 15
08:00 Pacific judging deadline. The setting is saved and the environment-only
Render Free deployment is live. [Activation evidence](../evidence/judge-access-window-activation.json)
records healthy HTTPS, unchanged identity/workspace counts and the existing
24-hour lease duration. A fresh hosted lease was verified on October 3 through
a separate Node HTTPS client. It ends December 16 at 00:00 UTC; retrying its
entry command did not consume another workspace or extend that expiry. All
seven roles passed, stale viewers received 409, and another workspace's group
and offer returned 404. Removing only that test client's Auth cookies produced
401; the lease-only restore action recovered the same identity and expiry.
[Fresh-window evidence](../evidence/web/hosted-judge-window.json) records this
HTTP scope. A fresh browser entry for this new lease was not recorded.
Existing leases retain their original expiry, even if configuration changes.
Expired leases are never renewed or reassigned. The lease cookie lasts until
that fixed end, capped at 90 days. The managed Auth cookie remains short-lived;
the existing restore action verifies a fresh managed login for the same active
identity only while its database lease remains valid.

Selecting a friend verifies their actual managed login, atomically
changes the lease's active identity and navigates to a new document. Older
documents retain their original viewer ID; cookie refresh cannot restore the
former identity. Missing/mismatched viewer headers and normal-cookie namespace
escape are rejected. Exit clears only judge cookies, preserving personal login.

`evidence/web/judge-managed-sessions.json` records actual managed logins for all
seven roles, own-only preference projections, stale-cookie denial, restoration,
foreign-workspace denial and exit. Browser checks additionally observed Alex,
Jordan, Riley and the studio, stale-save rejection with draft retention, and a
narrow-screen toolbar. These are synthetic test users, not usability research.
The complete six-person hosted planning, collection agreements, studio approval,
six distinct PayPal buyers and confirmed captures were observed separately;
see [settlement evidence](../evidence/web/hosted-six-friend-settlement.json).
Hosted partial-failure recovery and the finished recording remain pending.

Seven PostgreSQL preparation tests and thirteen workspace/session tests cover
resumption, isolation and trusted metadata. Weakened metadata and active-identity
guards were caught. The full local suite passes 123 tests. The offline HTTP
verification command consumes one available local workspace and does not reset
or recycle it; run deliberately, not as a repeated smoke check.

## Keep the fixture bookable during judging

The original November 19/20 slots precede the official December judging period.
The offline `scripts/prepare-judging-workspaces.ts` command appends a January
14/15 catalog for each untouched, unclaimed workspace. It archives its original
planning group and creates a fresh fictional group with the same seven managed
identities and four explicitly prepared preference records. It does not carry
human availability or consent into the new dates. All original catalog,
preference and command records remain intact. No Auth account, payment,
reservation, acceptance or consent is created.

The command reads the existing mode-0600 provisioning checkpoint, requires
`ENABLE_JUDGING_PREPARATION=true`, strict hosted database TLS and the restricted
runtime role, and defaults to a read-only dry run. Add `--apply` for its fixed
five-workspace transaction. A leased workspace is preserved; any other workspace
with changed intake, model work, consent or a merchant request rejects and rolls
back the entire refresh. Concurrent/repeated execution cannot duplicate released
groups or catalogs. There is no public refresh route and no automatic recycling.

The hosted refresh replaced four untouched fixture groups and preserved the
one leased browser workspace. All 35 Auth identities are unchanged. Re-running
the original provisioning command against released catalogs intentionally
fails its original catalog checkpoint; use the release-aware preparation tool
to verify the refresh rather than overriding that protection.
The five-workspace limit still applies. Two hosted workspaces have been used
for verification and three remain untouched. No workspace was recycled and
no extra Auth identity was created. Judge instructions must explain how to
resume a claimed group and must not promise unlimited fresh booking attempts.
Catalog readiness does not establish a completed payment or judge usability test.

Source: [Supabase pricing](https://supabase.com/pricing), verified October 2,
2026, and Rally's dashboard showing its Free organization plan.

## Add capacity without recycling groups

The October 23 review calls for ten untouched workspaces. The existing hosted
dry run found three available. `scripts/expand-judging-workspaces.ts` prepares
an additive expansion with a separate mode-0600 checkpoint; it preserves the
original five-workspace checkpoint, credentials, leases and payment history.
It uses the existing provisioner and applies the future judging catalog only
to untouched new groups. A dry run makes no Auth calls or writes.

```sh
ENABLE_DEMO_AUTH_PROVISION=true node --env-file=.env.local \
  --env-file=.env.provision --env-file=.env.hosted --import tsx \
  scripts/expand-judging-workspaces.ts --available=10
```

After explicit approval for the exact additional persistent account count, add
`--apply`. The observed plan is seven new workspaces and 49 reserved-address
Auth identities, with no emails, collection consent, offers or payments. The owner approved the exact count after the initial automatic-review block.
The expansion completed: **ten untouched workspaces, twelve total**, with
49 new identities, zero emails, zero payments and zero recorded consents.
Fingerprints of the original groups, workspaces, consents and all financial
tables were unchanged. [Capacity evidence](../evidence/judge-capacity-2026-10-23.json). If interrupted, rerun the same checkpoint to
resume the registered identities and groups rather than resetting anything.
The command reports actual account creation and untouched capacity; repeat
applications adopt already registered groups. Runtime receives no Admin key.

Before final-week evaluation, use one fresh browser to rehearse managed login
through studio approval and time it. The local controlled-fixture product check
is not that managed-auth rehearsal.
