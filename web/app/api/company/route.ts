import { NextRequest, NextResponse } from "next/server";
import { fetchCompanyJobs } from "@/lib/company-boards";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(req:NextRequest){
 const origin=req.headers.get("origin");
 if(origin && new URL(origin).host!==req.nextUrl.host)
  return NextResponse.json({error:"Invalid request origin"},{status:403});
 if(Number(req.headers.get("content-length")||0)>5000)
  return NextResponse.json({error:"Company URLs too long"},{status:413});
 try{
  const data=await req.json() as {urls?:unknown};
  if(!Array.isArray(data.urls)||!data.urls.length||data.urls.length>6 ||
     !data.urls.every(x=>typeof x==="string" && x.length<=400))
   return NextResponse.json({error:"Enter up to six supported HTTPS career URLs"},{status:400});
  const result=await fetchCompanyJobs(data.urls);
  return NextResponse.json({...result,notice:"Public career feeds only. Always verify listings with employers."},
   {headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Could not check career boards"},{status:400});}
}
