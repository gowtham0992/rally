import Plans from './view';
export default async function Page({searchParams}:{searchParams:Promise<{cursor?:string|string[]}>}){
 const params=await searchParams;return <Plans cursor={typeof params.cursor==='string'?params.cursor:null}/>;
}
