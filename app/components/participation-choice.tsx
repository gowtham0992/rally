'use client';
import {useRef,useState} from 'react';
import {apiFetch} from '../lib/api-fetch';
export default function ParticipationChoice({groupId,revision,offerId,notComing=false,isOrganizer=false,disabled,onDone,onSessionExpired}:{groupId:string;revision:number;offerId:string;notComing?:boolean;isOrganizer?:boolean;disabled:boolean;onDone:()=>void;onSessionExpired:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),command=useRef<{coming:boolean;id:string}|null>(null);
 async function choose(coming:boolean){if(busy||disabled)return;setBusy(true);setError('');if(command.current?.coming!==coming)command.current={coming,id:crypto.randomUUID()};
  try{const r=await apiFetch(`/api/groups/${groupId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'PARTICIPATION',payload:{commandId:command.current.id,groupId,offerId,expectedRevision:revision,coming}})});if(r.status===401){onSessionExpired();return;}if(!r.ok)throw Error('The group changed. Refresh the plan before answering; your earlier payments stay unchanged.');onDone();}catch(e){setError(e instanceof Error?e.message:'We couldn’t save your answer. Try again.');}finally{setBusy(false);}}
 return <section aria-label="Confirm whether you’re coming"><p>{notComing?'You told the group you’re not coming. Only you can change that decision when planning is open. Your earlier payment records remain available.':'You withdrew from the earlier offer. Before the group plans again, confirm whether you’re still coming. Your saved details will stay private; any new offer needs fresh payment approval.'}</p>
  <button className="button full" disabled={disabled||busy} onClick={()=>choose(true)}>{busy?'Saving…':notComing?'I’m coming after all':'Still coming — keep my details'}</button>
  {!notComing&&!isOrganizer&&<button className="text-button keep-choices" disabled={disabled||busy} onClick={()=>choose(false)}>I’m out</button>}{isOrganizer&&<p className="field-help">The organizer needs to be part of this group. If you’re no longer joining, ask a friend to start a new plan as its organizer. This earlier offer stays closed.</p>}{error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
