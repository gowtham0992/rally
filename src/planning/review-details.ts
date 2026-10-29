import type {Proposal} from './meaning.ts';
export type ReviewDetails={reviewReason:'UNSUPPORTED'|'CONFLICT'|'UNAVAILABLE';reviewEvidence:string[]};
export function reviewDetails(proposal:Proposal|null):ReviewDetails{
 const unsupported=proposal?.interpretations.filter(i=>i.requirementKey==='EXTRA'||i.proposedValue==='OTHER')??[];
 return {reviewReason:unsupported.length?'UNSUPPORTED':proposal?.interpretations.length?'CONFLICT':'UNAVAILABLE',
  reviewEvidence:[...new Set((unsupported.length?unsupported:proposal?.interpretations??[]).map(i=>i.sourceSpan))]};
}
export function storedReview(value:unknown):ReviewDetails{
 const v=value as Partial<ReviewDetails>|null;
 return {reviewReason:v&&['UNSUPPORTED','CONFLICT','UNAVAILABLE'].includes(v.reviewReason??'')?v.reviewReason!:'UNAVAILABLE',
  reviewEvidence:Array.isArray(v?.reviewEvidence)?v.reviewEvidence.filter(q=>typeof q==='string'&&q.length<=1500).slice(0,8):[]};
}
