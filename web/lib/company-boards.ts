import type { Job } from "@/lib/jobs";
import { ashby, greenhouse, lever } from "@/lib/jobs";

/** Only explicit, known hosted ATS domains are requested. No arbitrary URL fetching. */
type Board =
 | {kind:"ashby"|"greenhouse"|"lever"|"smartrecruiters"|"workable";slug:string}
 | {kind:"workday";tenant:string;site:string;locale:string;host:string};

export function parseBoard(raw:string):Board|null {
 try{
  if(raw.length>400)return null;
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.port)return null;
  const host=url.hostname.toLowerCase();
  const parts=url.pathname.split("/").filter(Boolean);
  const board=parts[0];
  const valid=(s:string|undefined)=>!!s && /^[a-zA-Z0-9_-]{2,90}$/.test(s);
  if(host==="jobs.ashbyhq.com" && valid(board))return {kind:"ashby",slug:board};
  if(["boards.greenhouse.io","job-boards.greenhouse.io"].includes(host)&&valid(board))return {kind:"greenhouse",slug:board};
  if(["jobs.lever.co","jobs.eu.lever.co"].includes(host)&&valid(board))return {kind:"lever",slug:board};
  if(["careers.smartrecruiters.com","jobs.smartrecruiters.com"].includes(host)&&valid(board))return {kind:"smartrecruiters",slug:board};
  if(["apply.workable.com","jobs.workable.com"].includes(host)&&valid(board))return {kind:"workable",slug:board};
  const match=host.match(/^([a-z0-9-]{2,70})\.(?:wd\d{1,2}\.)?myworkdayjobs\.com$/);
  if(match){
   const locale=/^[a-z]{2}-[A-Z]{2}$/.test(parts[0]||"")?parts[0]:"en-US";
   const site=(locale===parts[0]?parts[1]:parts[0])||"";
   if(valid(site))return {kind:"workday",tenant:match[1],site,locale,host};
  }
  return null;
 }catch{return null;}
}
type RecordData=Record<string,unknown>;
async function upstream(url:string,opts?:{method:string;body:string}):Promise<unknown>{
 const res=await fetch(url,{method:opts?.method||"GET",body:opts?.body,
  headers:{"Accept":"application/json","Content-Type":"application/json"},
  redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error("Career feed unavailable (HTTP "+res.status+")");
 return res.json();
}
function normalize(title:string,company:string,location:string,source:string,rawUrl:string,description="",date?:string|null):Job|null{
 if(!/devops|dev ops|platform|site reliability|\bsre\b|cloud engineer|infrastructure|openshift|kubernetes/i.test(title))return null;
 let link:string;
 try{const u=new URL(rawUrl);if(u.protocol!=="https:")return null;link=u.toString();}catch{return null;}
 const postedAt=date&&!Number.isNaN(Date.parse(date))?new Date(date).toISOString():null;
 return {id:source+":"+link,title:title.slice(0,250),company:company.slice(0,150),
  location:location.slice(0,200)||"Location unverified",source,url:link,
  postedAt,dateKind:postedAt?"published":"posting date unverified",
  description:description.replace(/<[^>]+>/g," ").slice(0,5000),score:52,tags:["Company careers"]};
}
async function fetchSmartRecruiters(slug:string):Promise<Job[]>{
 const data=await upstream("https://api.smartrecruiters.com/v1/companies/"+encodeURIComponent(slug)+"/postings?limit=100&offset=0") as {content?:RecordData[]};
 return (data.content||[]).flatMap(row=>{
  const id=String(row.id||"");
  const location=row.location as {city?:string;country?:string;remote?:boolean}|undefined;
  if(!id)return[];
  const company=String((row.company as {name?:string}|undefined)?.name||slug);
  const loc=[location?.city,location?.country].filter(Boolean).join(", ");
  const job=normalize(String(row.name||""),company,(location?.remote?"Remote · ":"")+loc,
   "SmartRecruiters","https://jobs.smartrecruiters.com/"+encodeURIComponent(slug)+"/"+encodeURIComponent(id),
   "",typeof row.releasedDate==="string"?row.releasedDate:null);
  return job?[job]:[];
 });
}
async function fetchWorkable(slug:string):Promise<Job[]>{
 const data=await upstream("https://www.workable.com/api/accounts/"+encodeURIComponent(slug)+"?details=true") as {name?:string;jobs?:RecordData[]};
 return (data.jobs||[]).flatMap(row=>{
  const loc=[row.city,row.country].filter(Boolean).join(", ");
  const job=normalize(String(row.title||""),String(data.name||slug),loc,"Workable",
   String(row.shortlink||row.url||""),String(row.description||""),
   typeof row.published_on==="string"?row.published_on:null);
  return job?[job]:[];
 });
}
async function fetchWorkday(board:Extract<Board,{kind:"workday"}>):Promise<Job[]>{
 // Career site /wday/cxs/ is the public site's internal endpoint, NOT a supported
 // third-party Workday API. It may change, reject requests or require consent.
 const endpoint="https://"+board.host+"/wday/cxs/"+encodeURIComponent(board.tenant)+"/"+encodeURIComponent(board.site)+"/jobs";
 const found:Job[]=[];
 for(const offset of [0,20]){
  const data=await upstream(endpoint,{method:"POST",body:JSON.stringify({
   appliedFacets:{},limit:20,offset,searchText:""
  })}) as {jobPostings?:RecordData[]};
  const entries=data.jobPostings||[];
  for(const entry of entries){
   const ext=String(entry.externalPath||"");
   if(!ext.startsWith("/job/") && !ext.startsWith("/"+board.site+"/job/"))continue;
   const path=ext.startsWith("/"+board.site+"/")?ext.slice(board.site.length+1):ext;
   const url="https://"+board.host+"/"+board.locale+"/"+board.site+path;
   const job=normalize(String(entry.title||""),board.tenant,String(entry.locationsText||""),
    "Workday",url,"Posted label: "+String(entry.postedOn||"")+"; verify on employer page.");
   if(job)found.push(job);
  }
  if(entries.length<20)break;
 }
 return found;
}
export async function fetchCompanyJobs(rawUrls:string[]):Promise<{jobs:Job[];warnings:string[]}>{
 const urls=[...new Set(rawUrls)].slice(0,6);
 const all:Job[]=[];const warnings:string[]=[];
 const settled=await Promise.allSettled(urls.map(async raw=>{
  const parsed=parseBoard(raw);
  if(!parsed)throw Error("Unsupported careers URL. Use a supported ATS URL or Serper for other company websites.");
  switch(parsed.kind){
   case "ashby":return ashby(parsed.slug);
   case "greenhouse":return greenhouse(parsed.slug);
   case "lever":return lever(parsed.slug);
   case "smartrecruiters":return fetchSmartRecruiters(parsed.slug);
   case "workable":return fetchWorkable(parsed.slug);
   case "workday":return fetchWorkday(parsed);
  }
 }));
 settled.forEach((item,i)=>{
  if(item.status==="fulfilled")all.push(...item.value);
  else warnings.push("Career source "+(i+1)+": "+String(item.reason instanceof Error?item.reason.message:"unavailable"));
 });
 const byUrl=new Map<string,Job>();
 all.forEach(job=>byUrl.set(job.url,job));
 return {jobs:[...byUrl.values()].slice(0,250),warnings};
}
