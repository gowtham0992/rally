import Offer from './view';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{paypal?:string|string[]}>}){const {id}=await params,{paypal}=await searchParams;return <Offer id={id} returnState={paypal==='returned'||paypal==='canceled'?paypal:null}/>;}
