# Rally documentation

Rally coordinates a group plan, a studio's exact offer and each friend's own
PayPal payment. Start with the guide for the job you need to do.

The [public guides](https://rally.gowthamsarveswaran.com/docs) provide a focused
reading experience. Only curated files in `docs/site/` are published there;
operating instructions and private evidence are not served by the site.

## Use Rally

| Guide | What it covers |
| --- | --- |
| [Product guide](product-guide.md) | Create a plan, join friends, handle pickup and review an offer. |
| [Private studio questions](studio-questions.md) | Ask about an unsupported need, optionally draft a question with AI, and review the studio's reply. |
| [Payments and privacy](payments-and-privacy.md) | Who sees what, authorization versus charge, withdrawals and recovery. |
| [Studio setup](studio-setup.md) | Assign the studio operator, publish the catalog and review requests. |

The hosted release uses a fictional pottery studio and PayPal sandbox. No real
session is reserved and no live payment is taken.

## Build and operate

| Guide | What it covers |
| --- | --- |
| [Development](development.md) | Dependencies, local tests, environment configuration and running the app. |
| [Architecture](architecture.md) | Application boundaries, planning, model inference and durable payments. |
| [Deployment](deployment.md) | Existing hosting, settlement scheduling, releases and recovery. |
| [Hosted database](hosted-database.md) | Restricted roles, migrations and certificate-verified connections. |
| [Email delivery](free-smtp-2026-10-27.md) | Current SMTP setup and its dated delivery verification. |
| [PayPal webhooks](paypal-webhooks.md) | Signature verification, subscription setup and reconciliation. |
| [AI behavior and evaluation](ai-evaluation.md) | Optional drafting, confirmation boundaries and evaluation scopes. |
| [AI worker setup](ai-worker.md) | Build the included worker, configure model access and connect it to the application. |
| [Request limits](request-limits.md) | Shared quotas, failure behavior and operational checks. |
| [Private text retention](private-text-retention.md) | Saved-note expiry, draft expiry and preserved financial records. |
| [Prepared test access](test-access.md) | Isolated fictional workspaces and managed test identities. |

## Verification

[Verification](../evidence/README.md) separates actual sandbox operations,
controlled local tests, authored model evaluations and observations by people.
It includes limitations and earlier failed checks. Test counts describe the
recorded release, not proof that a friend group can use the app unassisted.

[Release history](history.md) records Rally’s dated implementation and
verification checkpoints.
