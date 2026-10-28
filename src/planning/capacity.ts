import type {Catalog} from './domain.ts';
export function publishedGroupSizes(catalog:Catalog){
 return Array.from({length:8},(_,i)=>i+1).filter(size=>catalog.offerings.some(o=>o.verified&&o.minPeople<=size&&o.maxPeople>=size));
}
