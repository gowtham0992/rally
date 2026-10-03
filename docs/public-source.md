# Repository and release policy

[gowtham0992/rally](https://github.com/gowtham0992/rally) is Rally's sole working
repository. Keep it private until the owner is ready to submit. Development,
source code, assets, migrations, tests, setup instructions and the MIT license
belong here. Do not create or synchronize a second release repository.
The owner handles all Devpost edits and submission steps.

On October 3, both GitHub repositories were verified private. The duplicate
`rally-hackathon` has exactly the same tracked files as this repository at
`5b9e383`, with source tree `614ddc7290143c04246df7cde19513fb96be94b8`.
It has no additional branches, tags, issues, pull requests, releases, webhooks
or workflow runs. Its complete Git history is saved in an ignored private
bundle inside this repository; GitHub deletion and local checkout removal
await explicit approval. Render remains connected to `rally`.

## Earlier publication

A separate snapshot repository was previously published as `rally-hackathon`
to keep personal author metadata out of the public source history. That was
premature; the owner made both repositories private and requested one repo.
The older publication records remain historical evidence. They do not describe
current visibility or authorize publication again. The initial snapshot was
`e989b63`; its source tree matched development commit `e0c6e7e`. Its latest
snapshot is `696e681`, whose tracked files match `5b9e383`.

The earlier Gitleaks audit found no secrets in tracked source or the 33
reachable development commits. An exact-value audit of 482 reachable blobs
found no current private credential matches, excluding the documented local
database connection. Those results are historical and do not prove that every
unknown or rotated credential is absent. See
[the audit](../evidence/public-source-release-audit.json).

A clean archive of `6136e2c` passed installation, eleven migrations against a
fresh disposable PostgreSQL container, TypeScript, all 123 local tests, all
22 mutation checks and the production build on Node 25.6.0. It used no private
environment files or external provider calls. This verifies controlled local
setup; the full hosted six-buyer journey remains pending. See
[clean setup evidence](../evidence/clean-source-setup.json).

Before the owner publishes this same repository for submission, recheck its
current source and history for credentials and review personal author metadata.
Keep private environment files, checkpoints, browser cookies and passwords
outside Git. Publication requires the owner's go-ahead at that time.
