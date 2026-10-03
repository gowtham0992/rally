import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const mutations:{name:string;file:string;from:string;to:string;pattern:string;testFile?:string}[] = [
  {name:'plan list exposes other memberships',file:'src/intake/service.ts',from:"WHERE own.user_id=$1 AND (g.state='COLLECTING' OR own.admitted)",to:"WHERE $1::uuid IS NOT NULL AND (g.state='COLLECTING' OR own.admitted)",pattern:'your plans lists only current membership',testFile:'test/intake.test.ts'},
  {name:'plan list includes excluded joiner',file:'src/intake/service.ts',from:"WHERE own.user_id=$1 AND (g.state='COLLECTING' OR own.admitted)",to:"WHERE own.user_id=$1 AND true",pattern:'your plans hides a joiner',testFile:'test/intake.test.ts'},
  {name:'plan list crosses workspace namespace',file:'src/intake/service.ts',from:"WHERE own.user_id=$1 AND (g.state='COLLECTING' OR own.admitted)\n    AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $2::text",to:"WHERE own.user_id=$1 AND (g.state='COLLECTING' OR own.admitted)\n    AND $2::text IS NOT DISTINCT FROM $2::text",pattern:'your plans cannot cross the normal',testFile:'test/demo.test.ts'},
  {name:'plan cursor loses database timestamp precision',file:'src/intake/service.ts',from:'g.created_at::text AS "createdAt"',to:'g.created_at AS "createdAt"',pattern:'your plans pages twenty records',testFile:'test/intake.test.ts'},
  {name:'leave-by accepts unpublished date',file:'src/intake/service.ts',from:'if(!catalog.slots.some(s=>localFields(s.startAt,catalog.timezone).date===finishDate))',to:'if(false)',pattern:'leave-by accepts only published local dates',testFile:'test/intake.test.ts'},
  {name:'leave-by chooses repeated time',file:'src/planning/local-time.ts',from:"if(matches.length!==1)return {status:'AMBIGUOUS'};",to:"if(false)return {status:'AMBIGUOUS'};",pattern:'leave-by rejects repeated clock times',testFile:'test/local-time.test.ts'},
  {name:'leave-by normalizes skipped time',file:'src/planning/local-time.ts',from:"if(matches.length===0)return {status:'NONEXISTENT'};",to:"if(matches.length===0)return {status:'VALID',instant:new Date(wall).toISOString()};",pattern:'leave-by rejects skipped clock times',testFile:'test/local-time.test.ts'},
  {name:'studio report changes financial cleanup',file:'src/bookings/service.ts',from:"if(!canRecordEvidence(op))throw new DomainError('PAYMENT_EVIDENCE_UNAVAILABLE');",to:"if(!canRecordEvidence(op))throw new DomainError('PAYMENT_EVIDENCE_UNAVAILABLE'); await c.query(\"UPDATE offers SET cleanup='COMPLETE' WHERE id=$1\",[op.offer_id]);",pattern:'studio completed reports never change payment truth',testFile:'test/bookings.test.ts'},
  {name:'studio evidence semantic dedupe removed',file:'src/bookings/service.ts',from:'if(existing)return {evidenceId:existing.id as string};',to:'if(false)return {evidenceId:existing.id as string};',pattern:'studio evidence concurrent retries',testFile:'test/bookings.test.ts'},
  {name:'studio evidence owner guard removed',file:'src/bookings/service.ts',from:'WHERE p.id=$1 AND m.offer_id=o.id AND s.owner_user_id=$2',to:'WHERE p.id=$1 AND m.offer_id=o.id AND $2::uuid IS NOT NULL',pattern:'studio evidence rejects participants',testFile:'test/bookings.test.ts'},
  {name:'studio evidence override fields accepted',file:'src/bookings/service.ts',from:'const evidenceSchema=z.strictObject(',to:'const evidenceSchema=z.object(',pattern:'studio evidence accepts only bounded references',testFile:'test/bookings.test.ts'},
  {name:'studio evidence stale-state fence removed',file:'src/bookings/service.ts',from:"if(op.state!==p.expectedOperationState)throw new DomainError('PAYMENT_EVIDENCE_STALE');",to:"if(false)throw new DomainError('PAYMENT_EVIDENCE_STALE');",pattern:'studio evidence fences changed',testFile:'test/bookings.test.ts'},
  {name:'undispatched payment accepts studio evidence',file:'src/bookings/service.ts',from:'=>Boolean(op.dispatched_at)&&',to:'=>true&&',pattern:'studio evidence cannot mark an uncertain capture',testFile:'test/bookings.test.ts'},
  {name:'failed capture accepts a resolution report',file:'src/bookings/service.ts',from:"op.state==='FAILED'&&['VOID','REFUND'].includes(op.kind)",to:"op.state==='FAILED'&&['VOID','REFUND','CAPTURE'].includes(op.kind)",pattern:'studio evidence keeps rejected refunds actionable',testFile:'test/bookings.test.ts'},
  {name:'studio evidence record cap removed',file:'src/bookings/service.ts',from:">=50)throw new DomainError('PAYMENT_EVIDENCE_LIMIT');",to:">=500)throw new DomainError('PAYMENT_EVIDENCE_LIMIT');",pattern:'studio evidence bounds each operation',testFile:'test/bookings.test.ts'},
  {name:'studio evidence history can be deleted',file:'db/013_payment_evidence.sql',from:'BEFORE UPDATE OR DELETE',to:'BEFORE UPDATE',pattern:'studio evidence is immutable',testFile:'test/bookings.test.ts'},
  {name:'expired AI quotations retained',file:'db/012_private_text_retention.sql',from:'WHERE source_preference_id=ANY(ids);',to:'WHERE false;',pattern:'legacy closure dates clear',testFile:'test/retention.test.ts'},
  {name:'expired private notes retained',file:'db/012_private_text_retention.sql',from:'SET optional_text=NULL,private_text_redacted_at=clock_timestamp()',to:'SET optional_text=optional_text,private_text_redacted_at=clock_timestamp()',pattern:'legacy closure dates clear',testFile:'test/retention.test.ts'},
  {name:'private retention deadline extension allowed',file:'db/012_private_text_retention.sql',from:'IF OLD.private_text_expires_at IS NOT NULL AND NEW.private_text_expires_at IS DISTINCT FROM OLD.private_text_expires_at',to:'IF false',pattern:'retention dates cannot be extended',testFile:'test/retention.test.ts'},
  {name:'expired owner projection exposes raw note',file:'src/intake/service.ts',from:"SELECT p.confirmed,p.wording_bound,\n   CASE WHEN coalesce((to_jsonb(p)->>'private_text_expires_at')::timestamptz<=clock_timestamp(),false) THEN NULL ELSE p.optional_text END AS optional_text",to:'SELECT p.confirmed,p.wording_bound,p.optional_text',pattern:'expired owner reads hide raw wording',testFile:'test/retention.test.ts'},
  {name:'temporary tables shadow elevated cleanup relations',file:'db/012_private_text_retention.sql',from:'SET search_path TO pg_catalog,%I,pg_temp',to:'SET search_path TO pg_temp,pg_catalog,%I',pattern:'temporary relations cannot shadow',testFile:'test/retention.test.ts'},
  {name:'reserved AI retry dispatches expired wording',file:'src/intake/clarifications.ts',from:"if(member.private_text_expired||!member.optional_text?.trim()||row.source_group_revision!==group.revision||row.source_preference_id!==member.current_preference_id)",to:'if(row.source_group_revision!==group.revision||row.source_preference_id!==member.current_preference_id)',pattern:'a reserved clarification retry cannot dispatch',testFile:'test/retention.test.ts'},
  {name:'studio exception ownership removed',file:'src/bookings/service.ts',from:"WHERE o.id=$1 AND s.owner_user_id=$2 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $3::text FOR UPDATE OF o",to:"WHERE o.id=$1 AND $2::uuid IS NOT NULL AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $3::text FOR UPDATE OF o",pattern:'exception reads and check commands reject',testFile:'test/bookings.test.ts'},
  {name:'studio check active lease bypassed',file:'src/bookings/service.ts',from:"AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING id",to:"AND true RETURNING id",pattern:'studio checks respect active leases',testFile:'test/bookings.test.ts'},
  {name:'studio check resets uncertain payment to fresh dispatch',file:'src/bookings/service.ts',from:"UPDATE payment_operations SET next_check_at=least(next_check_at,clock_timestamp())",to:"UPDATE payment_operations SET state='PLANNED',next_check_at=least(next_check_at,clock_timestamp())",pattern:'studio exceptions separate refund verification',testFile:'test/bookings.test.ts'},
  {name:'judge access window bound removed',file:'src/demo/access.ts',from:"if(!window.valid)throw new WebError('DEMO_UNAVAILABLE',503);",to:"if(false)throw new WebError('DEMO_UNAVAILABLE',503);",pattern:'fixed judging window applies',testFile:'test/demo.test.ts'},
  {name:'judge session calendar lead time removed',file:'src/demo/judging.ts',from:'Date.parse(s.startAt)<=Date.parse(judgingAccessEnd)+26.5*3600000',to:'false',pattern:'judging preparation rejects a past date',testFile:'test/demo-provision.test.ts'},
  {name:'noncanonical payload hash',file:'src/payments/types.ts',from:'JSON.stringify(canonical(value))',to:'JSON.stringify(value)',pattern:'three verified authorizations'},
  {name:'ownership guard removed',file:'src/payments/engine.ts',from:"if (!member) throw new DomainError('NOT_A_MEMBER',403);",to:"if (!member) throw new DomainError('WRONG_SECURITY_RESPONSE',403);",pattern:'object-level ownership'},
  {name:'expired offer accepted',file:'src/payments/engine.ts',from:"offer.state === 'OPEN' && now >= offer.deadline",to:"offer.state === 'OPEN' && false",pattern:'missing authorization at deadline'},
  {name:'failed capture ignored',file:'src/payments/engine.ts',from:"captures.some(o => o.state === 'FAILED')",to:'false',pattern:'definitive failure after a capture'},
  {name:'private resource overlap allowed',file:'db/001_payments.sql',from:"WHERE (state IN ('HELD','BOOKED'))",to:"WHERE (state = 'BOOKED')",pattern:'PostgreSQL exclusion constraint'},
  {name:'webhook signature guard removed',file:'src/payments/engine.ts',from:'!await this.provider.verifyWebhook(headers,value,raw)',to:'false',pattern:'unverified webhook'},
  {name:'webhook RSA signature verification removed',file:'src/payments/webhook-signature.ts',from:"return verify('RSA-SHA256',Buffer.from(message,'utf8'),cert.publicKey,signature);",to:'return true;',pattern:'webhook RSA verification binds',testFile:'test/webhook.test.ts'},
  {name:'webhook body reformatted before verification',file:'src/payments/webhook-signature.ts',from:'crc32(raw)',to:'crc32(Buffer.from(JSON.stringify(event)))',pattern:'webhook RSA verification binds',testFile:'test/webhook.test.ts'},
  {name:'provider amount guard removed',file:'src/payments/paypal.ts',from:"value.currency_code !== 'USD' || parseMinor(value.value) !== op.payload.amountMinor",to:'false',pattern:'changed provider amount'},
  {name:'refund parent guard removed',file:'src/payments/paypal.ts',from:'url.pathname !== expected',to:'false',pattern:'same-amount refund'},
  {name:'webhook duplicate guard removed',file:'src/payments/engine.ts',from:'if (!inserted.rowCount) return {duplicate:true};',to:'if (false) return {duplicate:true};',pattern:'verified webhooks deduplicate'},
  {name:'stale worker response allowed',file:'src/payments/engine.ts',from:'if (current.lease_token !== token) return;',to:'if (false) return;',pattern:'expired worker lease'},
  {name:'private spending ceiling ignored',file:'src/planning/domain.ts',from:'p.budgetMinor>=offering.priceMinor',to:'true',pattern:'confirmed cup-making requirement'},
  {name:'essential technique relaxed',file:'src/planning/domain.ts',from:"(p.technique==='ANY'||p.technique===offering.technique)",to:'true',pattern:'wheel-essential'},
  {name:'finish deadline ignored',file:'src/planning/domain.ts',from:'(!p.latestFinishAt||Date.parse(endAt)<=Date.parse(p.latestFinishAt))',to:'true',pattern:'incompatible finish time'},
  {name:'nominee consent ignored',file:'src/planning/domain.ts',from:'!consent.nomineeAgreed',to:'false',pattern:'collection nominee requires'},
  {name:'same-day need ignored',file:'src/planning/domain.ts',from:"(!offering.requiresLaterCollection||p.collection!=='SAME_DAY_REQUIRED')",to:'true',pattern:'same-day collection'},
  {name:'unverified catalog offered',file:'src/planning/domain.ts',from:'if(!offering.verified) continue;',to:'if(false) continue;',pattern:'unverified facts'},
  {name:'private budget added to shared card',file:'src/planning/domain.ts',from:"amountMinor:offering.priceMinor,currency:'USD'",to:"amountMinor:offering.priceMinor,budgetMinor:preferences[0].budgetMinor,currency:'USD'",pattern:'confirmed cup-making requirement'},
  {name:'interpretation source evidence ignored',file:'src/planning/interpretation.ts',from:'input.text.slice(item.sourceStart,item.sourceEnd)!==item.sourceSpan',to:'false',pattern:'interpretations need exact evidence'},
];
const results=[];
for(const mutation of mutations) {
  const file=new URL(`../${mutation.file}`,import.meta.url),original=await readFile(file,'utf8');
  if (!original.includes(mutation.from)) throw new Error(`Mutation target missing: ${mutation.name}`);
  const testFile=mutation.testFile ?? (mutation.file.includes('/planning/') ? 'test/planning.test.ts' : mutation.file.endsWith('/paypal.ts') ? 'test/paypal.test.ts' : 'test/payments.test.ts');
  const args=['--import','tsx','--test','--test-concurrency=1',`--test-name-pattern=${mutation.pattern}`,testFile];
  const baseline=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});
  if(baseline.status!==0) throw new Error(`Unmodified targeted test failed: ${mutation.name}`);
  try {
    await writeFile(file,original.replace(mutation.from,mutation.to));
    const run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});
    const output=run.stdout+run.stderr;
    const intendedFailure=output.split('\n').some(line=>/^(not ok|✖)/.test(line)&&new RegExp(mutation.pattern).test(line));
    const caught=run.status !== 0 && run.status !== null && /fail [1-9]/.test(output)&&intendedFailure;
    results.push({mutation:mutation.name,baselinePassed:true,caught,exitCode:run.status});
    console.log(`${caught ? 'CAUGHT' : 'MISSED'}: ${mutation.name}`);
  } finally {await writeFile(file,original);}
}
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../evidence/local-mutation-results.json',import.meta.url),JSON.stringify({mode:'local_database_and_simulated_provider',results},null,2));
if(results.some(r=>!r.caught)) process.exitCode=1;
