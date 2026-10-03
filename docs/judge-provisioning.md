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

Judge sessions use a separate HttpOnly Auth namespace and a 24-hour private
lease. Selecting a friend verifies their actual managed login, atomically
changes the lease's active identity and navigates to a new document. Older
documents retain their original viewer ID; cookie refresh cannot restore the
former identity. Missing/mismatched viewer headers and normal-cookie namespace
escape are rejected. Exit clears only judge cookies, preserving personal login.

`evidence/web/judge-managed-sessions.json` records actual managed logins for all
seven roles, own-only preference projections, stale-cookie denial, restoration,
foreign-workspace denial and exit. Browser checks additionally observed Alex,
Jordan, Riley and the studio, stale-save rejection with draft retention, and a
narrow-screen toolbar. These are synthetic test users, not usability research.
The complete six-person planning, consent and independent PayPal buyer journey
still needs browser verification before submission instructions are final.

Four PostgreSQL preparation tests and eleven workspace/session tests cover
resumption, isolation and trusted metadata. Weakened metadata and active-identity
guards were caught. The full local suite passes 110 tests. The offline HTTP
verification command consumes one available local workspace and does not reset
or recycle it; run deliberately, not as a repeated smoke check.

Source: [Supabase pricing](https://supabase.com/pricing), verified October 2,
2026, and Rally's dashboard showing its Free organization plan.
