import type {Preference} from '../../src/planning/domain';

export const activityChoices = [
 {id:'OPEN',label:'I’m open to all three',technique:'ANY',outcome:'ANY'},
 {id:'CUP',label:'I need to make my own cup',technique:'ANY',outcome:'FORM_OWN_CUP'},
 {id:'WHEEL',label:'I need to use the wheel',technique:'WHEEL',outcome:'FORM_OWN_CUP'},
 {id:'HANDBUILD',label:'I need to hand-build',technique:'HANDBUILD',outcome:'FORM_OWN_CUP'},
 {id:'DECORATE',label:'I need to decorate a ready-made piece',technique:'DECORATE',outcome:'DECORATE_EXISTING'},
] as const;

export function activityChoice(technique:Preference['technique'],outcome:Preference['outcome']){
 return activityChoices.find(choice=>choice.technique===technique&&choice.outcome===outcome)?.id??'SAVED';
}

export function activityRequirements(id:string){
 const choice=activityChoices.find(choice=>choice.id===id);
 return choice?{technique:choice.technique,outcome:choice.outcome}:null;
}

export function savedActivityLabel(technique:Preference['technique'],outcome:Preference['outcome']){
 const techniques={ANY:'Any technique',WHEEL:'Using the wheel',HANDBUILD:'Hand-building',DECORATE:'Decorating'};
 const outcomes={ANY:'Any kind of piece',FORM_OWN_CUP:'Make my own cup',DECORATE_EXISTING:'Decorate an existing piece'};
 return `${techniques[technique]} · ${outcomes[outcome]}`;
}
