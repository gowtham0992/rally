import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await build({entryPoints:['src/ai/worker-main.ts'],bundle:true,platform:'node',target:'node22',format:'esm',outfile:'deploy/ai-worker/build/worker.mjs',minify:true,legalComments:'eof'});
await writeFile('deploy/ai-worker/build/THIRD_PARTY_LICENSES.txt',await readFile('node_modules/zod/LICENSE'));
console.log('AI-only worker bundled; no database, PayPal, credentials or environment files included.');
