import type {ReactNode} from 'react';
import type {PlanStage} from '../../src/planning/next-step';
const stops=['Everyone in','Pick a session','Studio holds it','Everyone approves','Booked'];
export function StageStrip({stage,ended=false}:{stage:PlanStage;ended?:boolean}){
 return <nav className="stage-strip" aria-label="Plan progress"><ol>{stops.map((label,i)=><li key={label} className={!ended&&i===stage?'current':i<stage?'complete':''} aria-current={!ended&&i===stage?'step':undefined}><span aria-hidden="true">{i<stage?'✓':i+1}</span><span>{label}</span></li>)}</ol>{ended&&<p className="field-help">This session is closed. Check its booking and payment records below.</p>}</nav>;
}
export default function PlanShell({studioName,title='Pottery with friends',when,stage,ended,children,backHref='/plans',backLabel='Your plans',showProgress=true}:{showProgress?:boolean;backHref?:string;backLabel?:string;studioName:string;title?:string;when?:string|null;stage:PlanStage;ended?:boolean;children:ReactNode}){
 return <main className="plan-shell"><header className="plan-line"><a className="back-link" href={backHref}>← {backLabel}</a><h1>{title}</h1><p>{studioName}{when?` · ${when}`:''}</p>{showProgress&&<StageStrip stage={stage} ended={ended}/>}</header>{children}</main>;
}
export function NextStepCard({title,children}:{title:string;children:ReactNode}){
 return <section className="next-step-card" aria-label="Your next step"><h2 tabIndex={-1}>{title}</h2>{children}</section>;
}
export function People({members,children,activeCount}:{activeCount?:number;members:{id:string;name:string;status?:string}[];children?:ReactNode}){
 return <section className="plan-people-row" aria-label="People"><div className="section-heading"><h2>People</h2><span>{activeCount??members.length} {activeCount!==undefined?'friends':members.length===1?'person':'people'}</span></div><ul>{members.map(m=><li key={m.id}><span className="avatar" aria-hidden="true">{m.name.slice(0,1).toUpperCase()}</span><span>{m.name}<small>{m.status}</small></span></li>)}</ul>{children}</section>;
}
