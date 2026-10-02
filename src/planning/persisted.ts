import type {PoolClient} from 'pg';
import {catalogSchema,preferenceSchema,planGroup,type Consent} from './domain.ts';
import {fingerprint} from '../payments/types.ts';
// Caller must hold the planning-group lock for writes/revalidation. None of these
// private rows may be serialized to a participant or merchant response.
export async function confirmedPlan(client:PoolClient,groupId:string,catalogValue:unknown){
 const catalog=catalogSchema.parse(catalogValue);
 const rows=(await client.query(`SELECT m.id,m.user_id,m.display_name,p.id AS preference_id,p.confirmed
  FROM planning_members m JOIN preference_revisions p ON p.id=m.current_preference_id
  WHERE m.group_id=$1 AND m.admitted ORDER BY m.id`,[groupId])).rows;
 const preferences=rows.map(r=>preferenceSchema.parse(r.confirmed));
 if(preferences.some((p,i)=>p.memberId!==rows[i].id||p.revisionId!==rows[i].preference_id))throw new Error('Invalid preference ownership');
 const consentRows=(await client.query(`SELECT cs.* FROM collection_consents cs
  JOIN planning_members m ON m.id=cs.owner_member_id AND m.current_preference_id=cs.preference_id
  WHERE m.group_id=$1 AND m.admitted ORDER BY cs.preference_id`,[groupId])).rows;
 const consents:Consent[]=consentRows.map(r=>({ownerMemberId:r.owner_member_id,nomineeMemberId:r.nominee_member_id,preferenceRevisionId:r.preference_id,
  ownerAgreed:r.owner_agreed,nomineeAgreed:r.nominee_agreed,disclosureAgreed:r.disclosure_agreed,revoked:r.revoked}));
 const result=planGroup(catalog,preferences,consents);
 // IDs and consent states bind source revisions. Budget values/text are excluded
 // from both this digest and the immutable public offer snapshot.
 const sourceHash=fingerprint({catalog,roster:rows.map(r=>({id:r.id,userId:r.user_id,displayName:r.display_name,preferenceId:r.preference_id})),consents});
 return {catalog,rows,preferences,consents,result,sourceHash};
}
