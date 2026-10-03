export const money=(minor:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:minor%100?2:0,maximumFractionDigits:2}).format(minor/100);
export const localDate=(date:string,timezone:string)=>new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:timezone}).format(new Date(date));
export const localTime=(date:string,timezone:string)=>new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:timezone}).format(new Date(date));

// The Demo badge carries fixture disclosure; retain the policy's actual terms.
export const displayTerms=(terms:string)=>{const text=terms.replace(/^Synthetic demo policy: /,'');return text.charAt(0).toUpperCase()+text.slice(1);};
