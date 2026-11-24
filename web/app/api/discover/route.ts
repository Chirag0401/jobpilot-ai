import { NextRequest, NextResponse } from "next/server";
import { PORTALS, searchIndexedJobs } from "@/lib/portal-search";

export const runtime="nodejs";
export const maxDuration=60;
const error=(message:string,status=400)=>NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 const origin=req.headers.get("origin");
 if(origin && new URL(origin).host!==req.nextUrl.host)return error("Invalid request origin",403);
 const length=Number(req.headers.get("content-length")||0);
 if(length>12000)return error("Search settings too large",413);
 try{
  const input=await req.json() as {apiKey?:unknown;portalIds?:unknown;role?:unknown;location?:unknown;careerSites?:unknown};
  const key=typeof input.apiKey==="string"?input.apiKey.trim():"";
  if(key.length<8||key.length>512)return error("Enter your Serper API key to search indexed portals");
  const ids=Array.isArray(input.portalIds)?input.portalIds.filter((x):x is string=>typeof x==="string"):[];
  const selected=[...new Set(ids)];
  if(selected.length>PORTALS.length || selected.some(x=>!PORTALS.some(p=>p.id===x)))return error("Unsupported portal selection");
  const sites=Array.isArray(input.careerSites)?input.careerSites:[];
  if(sites.length>5)return error("Limit company website searches to 5");
  if(!selected.length && !sites.length)return error("Choose a portal or enter a company career URL");
  const role=typeof input.role==="string"?input.role.slice(0,90):"DevOps SRE Platform Engineer";
  const location=typeof input.location==="string"?input.location.slice(0,60):"India";
  const result=await searchIndexedJobs(key,selected,role,location,sites);
  return NextResponse.json({...result,notice:"Indexed results only. Verify job date, location and eligibility on the original posting."},
   {headers:{"Cache-Control":"no-store"}});
 }catch{return error("Unable to perform the search. Please retry or check your Serper balance.");}
}
