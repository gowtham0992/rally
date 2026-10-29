'use client';
import {useEffect,useState} from 'react';
import {invitationToken} from './invitation';
type Preview={organizerName:string;studioName:string};
export function useInvitation(next:string){
 const token=invitationToken(next),[result,setResult]=useState<{token:string;data:Preview|null;failed:boolean}|null>(null);
 useEffect(()=>{if(!token)return;const controller=new AbortController();
  void fetch('/api/groups/invitation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:token}),signal:controller.signal,cache:'no-store'}).then(async r=>{
   if(!r.ok)throw Error('INVITATION_UNAVAILABLE');const data:Preview=await r.json();if(!controller.signal.aborted)setResult({token,data,failed:false});
  }).catch(()=>{if(!controller.signal.aborted)setResult({token,data:null,failed:true});});
  return()=>controller.abort();
 },[token]);
 return {data:result?.token===token?result.data:null,loading:Boolean(token&&result?.token!==token),unavailable:next.startsWith('/join?')&&(!token||result?.token===token&&result.failed)};
}
