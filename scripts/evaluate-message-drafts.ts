import {readFile,writeFile,stat,open,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {database} from '../src/db.ts';
import {clarify,gatewayConfig} from '../src/ai/clarifier.ts';
import {workerClarifier} from '../src/ai/worker-client.ts';
import {budgetedClarifier} from '../src/ai/request-budget.ts';
import {rateLimitKey} from '../src/web/rate-limits.ts';
import {draftFields,reviewDraftProposal,type DraftFields} from '../src/planning/draft.ts';
async function run(){
 const uncoached=process.env.MESSAGE_EVAL_SUITE==='uncoached';
 let cases=JSON.parse(await readFile(uncoached?'fixtures/uncoached-draft-evaluation.json':'fixtures/message-draft-evaluation.json','utf8')),catalog=JSON.parse(await readFile('fixtures/studio.json','utf8'));
 if(cases.length!==(uncoached?5:8)||cases.some((c:any)=>typeof c.text!=='string'||c.text.length>500))throw Error('FIXED_FICTIONAL_CASES_REQUIRED');
 const selected=process.env.MESSAGE_EVAL_CASE_IDS?.split(',');if(selected){if(selected.length>8||selected.some(id=>!cases.some((c:any)=>c.id===id)))throw Error('KNOWN_CASES_REQUIRED');cases=cases.filter((c:any)=>selected.includes(c.id));}
 const remote=process.env.MESSAGE_EVAL_USE_WORKER==='true',settings=remote?null:gatewayConfig();rateLimitKey();if(process.env.ENABLE_LIVE_MESSAGE_EVALUATION!=='true'){console.log(JSON.stringify({dryRun:true,configured:true,requests:cases.length,maxOutputTokensPerRequest:1400,scope:'Eight fictional notes and public studio options only; no groups, accounts or payments created.'}));return;}
 const allowancePath=uncoached?'evidence/private/uncoached-model-allowance.json':'evidence/private/message-final-model-allowance.json',approvedLimit=uncoached?10:16,approval=uncoached?'owner-uncoached-final-10':'owner-2026-10-28-final-16';
 async function reserveApprovedCall(){
  const lock=await open(allowancePath+'.lock','wx',0o600);
  try{if(((await stat(allowancePath)).mode&0o777)!==0o600)throw Error('PRIVATE_ALLOWANCE_REQUIRED');const a=JSON.parse(await readFile(allowancePath,'utf8'));
   if(a.approval!==approval||a.limit!==approvedLimit||!Number.isInteger(a.used)||a.used<0||a.used>=approvedLimit)throw Error('MODEL_APPROVAL_EXHAUSTED');
   a.used++;await writeFile(allowancePath,JSON.stringify(a)+'\n',{mode:0o600});
  }finally{await lock.close();await unlink(allowancePath+'.lock');}
 }
 const checkpoint='evidence/private/hosted-role-checkpoint.json';if(((await stat(checkpoint)).mode&0o777)!==0o600)throw Error('PRIVATE_CHECKPOINT_REQUIRED');const saved=JSON.parse(await readFile(checkpoint,'utf8'));
 const url=new URL(process.env.DATABASE_URL??'');if(url.searchParams.get('sslmode')!=='verify-full'||!url.username.endsWith('.'+saved.ref)||!url.username.startsWith('rally_app.'))throw Error('RESTRICTED_HOSTED_QUOTA_REQUIRED');
 const pool=database(url.toString());const results=[];let dispatched=0;
 try{const model=budgetedClarifier(pool,async input=>{await reserveApprovedCall();dispatched++;let diagnostic:unknown=null,syntheticModelContent:string|null=null;
 const transport:typeof fetch=async(url,init)=>{const r=await fetch(url,init);if(remote){if(!r.ok)diagnostic={stage:'WORKER',httpStatus:r.status};}else if(r.ok){try{const body=await r.clone().json();const value=body?.choices?.[0]?.message?.content;if(typeof value==='string'&&value.length<=24576)syntheticModelContent=value;}catch{}}return r;};
 const response=remote?await workerClarifier('DRAFT',undefined,transport)(input):await clarify(input,settings!,transport,event=>{diagnostic=event;},true);return Object.assign(response,{diagnostic,syntheticModelContent});});
 for(const c of cases){let result:any;try{result=await model({revisionId:randomUUID(),text:c.text,catalog});}catch{result={status:'NEEDS_REVIEW',diagnostic:{stage:'QUOTA'}};}
 const proposal=result.status==='PROPOSAL'?reviewDraftProposal(result.proposal):null,operational=!result.diagnostic||result.diagnostic.stage==='VALIDATION';let fields:DraftFields|null=null,passed=false;
 if(operational){if(c.expect==='REVIEW')passed=!proposal;else if(c.expect==='QUESTION'){const q=proposal?.question;passed=Boolean(q&&q.templateId===c.template&&c.requiredOptions.every((v:string)=>q.options.some((o:any)=>o.value===v)));}
 else if(proposal&&!proposal.question){fields=draftFields(proposal,null);const allowed={...c.allowed,...c.required};passed=Object.entries(c.required).every(([k,v])=>(fields as any)[k]===v)&&Object.entries(fields).every(([k,v])=>allowed[k]===v);}}
 results.push({id:c.id,passed,operational,expected:c.expect,fields,proposal,validatedModelProposal:result.status==='PROPOSAL'?result.proposal:null,diagnostic:result.diagnostic??null,syntheticModelContent:result.syntheticModelContent??null});
 if(!operational)break;
 }
 const report={observedAt:new Date().toISOString(),suite:uncoached?'uncoached':'original',scope:'Authored fictional first-message cases, one request each; not human usability evidence.',mode:remote?'hosted message-first draft':'message-first draft',model:settings?.model??'claude-sonnet-4-6',requests:dispatched,maxApprovedRequests:approvedLimit,maxOutputTokensPerRequest:1400,qualityPassed:results.filter(r=>r.passed).length,operationalPassed:results.filter(r=>r.operational).length,results};
 const path=`evidence/message-draft-evaluation-${Date.now()}.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:path,requests:dispatched,qualityPassed:report.qualityPassed,operationalPassed:report.operationalPassed}));if(report.qualityPassed!==cases.length)process.exitCode=1;
 }finally{await pool.end();}
}
try{await run();}catch(e){const message=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(message)?message:'MESSAGE_EVALUATION_FAILED');process.exitCode=1;}
