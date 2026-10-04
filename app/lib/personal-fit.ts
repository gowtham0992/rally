import {matchingSessions,type Catalog,type Preference} from '../../src/planning/domain';
import {privateFeedback} from './private-feedback';

// Owner-only calculation: no group preferences, identities or agreement state.
// Matching public facts never establishes consent, a reservation or a booking.
export function personalFit(catalog:Catalog,preference:Preference,groupSize:number,collectionAgreed=false){
 const sessions=matchingSessions(catalog,[preference],groupSize);
 const pendingNote=preference.extraRequirement==='MERCHANT_REVIEW_REQUIRED';
 const pendingCollection=preference.collection==='UNRESOLVED'||preference.collection==='NOMINEE_LATER'&&!collectionAgreed;
 const pendingMeaning=preference.unresolvedKeys.some(key=>key!=='COLLECTION')||preference.unresolvedKeys.includes('COLLECTION')&&!pendingCollection;
 return {sessions,pendingNote,pendingCollection,pendingMeaning,message:sessions.length?null:privateFeedback(catalog,preference,groupSize)};
}
