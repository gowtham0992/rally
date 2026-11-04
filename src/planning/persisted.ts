import type {PoolClient} from 'pg';
import {catalogSchema,preferenceSchema,planGroup,type Consent} from './domain.ts';
import {fingerprint} from '../payments/types.ts';
import {planningPreference,studioContactAgreed,studioQuestionAgreed} from './studio-contact.ts';
// Caller must hold the planning-group lock for writes/revalidation. None of these
// private rows may be serialized to a participant or merchant response.
export async function confirmedPlan(client:PoolClient,groupId:string,catalogValue:unknown){
 const catalog=catalogSchema.parse(catalogValue);
 const rows=(await client.query(`SELECT m.id,m.user_id,m.display_name,p.id AS preference_id,p.confirmed,p.wording_bound
  FROM planning_members m JOIN preference_revisions p ON p.id=m.current_preference_id
  WHERE m.group_id=$1 AND m.admitted AND NOT coalesce((to_jsonb(m)->>'excluded')::boolean,false) ORDER BY m.id`,[groupId])).rows;
 const preferences=rows.map(r=>planningPreference(r.confirmed,r.wording_bound,catalog));
 if(preferences.some((p,i)=>p.memberId!==rows[i].id||p.revisionId!==rows[i].preference_id))throw new Error('Invalid preference ownership');
 const boundRows=rows.filter(r=>r.wording_bound?.studioQuestion);
 if(boundRows.length){
  // Database time is authoritative for the retained exchange. An application
  // clock skew or retained marker cannot revive an expired/missing answer.
  const present=(await client.query("SELECT to_regclass('studio_questions') IS NOT NULL AS present")).rows[0].present;
  const live=present?(await client.query("SELECT id,member_id,accepted_preference_id FROM studio_questions WHERE id=ANY($1::uuid[]) AND studio_id=$2 AND catalog_version_id=$3 AND decision='CAN_ACCOMMODATE' AND expires_at>clock_timestamp()",[boundRows.map(r=>r.wording_bound.studioQuestion.questionId),catalog.studioId,catalog.versionId])).rows:[];
  for(let i=0;i<rows.length;i++)if(rows[i].wording_bound?.studioQuestion&&!live.some(q=>q.id===rows[i].wording_bound.studioQuestion.questionId&&q.member_id===rows[i].id&&q.accepted_preference_id===rows[i].preference_id))preferences[i]={...preferences[i],extraRequirement:'MERCHANT_REVIEW_REQUIRED'};
 }
 const consentRows=(await client.query(`SELECT cs.* FROM collection_consents cs
  JOIN planning_members m ON m.id=cs.owner_member_id AND m.current_preference_id=cs.preference_id
  WHERE m.group_id=$1 AND m.admitted ORDER BY cs.preference_id`,[groupId])).rows;
 const consents:Consent[]=consentRows.map(r=>({ownerMemberId:r.owner_member_id,nomineeMemberId:r.nominee_member_id,preferenceRevisionId:r.preference_id,
  ownerAgreed:r.owner_agreed,nomineeAgreed:r.nominee_agreed,disclosureAgreed:r.disclosure_agreed,revoked:r.revoked}));
 let result=planGroup(catalog,preferences,consents);
 const scopes=rows.filter((r,i)=>studioQuestionAgreed(preferences[i],r.wording_bound,catalog)).map(r=>r.wording_bound.studioQuestion);
 let studioQuestionConflictMemberIds:string[]=[];
 if(result.state==='CANDIDATE_READY'&&scopes.length){
  const candidates=result.candidates.filter(c=>scopes.every(q=>c.offeringId===q.offeringId&&c.slotId===q.slotId));
  if(!candidates.length)studioQuestionConflictMemberIds=scopes.map(q=>q.confirmedByMemberId as string);
  result=candidates.length?{state:'CANDIDATE_READY',candidates}:{state:'INFEASIBLE',message:'No studio option meets this group’s requirements.'};
 }
 // IDs and consent states bind source revisions. Budget values/text are excluded
 // from both this digest and the immutable public offer snapshot.
 const sourceHash=fingerprint({catalog,roster:rows.map(r=>({id:r.id,userId:r.user_id,displayName:r.display_name,preferenceId:r.preference_id})),consents});
 return {catalog,rows,preferences,consents,result,sourceHash,personalArrangements:preferences.some((p,i)=>studioContactAgreed(p,rows[i].wording_bound,catalog)),studioQuestionIds:scopes.map(q=>q.questionId as string),studioQuestionConflictMemberIds};
}
