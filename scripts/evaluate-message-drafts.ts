import {readFile,writeFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {database} from '../src/db.ts';
import {clarify,gatewayConfig} from '../src/ai/clarifier.ts';
import {budgetedClarifier} from '../src/ai/request-budget.ts';
import {rateLimitKey} from '../src/web/rate-limits.ts';
import {draftFields,reviewDraftProposal,type DraftFields} from '../src/planning/draft.ts';
async function run(){
 let cases=JSON.parse(await readFile('fixtures/message-draft-evaluation.json','utf8')),catalog=JSON.parse(await readFile('fixtures/studio.json','utf8'));
 if(cases.length!==8||cases.some((c:any)=>typeof c.text!=='string'||c.text.length>500))throw Error('FIXED_FICTIONAL_CASES_REQUIRED');
 const selected=process.env.MESSAGE_EVAL_CASE_IDS?.split(',');if(selected){if(selected.length>8||selected.some(id=>!cases.some((c:any)=>c.id===id)))throw Error('KNOWN_CASES_REQUIRED');cases=cases.filter((c:any)=>selected.includes(c.id));}
 const settings=gatewayConfig();rateLimitKey();if(process.env.ENABLE_LIVE_MESSAGE_EVALUATION!=='true'){console.log(JSON.stringify({dryRun:true,configured:true,requests:cases.length,maxOutputTokensPerRequest:1400,scope:'Eight fictional notes and public studio options only; no groups, accounts or payments created.'}));return;}
 const checkpoint='evidence/private/hosted-role-checkpoint.json';if(((await stat(checkpoint)).mode&0o777)!==0o600)throw Error('PRIVATE_CHECKPOINT_REQUIRED');const saved=JSON.parse(await readFile(checkpoint,'utf8'));
 const url=new URL(process.env.DATABASE_URL??'');if(url.searchParams.get('sslmode')!=='verify-full'||!url.username.endsWith('.'+saved.ref)||!url.username.startsWith('rally_app.'))throw Error('RESTRICTED_HOSTED_QUOTA_REQUIRED');
 const pool=database(url.toString());const results=[];let dispatched=0;
 try{const model=budgetedClarifier(pool,async input=>{dispatched++;let diagnostic:unknown=null;const response=await clarify(input,settings,fetch,event=>{diagnostic=event;},true);return Object.assign(response,{diagnostic});});
 for(const c of cases){let result:any;try{result=await model({revisionId:randomUUID(),text:c.text,catalog});}catch{result={status:'NEEDS_REVIEW',diagnostic:{stage:'QUOTA'}};}
 const proposal=result.status==='PROPOSAL'?reviewDraftProposal(result.proposal):null,operational=!result.diagnostic||result.diagnostic.stage==='VALIDATION';let fields:DraftFields|null=null,passed=false;
 if(operational){if(c.expect==='REVIEW')passed=!proposal;else if(c.expect==='QUESTION'){const q=proposal?.question;passed=Boolean(q&&q.templateId===c.template&&c.requiredOptions.every((v:string)=>q.options.some((o:any)=>o.value===v)));}
 else if(proposal&&!proposal.question){fields=draftFields(proposal,null);const allowed={...c.allowed,...c.required};passed=Object.entries(c.required).every(([k,v])=>(fields as any)[k]===v)&&Object.entries(fields).every(([k,v])=>allowed[k]===v);}}
 results.push({id:c.id,passed,operational,expected:c.expect,fields,proposal,validatedModelProposal:result.status==='PROPOSAL'?result.proposal:null,diagnostic:result.diagnostic??null});
 }
 const report={observedAt:new Date().toISOString(),scope:'Authored fictional first-message cases, one request each; not human usability evidence.',mode:'message-first draft',model:settings.model,requests:dispatched,maxApprovedRequests:cases.length,maxOutputTokensPerRequest:1400,qualityPassed:results.filter(r=>r.passed).length,operationalPassed:results.filter(r=>r.operational).length,results};
 const path=`evidence/message-draft-evaluation-${Date.now()}.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:path,requests:dispatched,qualityPassed:report.qualityPassed,operationalPassed:report.operationalPassed}));if(report.qualityPassed!==cases.length)process.exitCode=1;
 }finally{await pool.end();}
}
try{await run();}catch(e){const message=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(message)?message:'MESSAGE_EVALUATION_FAILED');process.exitCode=1;}
