'use client';
import {useState} from 'react';
import type {GroupMember} from '../../src/intake/projections';
export default function PickupRequest({members,memberId,nomineeId,studioName,description,disabled,busy,onAsk}:{members:GroupMember[];memberId:string;nomineeId:string|null;studioName:string;description:string;disabled:boolean;busy:boolean;onAsk:(id:string)=>Promise<void>}){
 const [selected,setSelected]=useState(nomineeId??'');
 const available=members.filter(m=>m.id!==memberId&&!m.excluded),person=available.find(m=>m.id===selected);
 return <section className="pickup-request" aria-label="Ask a friend to pick up"><p className="eyebrow">Your next step</p><h3>Who could pick up your piece?</h3><p className="field-help">{studioName}: {description}</p>{available.length?<>
  <label htmlFor="pickup-friend">Choose a friend to ask</label><select id="pickup-friend" value={person?selected:''} disabled={disabled||busy} onChange={e=>setSelected(e.target.value)}><option value="">Choose a friend</option>{available.map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select>
  <p className="field-help">Pressing Ask shares this pickup request with that friend, and with the studio if you book. Your private note and spending limit stay private. They must agree separately.</p>
  <button type="button" className="secondary full" disabled={disabled||busy||!person} onClick={()=>{if(person)void onAsk(person.id);}}>{busy?'Sending request…':person?`Ask ${person.displayName} to pick up`:'Choose a friend to ask'}</button>
 </>:<p className="field-help">You can ask as soon as another friend joins. Your pickup need is saved.</p>}</section>;
}
