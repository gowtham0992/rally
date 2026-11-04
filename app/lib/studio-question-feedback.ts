export function questionDraftFeedback(result:{status:string;reviewReason?:'UNAVAILABLE'|'REVIEW'|null}){
 if(['RESERVED','DISPATCHED'].includes(result.status))return 'Your draft is still in progress. Check again shortly; retrying this same request does not start another model call.';
 if(result.status==='STALE')return 'The draft expired or your saved details changed. Review the latest details before drafting again. Nothing was sent to the studio.';
 if(result.reviewReason==='REVIEW')return 'This draft needs your review. AI did not produce a question to use. Write the question yourself below; nothing was sent to the studio.';
 return 'AI drafting is unavailable right now. Your note and question are still here. Write the question yourself, or explicitly try again later. Nothing was sent to the studio.';
}
