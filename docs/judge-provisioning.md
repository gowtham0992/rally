# Offline judge preparation

The workspace foundation and resumable preparation command are implemented;
managed judge Auth cookies, role switching and the complete judge journey remain
unfinished. No managed judge accounts have been provisioned by this slice.

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

When managed judge Auth is implemented and verified, the offline command can
be run with the private local/provisioning/hosted configuration and explicit
`ENABLE_DEMO_AUTH_PROVISION=true`. Keep demo entry disabled until its managed
identity, workspace, lease, separate-cookie and stale-tab binding are proven.
The resulting preparation must not be described as real human consent, merchant
feedback, email delivery or independent PayPal buyer approval.

Evidence so far: four isolated PostgreSQL tests with simulated Auth cover
initial preparation, lost-create resumption, concurrent preparation and
trusted-metadata denial. A deliberately weakened workspace metadata guard was
caught. This does not establish hosted Admin provisioning or browser login.
