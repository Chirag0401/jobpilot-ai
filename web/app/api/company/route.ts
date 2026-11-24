import {NextRequest,NextResponse} from "next/server";
import {fetchCompanyJobs} from "@/lib/company-boards";
import {rolePhrases} from "@/lib/portal-search";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:NextRequest){
 const origin=request.headers.get("origin");
 if(origin && new URL(origin).host!==request.nextUrl.host)
  return NextResponse.json({error:"Invalid request origin"},{status:403});
 if(Number(request.headers.get("content-length")||0)>5000)
  return NextResponse.json({error:"Request too large"},{status:413});
 try{
  const input=await request.json() as {urls?:unknown;role?:unknown;location?:unknown};
  if(!Array.isArray(input.urls)||input.urls.length<1||input.urls.length>6 ||
   !input.urls.every(x=>typeof x==="string"&&x.length<=400))
    return NextResponse.json({error:"Provide one to six public company ATS URLs"},{status:400});
  const role=typeof input.role==="string"?input.role.slice(0,90):"";
  const location=typeof input.location==="string"?input.location.slice(0,60):"";
  if(!rolePhrases(role).length)return NextResponse.json({error:"Enter the job role you want to find"},{status:400});
  const results=await fetchCompanyJobs(input.urls,role,location);
  return NextResponse.json({...results,notice:"Official company-feed listings. Verify posted dates and any remote eligibility."},
   {headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to check company boards"},{status:400});}
}
