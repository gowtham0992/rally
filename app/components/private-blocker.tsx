import {privateFeedback} from '../../src/planning/private-feedback';
import type {Catalog,Preference} from '../../src/planning/domain';
export default function PrivateBlocker({catalog,preference,groupSize}:{catalog:Catalog;preference:Preference|null;groupSize:number}){
 // Show conflicts in the form even when a separate note also needs review.
 // This preview never clears the saved note or changes eligibility.
 const reason=preference?privateFeedback(catalog,{...preference,extraRequirement:'NONE'},groupSize,false):null;
 return reason?<section className="notice" aria-label="Your private choices need attention" role="status"><p className="eyebrow">Only you see this</p><p>{reason}</p></section>:null;
}
