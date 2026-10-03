# Public source release

Rally's public source is
[gowtham0992/rally-hackathon](https://github.com/gowtham0992/rally-hackathon).
Anonymous GitHub API and raw-file requests verified public access, the root MIT
license, README and exact initial commit/tree. The repository contains the
tracked application, assets, fixtures, migrations, tests, setup instructions and
sanitized evidence. It contains no private environment files or checkpoints.

The initial public commit
[`e989b63`](https://github.com/gowtham0992/rally-hackathon/commit/e989b6320123f6db838783526182b7d65b840749)
is a fresh snapshot with a GitHub no-reply author. Its source tree,
`1b4bdbf958fcbe06a37919a11df139a8982f7268`, is identical to private development
commit `e0c6e7e`. The original development history remains private because its
author metadata contains a personal email address. Subsequent release commits
retain the no-reply identity; they must never push the private history to this
public repository.

Gitleaks 8.30.1 found no secrets in the tracked source, all 33 reachable private
development commits, or the public snapshot. A separate exact-value audit of
482 reachable blobs found no current private credential matches, excluding
only the deliberately documented local database connection. Private Auth,
PayPal and model credentials remain outside Git. Automated scans cannot prove
the absence of every unknown or rotated credential. See
[the audit](../evidence/public-source-release-audit.json).

A clean archive of source commit `6136e2c` passed `npm ci`, all eleven migrations
against a fresh disposable PostgreSQL container, TypeScript, all 123 local tests,
all 22 mutation checks and the production build. That verification used Node
25.6.0 and npm 11.8.0, without private env files or external provider calls. The
disposable database was removed; normal local and hosted databases were not
changed. It verifies source setup and controlled local behavior, rather than a
complete managed-identity or sandbox checkout. See
[clean setup evidence](../evidence/clean-source-setup.json).

Historical PayPal reports identify execution and verification commits from the
private development history and include source-file hashes. Those commit IDs
are not commits in this fresh public history. The release includes later
changes; the saved three-buyer runs must not be presented as verification of
the complete current hosted six-buyer journey. AI reports likewise retain their
source hashes and earlier failed runs.

Keep the public release copy synchronized from audited tracked source and
verify the resulting source tree before pushing. Private `.env` files,
checkpoints, browser cookies, passwords, original Git metadata and build caches
must remain excluded. Render continues to deploy the original development
repository manually; creating this public repository did not redeploy the app
or alter payment processing.
