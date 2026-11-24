import type {Job} from "@/lib/jobs";
import {scoreForQuery,rolePhrases} from "@/lib/portal-search";

/** Whitelist of public ATS hosts only: never fetch the user-provided URL directly. */
type Board={kind:"ashby"|"greenhouse"|"lever"|"smartrecruiters"|"workable";slug:string}|
 {kind:"workday";tenant:string;site:string;locale:string;host:string};

export function parseBoard(raw:string):Board|null{
 try{
  if(raw.length>400)return null;
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.port)return null;
  const host=url.hostname.toLowerCase();
  const parts=url.pathname.split("/").filter(Boolean);
  const slug=parts[0];
  const valid=(x:string|undefined)=>!!x && /^[a-zA-Z0-9_-]{2,90}$/.test(x);
  if(host==="jobs.ashbyhq.com"&&valid(slug))return{kind:"ashby",slug};
  if(["boards.greenhouse.io","job-boards.greenhouse.io"].includes(host)&&valid(slug))return{kind:"greenhouse",slug};
  if(["jobs.lever.co","jobs.eu.lever.co"].includes(host)&&valid(slug))return{kind:"lever",slug};
  if(["careers.smartrecruiters.com","jobs.smartrecruiters.com"].includes(host)&&valid(slug))return{kind:"smartrecruiters",slug};
  if(["apply.workable.com","jobs.workable.com"].includes(host)&&valid(slug))return{kind:"workable",slug};
  const match=host.match(/^([a-z0-9-]{2,70})\.(?:wd\d{1,2}\.)?myworkdayjobs\.com$/);
  if(match){
   const locale=/^[a-z]{2}-[A-Z]{2}$/.test(parts[0]||"")?parts[0]:"en-US";
   const site=(locale===parts[0]?parts[1]:parts[0])||"";
   if(valid(site))return{kind:"workday",tenant:match[1],site,locale,host};
  }
  return null;
 }catch{return null;}
}
type Row=Record<string,unknown>;
async function publicJson(url:string,options?:{method:"POST";body:string}):Promise<unknown>{
 const res=await fetch(url,{method:options?.method||"GET",body:options?.body,
  headers:{"Accept":"application/json","Content-Type":"application/json"},redirect:"manual",
  cache:"no-store",signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error("Feed returned HTTP "+res.status);
 return res.json();
}
function normalize(title:string,company:string,location:string,source:string,url:string,
 description="",rawDate?:unknown,dateKind="published"):Job|null{
 if(!title.trim())return null;
 let cleanUrl:string;
 try{
  const candidate=new URL(url);
  if(candidate.protocol!=="https:"||candidate.username||candidate.password)return null;
  candidate.hash="";
  cleanUrl=candidate.toString();
 }catch{return null;}
 const raw=typeof rawDate==="string"?Date.parse(rawDate):typeof rawDate==="number"?rawDate:NaN;
 const postedAt=Number.isFinite(raw)?new Date(raw).toISOString():null;
 return {id:"company:"+cleanUrl,title:title.trim().slice(0,250),
  company:company.trim().slice(0,150)||"Employer not specified",location:location.trim().slice(0,200)||"Location not verified",
  source,url:cleanUrl,postedAt,dateKind:postedAt?dateKind:"posting date not verified",
  description:description.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,5000),score:0,tags:["Official career feed"]};
}
async function fetchAshby(slug:string):Promise<Job[]>{
 const data=await publicJson("https://api.ashbyhq.com/posting-api/job-board/"+encodeURIComponent(slug)) as {jobs?:Row[]};
 return (data.jobs||[]).filter(row=>row.isListed!==false).flatMap(row=>{
  const job=normalize(String(row.title||""),slug,String(row.location||""),"Ashby",
   String(row.jobUrl||""),String(row.descriptionPlain||row.descriptionHtml||""),
   row.publishedAt||row.updatedAt,"last published");
  return job?[job]:[];
 });
}
async function fetchGreenhouse(slug:string):Promise<Job[]>{
 const data=await publicJson("https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(slug)+"/jobs?content=true") as {jobs?:Row[]};
 return (data.jobs||[]).flatMap(row=>{
  const loc=(row.location as {name?:string}|undefined)?.name||"";
  const job=normalize(String(row.title||""),slug,loc,"Greenhouse",String(row.absolute_url||""),
   String(row.content||""),row.first_published||row.updated_at,row.first_published?"first published":"updated");
  return job?[job]:[];
 });
}
async function fetchLever(slug:string):Promise<Job[]>{
 const data=await publicJson("https://api.lever.co/v0/postings/"+encodeURIComponent(slug)+"?mode=json");
 return (Array.isArray(data)?data:[]).flatMap(raw=>{
  const row=raw as Row;
  const cats=row.categories as {location?:string}|undefined;
  const job=normalize(String(row.text||""),slug,String(cats?.location||""),"Lever",
   String(row.hostedUrl||""),String(row.descriptionPlain||row.description||""),row.createdAt,"created");
  return job?[job]:[];
 });
}
async function fetchSmartRecruiters(slug:string):Promise<Job[]>{
 const all:Job[]=[];
 for(const offset of [0,100]){
  const data=await publicJson("https://api.smartrecruiters.com/v1/companies/"+encodeURIComponent(slug)+
   "/postings?limit=100&offset="+offset) as {content?:Row[]};
  const posts=data.content||[];
  for(const row of posts){
   const id=String(row.id||"");
   const location=row.location as {city?:string;country?:string;remote?:boolean}|undefined;
   if(!id)continue;
   const loc=[location?.city,location?.country].filter(Boolean).join(", ");
   const employer=String((row.company as {name?:string}|undefined)?.name||slug);
   const job=normalize(String(row.name||""),employer,(location?.remote?"Remote · ":"")+loc,
    "SmartRecruiters","https://jobs.smartrecruiters.com/"+encodeURIComponent(slug)+"/"+encodeURIComponent(id),
    "",row.releasedDate);
   if(job)all.push(job);
  }
  if(posts.length<100)break;
 }
 return all;
}
async function fetchWorkable(slug:string):Promise<Job[]>{
 const data=await publicJson("https://www.workable.com/api/accounts/"+encodeURIComponent(slug)+"?details=true") as {name?:string;jobs?:Row[]};
 return (data.jobs||[]).flatMap(row=>{
  const loc=[row.city,row.country].filter(Boolean).join(", ");
  const job=normalize(String(row.title||""),String(data.name||slug),loc,"Workable",
   String(row.shortlink||row.url||""),String(row.description||""),row.published_on||row.created_at,
   row.published_on?"published":"created");
  return job?[job]:[];
 });
}
async function fetchWorkday(board:Extract<Board,{kind:"workday"}>):Promise<Job[]>{
 // Public career site's internal JSON endpoint (NOT a stable third-party Workday API).
 // This may block automated requests, change without notice, or expose fewer postings.
 const endpoint="https://"+board.host+"/wday/cxs/"+encodeURIComponent(board.tenant)+"/"+
  encodeURIComponent(board.site)+"/jobs";
 const found:Job[]=[];
 for(const offset of [0,20,40]){
  const data=await publicJson(endpoint,{method:"POST",body:JSON.stringify({
   appliedFacets:{},limit:20,offset,searchText:""
  })}) as {jobPostings?:Row[]};
  const postings=data.jobPostings||[];
  for(const row of postings){
   const ext=String(row.externalPath||"");
   if(!ext.startsWith("/job/")&&!ext.startsWith("/"+board.site+"/job/"))continue;
   const subpath=ext.startsWith("/"+board.site+"/")?ext.slice(board.site.length+1):ext;
   const url="https://"+board.host+"/"+board.locale+"/"+board.site+subpath;
   const job=normalize(String(row.title||""),board.tenant,String(row.locationsText||""),
    "Workday",url,"Posted label: "+String(row.postedOn||"")+" (verify on employer site)");
   if(job)found.push(job);
  }
  if(postings.length<20)break;
 }
 return found;
}
function likelyLocationMatch(job:Job,location:string):boolean{
 const region=location.toLowerCase().trim();
 if(!region||region==="anywhere"||region==="worldwide")return true;
 const loc=job.location.toLowerCase();
 if(loc.includes(region))return true;
 // Explicit country restrictions take precedence over a generic "remote" label.
 if(region==="india" && /united states|\busa\b|canada|united kingdom|\buk\b|europe only|australia only/i.test(loc)
    && !/\bindia\b/i.test(loc))return false;
 if(/remote|not verified|worldwide|global/i.test(loc))return true; // eligibility still unverified.
 if(region==="india"){
  return /india|mumbai|pune|bengaluru|bangalore|hyderabad|chennai|noida|gurgaon|gurugram|delhi|kolkata|ahmedabad|thane/i.test(loc);
 }
 return false;
}
export async function fetchCompanyJobs(urls:string[],role:string,location:string):Promise<{
 jobs:Job[];warnings:string[];stats:{inspected:number;matched:number}
}>{
 if(!rolePhrases(role).length)throw Error("Enter a role to search for");
 const selected=[...new Set(urls)].slice(0,6);
 const warnings:string[]=[];const collected:Job[]=[];
 const all=await Promise.allSettled(selected.map(async url=>{
  const board=parseBoard(url);
  if(!board)throw Error("Unsupported URL; use a supported public ATS board, or Serper for other sites.");
  switch(board.kind){
   case "ashby":return fetchAshby(board.slug);
   case "greenhouse":return fetchGreenhouse(board.slug);
   case "lever":return fetchLever(board.slug);
   case "smartrecruiters":return fetchSmartRecruiters(board.slug);
   case "workable":return fetchWorkable(board.slug);
   case "workday":return fetchWorkday(board);
  }
 }));
 all.forEach((result,i)=>{
  if(result.status==="fulfilled")collected.push(...result.value);
  else warnings.push("Career source "+(i+1)+": "+(result.reason instanceof Error?result.reason.message:"unavailable"));
 });
 const jobs:Job[]=[];
 for(const job of collected){
  const score=scoreForQuery(job.title,job.description,role,location);
  if(!score||!likelyLocationMatch(job,location))continue;
  jobs.push({...job,score});
 }
 const unique=new Map<string,Job>();
 for(const job of jobs){
  const previous=unique.get(job.url);
  if(!previous||(!previous.postedAt&&job.postedAt))unique.set(job.url,job);
 }
 return {jobs:[...unique.values()].sort((a,b)=>b.score-a.score||(
   (b.postedAt||"").localeCompare(a.postedAt||""))).slice(0,300),
  warnings,stats:{inspected:collected.length,matched:unique.size}};
}
