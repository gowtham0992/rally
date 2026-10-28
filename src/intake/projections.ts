// The only collection fields allowed in a participant response. A nominee sees
// an arrangement only after its owner has explicitly agreed to its disclosure.
export type CollectionRequest={preferenceId:string;ownerName:string;nomineeName:string;ownerAgreed:boolean;nomineeAgreed:boolean;revoked:boolean;role:'OWNER'|'NOMINEE'};
export type GroupMember={id:string;displayName:string;admitted:boolean;ready:boolean;excluded:boolean;stepStatus:'DETAILS_NEEDED'|'ACTION_NEEDED'|'READY'|'NOT_COMING'};
