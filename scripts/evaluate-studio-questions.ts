import {readFile,writeFile,open,unlink,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {database} from '../src/db.ts';
import {RequestLimiter,rateLimitKey} from '../src/web/rate-limits.ts';
import {draftStudioQuestion,type QuestionDiagnostic} from '../src/ai/studio-question.ts';
import {gatewayConfig,boundedBody} from '../src/ai/clarifier.ts';
import {questionFromEvidence} from '../src/ai/studio-question.ts';
import {assessQuestionCase} from '../src/ai/studio-question-evaluation.ts';
import {checkQuestionPrivacy} from '../src/intake/studio-questions.ts';
// Operator-created, owner-only approval ledger. This command never silently
// grants itself calls, changes spending controls or retries a failed response.
async function run(){
 const bytes=await readFile('fixtures/studio-question-evaluation.json'),suite=JSON.parse(bytes.toString()),catalog=JSON.parse(await readFile('fixtures/studio.json','utf8'));
 const hash=createHash('sha256').update(bytes).digest('hex');if(suite.cases.length!==6||suite.cases.some((c:any)=>typeof c.text!=='string'||c.text.length>500))throw Error('FIXED_FICTIONAL_CASES_REQUIRED');
 if(process.env.ENABLE_LIVE_STUDIO_QUESTION_EVALUATION!=='true'){console.log(JSON.stringify({dryRun:true,requests:6,maxOutputTokensPerRequest:600,fixtureHash:hash}));return;}
 const corrective=process.env.RALLY_QUESTION_CORRECTIVE_EVALUATION==='true',correction=process.env.RALLY_QUESTION_FIX_EVALUATION==='true',ledger=corrective?'evidence/private/studio-question-corrective-model-allowance.json':correction?'evidence/private/studio-question-fix-model-allowance.json':'evidence/private/studio-question-model-allowance.json',limit=corrective?6:correction?8:6,approval=corrective?'owner-2026-11-03-six-question-corrective-checks':correction?'owner-2026-11-03-eight-question-fix-checks':'owner-2026-11-03-six-question-checks';
 if(((await stat(ledger)).mode&0o777)!==0o600)throw Error('PRIVATE_APPROVAL_REQUIRED');
 const settings=gatewayConfig(),url=new URL(process.env.DATABASE_URL??'');if(!url.username.startsWith('rally_app.')||url.searchParams.get('sslmode')!=='verify-full')throw Error('RESTRICTED_HOSTED_QUOTA_REQUIRED');
 const pool=database(url.toString()),results=[],captures:unknown[]=[];let dispatched=0;
 try{for(const c of suite.cases){
  await new RequestLimiter(pool,rateLimitKey()).reserve('MODEL_GLOBAL','application');
  const lock=await open(ledger+'.lock','wx',0o600);
  try{const a=JSON.parse(await readFile(ledger,'utf8'));if(a.approval!==approval||a.limit!==limit||a.fixtureHash!==hash||!Number.isInteger(a.used)||a.used<0||a.used>=limit)throw Error('MODEL_APPROVAL_EXHAUSTED');a.used++;await writeFile(ledger,JSON.stringify(a)+'\n',{mode:0o600});}
  finally{await lock.close();await unlink(ledger+'.lock');}
  let httpStatus:number|null=null,diagnostic:QuestionDiagnostic|null=null,privacyRejected=false;dispatched++;
  const result=await draftStudioQuestion({revisionId:randomUUID(),text:c.text,catalog},settings,async(url,init)=>{const r=await fetch(url,init);httpStatus=r.status;
   // Fixed fictional fixtures only. Keep bounded model content privately so a
   // transport/parser failure can be diagnosed without spending another call.
   try{const body=await boundedBody(r.clone()),choice=body?.choices?.[0];captures.push({id:c.id,httpStatus:r.status,finishReason:choice?.finish_reason,content:choice?.message?.content,usage:body?.usage});}catch{captures.push({id:c.id,httpStatus:r.status,captureUnavailable:true});}
   await writeFile(corrective?'evidence/private/studio-question-corrective-responses.json':'evidence/private/studio-question-fix-responses.json',JSON.stringify(captures,null,2)+'\n',{mode:0o600});return r;
  },event=>{diagnostic=event;});
  let question:string|null=null;try{if(result.status==='QUESTION_DRAFT'){question=questionFromEvidence(result.draft);checkQuestionPrivacy(question,['Alex','Sam','Jordan','Riley','Casey','Taylor']);}}catch{question=null;privacyRejected=true;}
  const transportSucceeded=httpStatus===200,modelDecisionParsed=result.status==='QUESTION_DRAFT'||(diagnostic as QuestionDiagnostic|null)?.stage==='MODEL_REVIEW';
  const passed=!privacyRejected&&assessQuestionCase(c,{httpStatus,question,diagnostic});
  results.push({id:c.id,expected:c.expected,transportSucceeded,modelDecisionParsed,httpStatus,diagnostic,privacyRejected,passed,question,validatedEvidence:result.status==='QUESTION_DRAFT'?result.draft:null});if(!transportSucceeded)break;
 }
 const report={observedAt:new Date().toISOString(),scope:'Six authored fictional cases, one call each. Parser/provider failures do not count as correct abstentions. Not independent usability evidence or a general model-reliability estimate.',model:settings.model,requests:dispatched,maxApprovedRequests:limit,maxOutputTokensPerRequest:600,qualityPassed:results.filter(r=>r.passed).length,usefulDrafts:results.filter(r=>r.expected==='DRAFT'&&r.passed).length,results};
 const path=`evidence/studio-question-evaluation-${Date.now()}.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:path,requests:dispatched,qualityPassed:report.qualityPassed}));if(report.qualityPassed!==6)process.exitCode=1;
 }finally{await pool.end();}
}
try{await run();}catch(e){const message=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(message)?message:'QUESTION_EVALUATION_FAILED');process.exitCode=1;}
