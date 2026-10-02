import Group from './view';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{mode?:string|string[]}>}){const {id}=await params;const {mode}=await searchParams;return <Group id={id} structuredOnly={mode==='structured'}/>;}
