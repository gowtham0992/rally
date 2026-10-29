import type pg from 'pg';
import {validateInterpretation} from '../planning/interpretation.ts';
import {draftFields,matchesDraft,reviewDraftProposal} from '../planning/draft.ts';
import type {Preference} from '../planning/domain.ts';
export class DraftError extends Error{constructor(public code:string){super(code);}}
export async function confirmedDraft(c:pg.PoolClient,input:{id:string;memberId:string;sourcePreferenceId:string|null;text:string|null;catalog:unknown;preference:Preference;answerId:string|null}){
 const row=(await c.query('SELECT *,expires_at>clock_timestamp() AS fresh FROM intake_message_drafts WHERE id=$1 AND member_id=$2 FOR UPDATE',[input.id,input.memberId])).rows[0];
 if(!row)throw new DraftError('NOT_FOUND');
 if(!row.fresh||row.status!=='READY'||row.source_preference_id!==input.sourcePreferenceId||row.text_value!==input.text)throw new DraftError('STALE_DRAFT');
 const proposal=reviewDraftProposal(validateInterpretation(row.result,{revisionId:row.id,text:row.text_value,catalog:input.catalog}));
 if(!proposal)throw new DraftError('DRAFT_NEEDS_REVIEW');
 let fields;try{fields=draftFields(proposal,input.answerId);}catch{throw new DraftError('INVALID_ANSWER');}
 if(!matchesDraft(input.preference,fields))throw new DraftError('DRAFT_CHOICES_CHANGED');
 await c.query("UPDATE intake_message_drafts SET status='CONFIRMED' WHERE id=$1",[row.id]);return fields;
}
