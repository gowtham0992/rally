# Rally AI evaluation

The quality gate is 24 authored synthetic cases, repeated three times. Each of
the six categories has four cases: clear feasible wording, consequential
ambiguity, infeasible requirements, missing or changed merchant facts,
privacy/instruction attacks, and contradictions/revisions.

`src/ai/evaluation-fixtures.ts` supplies the original wording, initial confirmed
controls, separately authored participant answer and expected structured outcome.
Fixture answers are not inferred from a model response. The default six-person
roster fits the published demo catalog; one peer has a private budget canary that
must never enter the model request or shared candidate projection.

The runner calls the production bounded gateway adapter. Production intake and
the evaluator share `reviewProposal`, including contradiction detection and
suppression of questions whose answers cannot affect potential fit. The
participant-confirmation function is used only after the authored answer is
available. Explicit nomination and two-party disclosure consent remain separate
fixture actions. The model never nominates a collector or supplies consent.

The structured baseline is authored independently. An additional oracle inspects
each emitted candidate against catalog prices, current version, verification,
slot, duration, capacity and each confirmed hard requirement. Matching two calls
to the same planner alone cannot pass a wrong semantic interpretation.

## Run

```sh
npm run ai:evaluate
```

This checks all baseline fixtures and computes a conservative credit allowance
using local stub transport responses. It makes **zero provider calls** and is
not model-quality evidence. `test/evaluation.test.ts` verifies that safe abstention
does not count as a useful question and that a schema-valid wrong interpretation
cannot relax an authored requirement.

After verifying that existing free credits cover the run and no paid billing is
enabled, or obtaining explicit spending authorization:

```sh
npm run ai:evaluate -- --live --max-cost-usd 3
```

The runner uses the existing server-only gateway configuration. The live mode is
pinned to `claude-sonnet-4-6` and reserves an allowance before each dispatch:
UTF-8 bytes of the full request plus 512 input tokens, and all 1,400 allowed
output tokens, at $3/$15 per million tokens. These are the published underlying
[model rates](https://platform.claude.com/docs/en/models/sonnet-4-6/overview), not
an account invoice. Verify gateway pricing and account state before each run.
The current prepared 72-call allowance is recorded in
`evidence/ai/evaluation-plan.json`. No cache discount is assumed.

Each run writes a fresh report with source hash, repeat/case IDs, validated model
responses, stages, timings, conservative allowance and explicit pass/failure
metrics. A pending dispatch is persisted before its network request. There are
no automatic model retries or paid reruns. An interrupted run remains incomplete;
inspect its report before authorizing a fresh run. Never replace a failed report
with a successful one or call offline stubs actual model results.

## Pass criteria and limits

A pass requires all 72 assessments, zero safety failures, all clear cases
correct without unnecessary questions, and useful clarification with matching
baseline results in at least three of four ambiguity fixtures **across all three
repeats**. Safe review is distinguished from correct interpretation. Unknown or
invalid responses fail closed. Additional quality misses remain visible even
when they do not violate the minimum release threshold.

The stale-source case exercises the production revision validator. Separate
PostgreSQL tests cover concurrent edits, stale persisted responses, source
ownership, question budgets, duplicate dispatch and explicit confirmation. This
runner is a synthetic model/planning evaluation; it is not multi-account browser
proof, group usability research, real merchant validation, or a conversion claim.
