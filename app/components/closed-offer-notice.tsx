export default function ClosedOfferNotice({booking,isYou,isOrganizer}:{booking:string;isYou:boolean;isOrganizer:boolean}){
 const reason=booking==='WITHDRAWN'?(isYou?'You withdrew, so this offer closed.':'A friend withdrew, so this offer closed.'):booking==='CANCELED'?'The studio canceled this session.':'This offer closed.';
 return <p role="status">{reason} You weren’t charged{!isOrganizer?'; your organizer will review who’s coming before a new offer.':'.'}</p>;
}
