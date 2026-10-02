import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {clarify,gatewayConfig} from '../src/ai/clarifier.ts';
const revisionId=randomUUID(),text='I leave Friday.',catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
const config=gatewayConfig(),result=await clarify({revisionId,text,catalog},config,fetch,event=>console.log(JSON.stringify(event)));
const report={scope:'One actual Astropods model call using synthetic wording and catalog, not a participant’s private input. This is connection proof, not the required quality evaluation.',model:config.model,result};
await mkdir('evidence/ai',{recursive:true});await writeFile('evidence/ai/connection.json',JSON.stringify(report,null,2)+'\n');
if(result.status!=='PROPOSAL')throw new Error('AI connection did not produce a validated proposal; inspect account status without logging secrets.');
console.log(JSON.stringify({status:result.status,model:config.model,interpretations:result.proposal.interpretations.length,question:result.proposal.question?.templateId??null}));
