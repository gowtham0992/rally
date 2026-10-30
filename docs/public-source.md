# Repository and release policy

> Historical record. This document describes its original checkpoint or proposed
> study, not current product instructions. Start with the [documentation](README.md)
> or [development history](history.md) for context.

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
bundle inside this repository. With the owner's explicit approval, the duplicate
GitHub repository and local checkout were deleted. GitHub displayed its deletion
success message and the retained `rally` repository as private. Render remains
connected to `rally`.

## Current verification

See [the dated current record](../evidence/current-verification.json) and
[the evidence index](../evidence/README.md). The current test path needs no
external account credentials. Repository visibility remains private.

## Earlier clean setup at 4b3d712

A clean archive of `4b3d712` passed an offline locked dependency installation,
all thirteen migrations on a fresh disposable loopback PostgreSQL container,
TypeScript, all 151 local tests, all 40 mutation checks and the production build
on Node 25.6.0 with npm 11.8.0. The weakened source was restored exactly;
both the temporary database and checkout were removed. No private environment
files or external provider credentials were supplied.
See [October 2 setup evidence](../evidence/clean-source-setup-current.json).

This proves controlled local setup for that revision. It does not prove
anonymous access to the private repository, hosted recovery, or compatibility
with the minimum Node version. The separate six-buyer hosted happy path is
verified in [settlement evidence](../evidence/web/hosted-six-friend-settlement.json).

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
environment files or external provider calls. That was an earlier local proof;
the hosted six-buyer journey had not been completed then. See
[clean setup evidence](../evidence/clean-source-setup.json).

Before the owner publishes this same repository for submission, recheck its
current source and history for credentials and review personal author metadata.
Keep private environment files, checkpoints, browser cookies and passwords
outside Git. Publication requires the owner's go-ahead at that time.
