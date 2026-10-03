'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export function useResource<T>(path:string,next:string,pollMs=0,retainOnRefresh=false){
 const loadedPath=useRef<string|null>(null);
 const router=useRouter(),[data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  setLoading(true);setError('');if(!retainOnRefresh||loadedPath.current!==path)setData(null);
  async function load(initial:boolean){try{
   const response=await fetch(path,{signal:controller.signal,cache:'no-store'});
   if(response.status===401){router.replace(`/login?next=${encodeURIComponent(next)}`);return;}
   if(!response.ok)throw new Error(response.status===404?'This page isn’t available to your account.':'We couldn’t load this page. Try again shortly.');
   const result:T=await response.json();if(controller.signal.aborted)return;loadedPath.current=path;setData(result);setError('');
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Connection interrupted. Try again.');}
  finally{if(!controller.signal.aborted){if(initial)setLoading(false);if(pollMs)timer=setTimeout(()=>void load(false),pollMs);}}}
  void load(true);return()=>{controller.abort();clearTimeout(timer);};
 },[path,next,pollMs,retry,router,retainOnRefresh]);
 return {data,loading,error,refresh:()=>setRetry(n=>n+1)};
}
