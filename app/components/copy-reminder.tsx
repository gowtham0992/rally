'use client';
import {useState} from 'react';
export default function CopyReminder({text,path,disabled=false}:{text:string;path:string;disabled?:boolean}){
 const [copy,setCopy]=useState(''),[notice,setNotice]=useState('');
 return <div className="copy-reminder"><button type="button" className="secondary" disabled={disabled} onClick={async()=>{
  const value=`${text}\n${location.origin}${path}`;setCopy(value);
  try{await navigator.clipboard.writeText(value);setNotice('Reminder copied. Share it in your group chat.');}catch{setNotice('Select and copy this reminder for your group chat.');}
 }}>Copy a reminder ↗</button>{notice&&<><p className="field-help" role="status">{notice}</p><label className="sr-only" htmlFor={`reminder-${path.replaceAll('/','-')}`}>Reminder text</label><textarea id={`reminder-${path.replaceAll('/','-')}`} readOnly rows={4} value={copy} onFocus={e=>e.target.select()}/></>}</div>;
}
