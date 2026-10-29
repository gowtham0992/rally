// Planning state cannot establish whether an issued offer booked.
export function groupStatus(state:string,offerId:string|null,booking:string|null){
 if(offerId){
  if(booking==='CONFIRMED')return {label:'Booked',title:'Your booking is confirmed.',heading:'See you at the studio.',message:'Every required payment completed. The group’s session is booked.'};
  if(booking==='OPEN')return {label:'Booking window',title:'The studio sent an offer.',heading:'Your details are locked in.',message:'Review the studio’s offer and exact terms before approving your share.'};
  if(booking==='SETTLING')return {label:'Checking payments',title:'Payments are being checked.',heading:'Your booking is not confirmed yet.',message:'Open the offer to check your payment. The group books only when every required payment completes.'};
  if(booking==='CANCELED')return {label:'Canceled',title:'The studio canceled this booking.',heading:'This session is canceled.',message:'Open the closed offer to check payment records and whether a new plan can start. Every new offer needs fresh approval.'};
  if(booking==='EXPIRED')return {label:'Booking window ended',title:'The booking window ended.',heading:'This session did not book.',message:'Open the closed offer to check payment records and whether a new plan can start. Every new offer needs fresh approval.'};
  if(booking==='WITHDRAWN')return {label:'Plan withdrawn',title:'This plan was withdrawn.',heading:'This session did not book.',message:'Open the closed offer to check payment records and whether a new plan can start. Every new offer needs fresh approval.'};
  if(booking==='SUPERSEDED'||booking==='ABORTED')return {label:'Booking closed',title:'This booking is closed.',heading:'This session did not book.',message:'Open the closed offer to check payment records and whether a new plan can start. Every new offer needs fresh approval.'};
  return {label:'Check booking status',title:'Check the studio’s offer.',heading:'Open the offer for its current status.',message:'A booking is confirmed only when every required payment completes.'};
 }
 if(state==='ABANDONED')return {label:'Planning ended',title:'This plan ended.',heading:'Your details are saved.',message:'This round has no studio offer. You can start a new group from Your plans.'};
 return {label:state==='COLLECTING'?'Everyone in':state==='CLOSED'?'Pick a session':'Studio is checking',title:null,heading:null,message:null};
}
