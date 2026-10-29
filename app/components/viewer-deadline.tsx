'use client';
import {useEffect,useState} from 'react';
export function viewerDeadline(value:string,timezone:string){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:timezone,timeZoneName:'short'}).format(new Date(value));}
export default function ViewerDeadline({value}:{value:string}){const [zone,setZone]=useState<string|null>(null);useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);},[]);return <time dateTime={value}>{viewerDeadline(value,zone??'UTC')}{zone?' · your time':' · UTC'}</time>;}
