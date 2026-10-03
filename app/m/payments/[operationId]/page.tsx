import PaymentRecord from './view';
export default async function Page({params,searchParams}:{params:Promise<{operationId:string}>;searchParams:Promise<{cursor?:string|string[]}>}){
 const [{operationId},query]=await Promise.all([params,searchParams]);
 return <PaymentRecord key={operationId} operationId={operationId} cursor={typeof query.cursor==='string'?query.cursor:null}/>;
}
