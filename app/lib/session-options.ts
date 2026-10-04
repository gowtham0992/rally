import type {Candidate} from '../../src/planning/domain';

export function groupSessionOptions(candidates:readonly Candidate[]){
 const groups=new Map<string,{offeringId:string;activity:string;amountMinor:number;sessions:Candidate[]}>();
 for(const session of candidates){
  let group=groups.get(session.offeringId);
  if(!group){group={offeringId:session.offeringId,activity:session.activity,amountMinor:session.amountMinor,sessions:[]};groups.set(session.offeringId,group);}
  group.sessions.push(session);
 }
 return [...groups.values()];
}
