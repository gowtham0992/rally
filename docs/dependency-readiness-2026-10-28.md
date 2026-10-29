# Dependency readiness

Render’s install step reported production advisories in the existing Next.js
16.3.8 and Zod 4.6.5 pins. The follow-up pins Next.js 16.4.3 and Zod 4.6.7 and
updates the lockfile, with no application or payment-rule changes. The new
production audit reports zero advisories; all 204 tests, type checking and the
production build pass with these versions.

The vendor advisories cover [Next.js image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r),
[typed-array cache results](https://github.com/advisories/GHSA-673q-mjm6-r5xr)
and [Zod collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
The [Next.js 16.4.3 release](https://github.com/vercel/next.js/releases/tag/v16.4.3)
contains backported bug fixes.

Source inspection found no application use of `next/image`, `use cache`,
Server Actions, remote image patterns or SVG-optimization configuration. That
does not establish that framework routes are unreachable. Rally also bounds
request bodies before validation; that remains defense in depth rather than a
substitute for the Zod patch. No exploit was attempted against the live service,
and no claim about prior exploitation or its absence is made.

The older `0073eab` artifact is a historical recovery reference, not a preferred
security rollback target after this update. An attempted live rehearsal was
rejected by automatic approval review because production rollback requires
specific owner authorization. No rollback was executed. Keep patched dependencies
when rolling forward or restoring the UI. The release report records the final
deployed artifact and the owner’s decision on the optional rehearsal.
