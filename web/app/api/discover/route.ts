import {NextRequest,NextResponse} from "next/server";
import {PORTALS,rolePhrases,searchIndexedJobs,SerperSearchError,type Freshness,type SearchDepth} from "@/lib/portal-search";

export const runtime="nodejs";
export const maxDuration=60;
const error=(message:string,status=400)=>NextResponse.json({error:message},
 {status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:NextRequest){
 const origin=request.headers.get("origin");
 if(origin && new URL(origin).host!==request.nextUrl.host)return error("Invalid request origin",403);
 if(Number(request.headers.get("content-length")||0)>12000)return error("Request too large",413);
 try{
  const input=await request.json() as {
   apiKey?:unknown;portalIds?:unknown;role?:unknown;location?:unknown;
   careerSites?:unknown;depth?:unknown;freshness?:unknown
  };
  const key=typeof input.apiKey==="string"?input.apiKey.trim():"";
  if(key.length<8||key.length>512)return error("Enter your Serper API key");
  const role=typeof input.role==="string"?input.role.slice(0,90):"";
  const location=typeof input.location==="string"?input.location.slice(0,60):"";
  if(!rolePhrases(role).length)return error("Enter a job title or role before searching");
  const selected=Array.isArray(input.portalIds)?input.portalIds.filter((x):x is string=>typeof x==="string"):[];
  const ids=[...new Set(selected)];
  if(ids.length>PORTALS.length||ids.some(id=>!PORTALS.some(p=>p.id===id)))return error("Unsupported portal selection");
  const websites=Array.isArray(input.careerSites)?input.careerSites:[];
  if(websites.length>5)return error("Use up to five company website URLs with Serper");
  if(!ids.length&&!websites.length)return error("Select at least one portal or company website");
  const depth:SearchDepth=input.depth===2?2:1;
  const freshness:Freshness=input.freshness==="week"?"week":input.freshness==="month"?"month":"any";
  const result=await searchIndexedJobs(key,ids,role,location,websites,{depth,freshness});
  return NextResponse.json({...result,notice:"Search-indexed results: verify dates, eligibility and availability on the original job posting."},
   {headers:{"Cache-Control":"no-store"}});
 }catch(caught){
  if(caught instanceof SerperSearchError)
   return error(caught.message,caught.status===429?429:502);
  return error("Search could not complete. Check Serper connectivity and your account credits.",502);
 }
}
