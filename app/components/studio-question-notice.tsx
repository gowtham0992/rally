import type {StudioQuestionExpiry} from '../../src/intake/studio-question-state';
export default function StudioQuestionNotice({expiry,conflict,sessionLabel}:{expiry?:StudioQuestionExpiry|null;conflict?:boolean;sessionLabel?:string|null}){
 if(expiry)return <p className="notice" role="status">{expiry==='ANSWER_EXPIRED'?'Your studio answer has expired.':'Your studio question has expired.'} Your essential needs have not been waived. Review and save your details, then ask the studio again before continuing.</p>;
 if(conflict)return <p className="notice" role="status">Your studio answer applies only to one session{sessionLabel?<>: <strong>{sessionLabel}</strong></>:null}. It is not a shared fit for the group’s current saved choices. Your needs have not been changed. Review your details before asking about another session.</p>;
 return null;
}
