// The only collection fields allowed in a participant response. A nominee sees
// an arrangement only after its owner has explicitly agreed to its disclosure.
export type CollectionRequest={preferenceId:string;ownerName:string;nomineeName:string;ownerAgreed:boolean;nomineeAgreed:boolean;revoked:boolean;role:'OWNER'|'NOMINEE'};
