import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readdir} from 'node:fs/promises';
import {publicDocs,publicDoc,publicDocLink} from '../src/docs/catalog.ts';
import {readPublicDoc} from '../src/docs/content.ts';
import PublicMarkdown from '../app/docs/markdown.tsx';
test('public docs resolve only seven named guides and never arbitrary repository paths',async()=>{
 assert.equal(publicDocs.length,7);assert.equal(new Set(publicDocs.map(d=>d.slug)).size,7);
 for(const value of ['../README','.env.local','%2e%2e%2f.env','../../evidence/private','history','fable-live-product-review-2026-10-29','__proto__','constructor','Getting-Started','getting-started.md','getting-started/../privacy','getting-started\0']){assert.equal(publicDoc(value),undefined);assert.equal(await readPublicDoc(value),null);}
 const files=await readdir(new URL('../docs/site/',import.meta.url));assert.deepEqual(files.sort(),publicDocs.map(d=>d.slug+'.md').sort());
 for(const d of publicDocs){const loaded=await readPublicDoc(d.slug);assert.ok(loaded&&loaded.markdown.length>500);assert.ok(loaded.headings.length>=3);assert.equal(new Set(loaded.headings.map(h=>h.id)).size,loaded.headings.length);assert.ok(!/evidence\/private|\.env|SUPABASE_MANAGEMENT_TOKEN|RALLY_DEMO_ACCESS_CODE|dep-[a-z0-9]|srv-[a-z0-9]|Fable|Opus|winning odds/i.test(loaded.markdown));for(const target of [...loaded.markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)])assert.ok(publicDocLink(target[1]),`Unpublished destination in ${d.slug}: ${target[1]}`);}
});
test('public Markdown drops HTML, embeds and unsafe or unpublished destinations',()=>{
 const source='<script>alert("private")</script>\n\n<img src="https://tracker.example/pixel" onerror="alert(1)">\n\n[bad](javascript:alert) [file](file:///etc/passwd) [review](/docs/history) [secret](/api/auth/session) [relative](../../.env) [external](https://example.com) [good](/docs/privacy#who-sees-what)\n\n![tracking](https://tracker.example/pixel)\n\n## A real heading\n\n| Key | Value |\n| --- | --- |\n| hold | separate |';
 const html=renderToStaticMarkup(createElement(PublicMarkdown,null,source));assert.ok(!/<script|<img|onerror|href="(?:javascript:|file:|https:|\/api\/|\/docs\/history)/i.test(html));assert.ok(!html.includes('tracker.example'));assert.ok(!html.includes('.env'));assert.match(html,/href="\/docs\/privacy#who-sees-what"/);assert.match(html,/id="a-real-heading"/);assert.match(html,/<table>/);
 for(const href of ['/api/auth/session','/docs/private','/docs/privacy?raw=1','//evil.example','https://rally.gowthamsarveswaran.com/docs/privacy','/docs/%2e%2e/.env','javascript:alert(1)','data:text/html,x','/docs\\privacy','#<script>'])assert.equal(publicDocLink(href),null);
});
