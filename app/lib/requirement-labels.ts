export const questions:Record<string,string>={
 TRAVEL_MEANING:'Does leaving affect attending the session or picking up your piece afterward?',
 TECHNIQUE_INTENT:'Which technique is a must-have for you?',
 OUTCOME_INTENT:'What does the session need to let you make?',
 COLLECTION_INTENT:'How will your piece be picked up after the session?'
};
export const values:Record<string,string>={WHEEL:'Using the wheel',HANDBUILD:'Hand-building',DECORATE:'Decorating',FORM_OWN_CUP:'Form my own cup',DECORATE_EXISTING:'Decorate a ready-made piece',SAME_DAY_REQUIRED:'I must take it home that day',SELF_LATER:'I can pick it up later',NOMINEE_LATER:'I need a friend to pick it up',CANNOT_ATTEND:'I can’t attend',COLLECTION_ONLY:'I can attend; I need someone to pick up my piece',OTHER:'Something else',MERCHANT_REVIEW_REQUIRED:'This essential need isn’t covered yet'};
export function label(value:string,key:string){return value==='ANY'?(key==='TECHNIQUE'?'Any technique works for me':'I’m open to either kind of piece'):values[value];}
