'use client';
import {resourcePollInterval} from './resource-poll';
import {apiFetch} from './api-fetch';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export function useResource<T>(path:string,next:string,pollMs=0,retainOnRefresh=false,quickUpdates?:(data:T|null)=>boolean){
 const loadedPath=useRef<string|null>(null);
 const router=useRouter(),[data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController(),fastUntil=Date.now()+90000;let latest:T|null=null;let timer:ReturnType<typeof setTimeout>|undefined;
  setLoading(true);setError('');if(!retainOnRefresh||loadedPath.current!==path)setData(null);
  async function load(initial:boolean){try{
   const response=await apiFetch(path,{signal:controller.signal,cache:'no-store'});
   if(response.status===401){router.replace(`/login?next=${encodeURIComponent(next)}`);return;}
   if(!response.ok)throw new Error(response.status===404?'This page isn’t available to your account.':'We couldn’t load this page. Try again shortly.');
   const result:T=await response.json();if(controller.signal.aborted)return;loadedPath.current=path;latest=result;setData(result);setError('');
  }catch(e){if(!controller.signal.aborted)setError(e instanceof TypeError?'Connection interrupted. Try again.':e instanceof Error?e.message:'Connection interrupted. Try again.');}
  finally{if(!controller.signal.aborted){if(initial)setLoading(false);const interval=resourcePollInterval(pollMs,Boolean(quickUpdates?.(latest)),fastUntil,Date.now());if(interval)timer=setTimeout(()=>void load(false),interval);}}}
  void load(true);return()=>{controller.abort();clearTimeout(timer);};
 },[path,next,pollMs,retry,router,retainOnRefresh,quickUpdates]);
 return {data,loading,error,refresh:()=>setRetry(n=>n+1)};
}
