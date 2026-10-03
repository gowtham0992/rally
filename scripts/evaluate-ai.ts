import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {clarify,gatewayConfig} from '../src/ai/clarifier.ts';
import {evaluationFixtures,fixtureContext} from '../src/ai/evaluation-fixtures.ts';
import {assessClarification,checkBaseline} from '../src/ai/evaluation.ts';

const args=process.argv.slice(2),live=args.includes('--live');
if(args.some((v,i)=>!['--live','--max-cost-usd'].includes(v)&&args[i-1]!=='--max-cost-usd'))throw new Error('Unknown evaluation option');
for(const fixture of evaluationFixtures)checkBaseline(fixture);
if(!live){
 let conservativeUsd=0,maxInputBytes=0;
 for(const fixture of evaluationFixtures){const c=fixtureContext(fixture);
  await clarify({revisionId:c.members[0].revisionId,text:fixture.text,catalog:c.catalog},{url:'https://offline.invalid',key:'offline-only',model:'claude-sonnet-4-6'},async(_url,init)=>{
   const bytes=Buffer.byteLength(String(init?.body??''));maxInputBytes=Math.max(maxInputBytes,bytes);conservativeUsd+=3*((bytes+512)*3+1400*15)/1e6;
   return new Response(null,{status:503});
  });
 }
 const plan={mode:'OFFLINE_FIXTURE_CHECK',fixtures:evaluationFixtures.length,categories:6,runsPlanned:72,baselineOracles:'passed',modelCalls:0,qualityEvaluation:'not_executed',maxInputBytes,conservativeAllowanceUsd:Math.ceil(conservativeUsd*1000)/1000};
 await mkdir('evidence/ai',{recursive:true});await writeFile('evidence/ai/evaluation-plan.json',JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify(plan));process.exit(0);
}
const cap=Number(args[args.indexOf('--max-cost-usd')+1]);
if(!args.includes('--max-cost-usd')||!Number.isFinite(cap)||cap<=0||cap>3)throw new Error('Live evaluation requires an explicitly approved cap between $0 and $3');
const config=gatewayConfig();if(config.model!=='claude-sonnet-4-6')throw new Error('Pricing must be reviewed before evaluating another model');
const id=randomUUID(),directory=`evidence/ai/evaluation-${id}`,auditDirectory=`evidence/private/ai-evaluation-${id}`;await mkdir(directory,{recursive:true});await mkdir(auditDirectory,{recursive:true});
const hash=createHash('sha256');for(const path of ['src/ai/clarifier.ts','src/ai/evaluation-fixtures.ts','src/ai/evaluation.ts','src/planning/meaning.ts','src/planning/domain.ts','src/planning/interpretation.ts','scripts/evaluate-ai.ts','fixtures/studio.json'])hash.update(await readFile(path));
const report:any={runId:id,startedAt:new Date().toISOString(),status:'RUNNING',scope:'Actual bounded model adapter calls using synthetic fixtures. Pure participant-confirmation/planning pipeline; not managed multi-account browser, usability, payment or market proof.',
 model:config.model,sourceHash:hash.digest('hex'),approvedCapUsd:cap,conservativeReservedUsd:0,requestsDispatched:0,
 rates:{inputUsdPerMillion:3,outputUsdPerMillion:15,sources:['https://platform.claude.com/docs/en/models/sonnet-4-6/overview'],policy:'Reserve UTF-8 bytes of full request plus 512 input tokens and all 1400 allowed output tokens before every dispatch. No caching discount assumed. No retries. This is a conservative allowance, not an account invoice.'},results:[],pending:null};
async function save(){const path=`${directory}/report.json`;await writeFile(path+'.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600});await rename(path+'.tmp',path);}
await save();
try{
 for(let repeat=1;repeat<=3;repeat++)for(const fixture of evaluationFixtures){
  const c=fixtureContext(fixture);let dispatched=false,inputBytes=0,providerUsage:unknown=null;
  const transport:typeof fetch=async(url,init)=>{
   if(dispatched)throw new Error('No model retries permitted');
   const body=String(init?.body??''),payload=JSON.parse(body),data=JSON.parse(payload.messages[1].content);
   if(payload.tools||payload.max_tokens!==1400||Object.keys(data).sort().join(',')!=='offerings,optionalParticipantWording,preferenceRevisionId'
    ||body.includes('8237')||c.members.some(p=>body.includes(p.memberId)))throw new Error('MODEL_PRIVACY_BOUNDARY_FAILED');
   inputBytes=Buffer.byteLength(body);const reserve=((inputBytes+512)*3+1400*15)/1e6;
   if(report.conservativeReservedUsd+reserve>cap)throw new Error('APPROVED_BUDGET_EXHAUSTED');
   report.conservativeReservedUsd+=reserve;report.requestsDispatched++;report.pending={caseId:fixture.id,repeat,dispatchedAt:new Date().toISOString()};await save();
   dispatched=true;const response=await fetch(url,init);
   if(response.ok){
    // Debug only synthetic completion text; raw provider payloads and invalid
    // model output stay in ignored private evidence, never public reports.
    const reader=response.clone().body?.getReader();
    if(reader)try{
     let length=0;const chunks:Uint8Array[]=[];
     while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>24576)break;chunks.push(value);}
     if(length<=24576){const decoded=JSON.parse(Buffer.concat(chunks).toString('utf8')),content=decoded?.choices?.[0]?.message?.content;
      if(typeof content==='string')await writeFile(`${auditDirectory}/${repeat}-${fixture.id}.json`,JSON.stringify({content},null,2)+'\n',{mode:0o600});
      const usage=decoded?.usage;if(usage&&['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(usage[k])&&usage[k]>=0))providerUsage={inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,totalTokens:usage.total_tokens};
     }
    }catch{}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   }
   return response;
  };
  const diagnostics:unknown[]=[],started=Date.now();
  const response=await clarify({revisionId:c.members[0].revisionId,text:fixture.text,catalog:c.catalog},config,transport,event=>diagnostics.push(event));
  if(!dispatched)throw new Error('Request not dispatched: privacy or budget boundary prevented model call');
  const result={repeat,...assessClarification(fixture,response),durationMs:Date.now()-started,inputBytes,providerUsage,diagnostics,response};
  report.results.push(result);report.pending=null;await save();
  console.log(JSON.stringify({caseId:fixture.id,repeat,quality:result.qualityPassed,safetyErrors:result.safetyErrors,completed:report.results.length,reservedUsd:Math.round(report.conservativeReservedUsd*1000)/1000}));
 }
 const ambiguity=evaluationFixtures.filter(f=>f.category==='ambiguity');
 const usefulStable=ambiguity.filter(f=>report.results.filter((r:any)=>r.caseId===f.id).length===3&&report.results.filter((r:any)=>r.caseId===f.id).every((r:any)=>r.usefulQuestion&&r.baselineMatched)).length;
 report.summary={completed:report.results.length,safetyFailures:report.results.filter((r:any)=>r.safetyErrors.length).length,qualityPassed:report.results.filter((r:any)=>r.qualityPassed).length,
  usefulAmbiguityFixturesAcrossAllRepeats:usefulStable,clearCasesAllCorrect:report.results.filter((r:any)=>r.category==='clear').every((r:any)=>r.qualityPassed)};
 report.status=report.summary.completed===72&&report.summary.safetyFailures===0&&usefulStable>=3&&report.summary.clearCasesAllCorrect?'PASSED':'FAILED';
}catch{report.status='INTERRUPTED';report.interruption='Execution stopped. Inspect persisted pending/diagnostics; do not automatically retry a dispatched request or start a paid rerun.';}
report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,summary:report.summary??null,report:`${directory}/report.json`}));
if(report.status!=='PASSED')process.exitCode=1;
