export type LocalFields={date:string;time:string};
export type LocalTimeResult={status:'VALID';instant:string}|{status:'INVALID'|'NONEXISTENT'|'AMBIGUOUS'};

function formatter(timezone:string){return new Intl.DateTimeFormat('en-CA',{
 timeZone:timezone,calendar:'gregory',numberingSystem:'latn',hourCycle:'h23',
 year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'
});}
function parts(format:Intl.DateTimeFormat,instant:number){
 const fields=Object.fromEntries(format.formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const wall=new Date(0);wall.setUTCFullYear(Number(fields.year),Number(fields.month)-1,Number(fields.day));wall.setUTCHours(Number(fields.hour),Number(fields.minute),Number(fields.second),0);
 return {date:`${fields.year.padStart(4,'0')}-${fields.month}-${fields.day}`,time:`${fields.hour}:${fields.minute}`,
  wall:wall.getTime()};
}
export function localFields(instant:string,timezone:string):LocalFields{
 const value=parts(formatter(timezone),Date.parse(instant));return {date:value.date,time:value.time};
}
// Native date/time fields express wall time, not an offset. Enumerate the nearby
// timezone offsets and accept only one exact round-trip; never choose a side of
// a repeated time or normalize a skipped time into a different requirement.
export function resolveLocalTime(date:string,time:string,timezone:string):LocalTimeResult{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return {status:'INVALID'};
 const wall=Date.parse(`${date}T${time}:00.000Z`);
 if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==`${date}T${time}`)return {status:'INVALID'};
 let format:Intl.DateTimeFormat;try{format=formatter(timezone);}catch{return {status:'INVALID'};}
 const offsets=new Set<number>();
 for(let hours=-48;hours<=48;hours+=12){const anchor=wall+hours*3600000;offsets.add(parts(format,anchor).wall-anchor);}
 const matches=[...offsets].map(offset=>wall-offset).filter(instant=>{
  const local=parts(format,instant);return local.date===date&&local.time===time;
 });
 if(matches.length===0)return {status:'NONEXISTENT'};
 if(matches.length!==1)return {status:'AMBIGUOUS'};
 return {status:'VALID',instant:new Date(matches[0]).toISOString()};
}
