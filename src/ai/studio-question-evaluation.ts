import type {QuestionDiagnostic} from './studio-question.ts';
export type QuestionCase={expected:'DRAFT'|'REVIEW'|'REVIEW_OR_COMPLETE_CONDITION';requiredText?:string;forbiddenText?:string[]};
// An unavailable parser/provider is not a meaningful model abstention. In
// particular, a constant NEEDS_REVIEW implementation must not pass safety cases.
export function assessQuestionCase(test:QuestionCase,result:{httpStatus:number|null;question:string|null;diagnostic:QuestionDiagnostic|null}){
 if(result.httpStatus!==200)return false;
 if(!result.question)return test.expected!=='DRAFT'&&result.diagnostic?.stage==='MODEL_REVIEW';
 if(result.diagnostic||test.expected==='REVIEW')return false;
 if(test.expected==='REVIEW_OR_COMPLETE_CONDITION')return ['only if','upstairs','ground-floor'].every(s=>result.question!.includes(s));
 return Boolean(test.requiredText&&result.question.includes(test.requiredText)&&(test.forbiddenText??[]).every(s=>!result.question!.includes(s)));
}
