import Exceptions from './view';
export default async function Page({searchParams}:{searchParams:Promise<{cursor?:string|string[]}>}){
 const params=await searchParams;
 return <Exceptions cursor={typeof params.cursor==='string'?params.cursor:null}/>;
}
