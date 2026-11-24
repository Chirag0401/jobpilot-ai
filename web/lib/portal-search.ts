import type { Job } from "@/lib/jobs";

/**
 * Search indexes, not portal APIs: no LinkedIn/Indeed login, scraping or job-date claims.
 * Search tokens/keys are never persisted. Every search is explicitly user initiated.
 */
export const PORTALS = [
 {id:"linkedin",name:"LinkedIn",domain:"linkedin.com",site:"linkedin.com/jobs/view"},
 {id:"indeed",name:"Indeed",domain:"indeed.com",site:"indeed.com/viewjob"},
 {id:"naukri",name:"Naukri",domain:"naukri.com",site:"naukri.com/job-listings"},
 {id:"wellfound",name:"Wellfound",domain:"wellfound.com",site:"wellfound.com/jobs"},
 {id:"cutshort",name:"Cutshort",domain:"cutshort.io",site:"cutshort.io/job"},
 {id:"instahyre",name:"Instahyre",domain:"instahyre.com",site:"instahyre.com"},
 {id:"foundit",name:"foundit",domain:"foundit.in",site:"foundit.in"},
 {id:"monster",name:"Monster",domain:"monster.com",site:"monster.com"},
 {id:"workday",name:"Workday career pages",domain:"myworkdayjobs.com",site:"myworkdayjobs.com"},
 {id:"greenhouse",name:"Greenhouse careers",domain:"greenhouse.io",site:"greenhouse.io"},
 {id:"lever",name:"Lever careers",domain:"lever.co",site:"lever.co"},
 {id:"ashby",name:"Ashby careers",domain:"ashbyhq.com",site:"ashbyhq.com"},
 {id:"smartrecruiters",name:"SmartRecruiters",domain:"smartrecruiters.com",site:"smartrecruiters.com"},
 {id:"workable",name:"Workable",domain:"workable.com",site:"workable.com"}
] as const;
export type PortalId=(typeof PORTALS)[number]["id"];
export type Freshness="any"|"week"|"month";
export type SearchDepth=1|2;
type Organic={title?:string;link?:string;snippet?:string;date?:string};
type SearchTarget={name:string;domain:string;site:string;id:string};
type SourceStat={source:string;inspected:number;matched:number};
export type SearchStats={queries:number;inspected:number;matched:number;duplicates:number;sources:SourceStat[]};
export type SearchResult={jobs:Job[];warnings:string[];stats:SearchStats};

const words=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}+#. -]/gu," ").replace(/\s+/g," ").trim();
const clean=(s:string)=>s.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,1800);

export function rolePhrases(input:string):string[]{
 return [...new Set(input.split(/\s+OR\s+|[,;]+/i)
  .map(s=>words(s.replace(/^["']|["']$/g,"")).slice(0,60))
  .filter(s=>s.length>=2 && /[\p{L}\p{N}]/u.test(s)))].slice(0,6);
}
function containsWords(text:string,phrase:string):number{
 const terms=phrase.split(/\s+/).filter(Boolean);
 if(!terms.length)return 0;
 // Match whole tokens so 'Java' won't match 'JavaScript'.
 const normalized=" "+words(text)+" ";
 return terms.filter(term=>normalized.includes(" "+term+" ") || (
   term.length>4 && normalized.includes(" "+term.replace(/\./g,"")+" "))).length/terms.length;
}
export function roleRelevance(title:string,description:string,role:string):number{
 const phrases=rolePhrases(role);
 if(!phrases.length)return 0;
 const cleanedTitle=words(title),cleanedBody=words(description);
 let score=0;
 for(const phrase of phrases){
  if(cleanedTitle.includes(phrase))score=Math.max(score,94);
  else if(cleanedBody.includes(phrase))score=Math.max(score,65);
  else {
   const titleRatio=containsWords(title,phrase);
   const combinedRatio=containsWords(title+" "+description,phrase);
   if(titleRatio>=0.67)score=Math.max(score,Math.round(70*titleRatio));
   else if(combinedRatio>=0.8 && titleRatio>0)score=Math.max(score,58);
  }
 }
 return score;
}
export function locationRelevance(haystack:string,location:string):number{
 const wanted=words(location);
 if(!wanted || wanted==="anywhere" || wanted==="worldwide")return 0;
 const whole=words(haystack);
 if(whole.includes(wanted))return 6;
 if(wanted==="india" && /\bindia\b|\bindian\b|\bremote india\b/.test(whole))return 6;
 return 0;
}
export function scoreForQuery(title:string,description:string,role:string,location:string):number{
 const base=roleRelevance(title,description,role);
 return base?Math.min(99,base+locationRelevance(title+" "+description,location)):0;
}

function publicUrl(raw:string,domain:string):string|null{
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
  const host=u.hostname.toLowerCase();
  if(host!==domain && !host.endsWith("."+domain))return null;
  u.hash="";
  for(const k of [...u.searchParams.keys()])if(/^utm_|^trk$|^ref$|^source$/i.test(k))u.searchParams.delete(k);
  return u.toString();
 }catch{return null;}
}
function likelyJobPage(url:string,id:string):boolean{
 const path=new URL(url).pathname.toLowerCase();
 if(!path || path==="/")return false;
 const known:Record<string,RegExp>={
  linkedin:/\/jobs\/view\/\d+/,
  indeed:/\/viewjob\b|\/rc\/clk|\/pagead\/clk/,
  naukri:/\/job-listings-|\/job\//,
  wellfound:/\/jobs\/\d+|\/job\//,
  cutshort:/\/job\/|\/jobs\//,
  instahyre:/\/job|\/jobs\//,
  workday:/\/job\//,
  greenhouse:/\/jobs\/|\/job\//,
  lever:/\/[0-9a-f]{8}-[0-9a-f-]{27,}|\/jobs\//,
  ashby:/\/[0-9a-f]{8}-[0-9a-f-]{27,}|\/job\//,
  smartrecruiters:/\/\d+|\/jobs\//,
  workable:/\/j\//,
  foundit:/\/job|\/jobs\//,
  monster:/\/job|\/jobs\//
 };
 return known[id]?.test(path) ?? (/\/jobs?\/|\/career|\/position|\/opening/i.test(path));
}
export function validateCareerDomains(values:unknown):string[]{
 if(!Array.isArray(values))return[];
 const result:string[]=[];
 for(const raw of values.slice(0,5)){
  if(typeof raw!=="string"||raw.length>300)continue;
  try{
   const url=new URL(raw);
   if(url.protocol!=="https:"||url.username||url.password||url.port)continue;
   const hostname=url.hostname.toLowerCase();
   if(!/^[a-z0-9.-]{3,200}$/.test(hostname)||!hostname.includes(".")||
    hostname.endsWith(".local")||hostname.endsWith(".internal")||hostname.endsWith(".localhost")||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname))continue;
   if(!result.includes(hostname))result.push(hostname);
  }catch{/* invalid input */}
 }
 return result;
}
function quoteRole(phrase:string):string{
 const sanitized=phrase.replace(/"/g,"");
 return phrase.includes(" ")?"\""+sanitized+"\"":sanitized;
}
export function buildQuery(role:string,location:string,site:string):string{
 const phrases=rolePhrases(role);
 const roleQuery=phrases.length>1?"("+phrases.map(quoteRole).join(" OR ")+")":quoteRole(phrases[0]||role);
 const loc=words(location).slice(0,60);
 return [roleQuery,loc||"", "jobs", "site:"+site].filter(Boolean).join(" ");
}
function googleLocale(location:string):string{
 const loc=words(location);
 if(/\b(united states|usa|us|america)\b/.test(loc))return"us";
 if(/\b(united kingdom|uk|london)\b/.test(loc))return"gb";
 if(/\b(canada)\b/.test(loc))return"ca";
 if(/\b(australia)\b/.test(loc))return"au";
 return"in"; // Search market preference; not proof of job eligibility.
}
export function extractIndexedJob(hit:Organic,target:SearchTarget,role:string,location:string):Job|null{
 const link=publicUrl(String(hit.link||""),target.domain);
 const rawTitle=clean(String(hit.title||""));
 const snippet=clean(String(hit.snippet||""));
 if(!link||!rawTitle)return null;
 if(target.id!=="company" && !likelyJobPage(link,target.id))return null;
 const score=scoreForQuery(rawTitle,snippet,role,location);
 if(!score)return null;
 return {id:"indexed:"+link,title:rawTitle,company:"Employer unverified",
  location:"Location not verified",source:target.name+" · Google index",url:link,
  postedAt:null,dateKind:"indexed; posting date not verified",
  description:snippet||"Indexed search result. Verify the position on the original site.",
  score,tags:["Indexed result"]};
}
export async function searchIndexedJobs(
 key:string, ids:string[],role:string,location:string,careerSites:string[],
 opts:{depth?:SearchDepth;freshness?:Freshness}={}
):Promise<SearchResult>{
 const phrases=rolePhrases(role);
 if(!phrases.length)throw Error("Enter a job role to search for");
 const selected=[...new Set(ids)].slice(0,PORTALS.length);
 const targets:SearchTarget[]=selected.flatMap(id=>{
  const p=PORTALS.find(x=>x.id===id);
  return p?[{id:p.id,name:p.name,domain:p.domain,site:p.site}]:[];
 });
 targets.push(...validateCareerDomains(careerSites).map(domain=>({id:"company",name:"Company careers",domain,site:domain})));
 const bounded=targets.slice(0,16);
 const depth=opts.depth===2?2:1;
 const freshness=opts.freshness==="week"?"qdr:w":opts.freshness==="month"?"qdr:m":undefined;
 const stats:SearchStats={queries:0,inspected:0,matched:0,duplicates:0,sources:[]};
 const warnings:string[]=[];
 const results:Job[]=[];
 const tasks=bounded.flatMap(target=>Array.from({length:depth},(_,i)=>({target,page:i+1})));
 const counts=new Map<string,{inspected:number;matched:number}>();
 // Eight concurrent requests max: depth 2 across 14 sources remains within function timeout in normal operation.
 for(let offset=0;offset<tasks.length;offset+=8){
  const batch=tasks.slice(offset,offset+8);
  await Promise.all(batch.map(async({target,page})=>{
   const keyName=target.name;
   const sourceCount=counts.get(keyName)||{inspected:0,matched:0};
   counts.set(keyName,sourceCount);
   stats.queries+=1;
   try{
    const response=await fetch("https://google.serper.dev/search",{
     method:"POST",cache:"no-store",redirect:"error",
     headers:{"Content-Type":"application/json","X-API-KEY":key},
     body:JSON.stringify({q:buildQuery(role,location,target.site),num:20,page,gl:googleLocale(location),hl:"en",...(freshness?{tbs:freshness}:{})}),
     signal:AbortSignal.timeout(12000)
    });
    if(!response.ok){
     warnings.push(response.status===401||response.status===403
      ?"Serper rejected the provided API key."
      :response.status===429?"Serper quota or rate limit reached."
      :target.name+" search unavailable (HTTP "+response.status+").");
     return;
    }
    const data=await response.json() as {organic?:Organic[]};
    const organic=Array.isArray(data.organic)?data.organic.slice(0,30):[];
    stats.inspected+=organic.length;
    sourceCount.inspected+=organic.length;
    for(const hit of organic){
     const result=extractIndexedJob(hit,target,role,location);
     if(result){results.push(result);stats.matched++;sourceCount.matched++;}
    }
   }catch{warnings.push(target.name+" search request failed.");}
  }));
 }
 const byUrl=new Map<string,Job>();
 for(const item of results){
  const old=byUrl.get(item.url);
  if(!old||item.score>old.score)byUrl.set(item.url,item);
 }
 stats.duplicates=results.length-byUrl.size;
 stats.sources=bounded.map(t=>({source:t.name,...(counts.get(t.name)||{inspected:0,matched:0})}));
 const jobs=[...byUrl.values()].sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,400);
 return {jobs,warnings:[...new Set(warnings)],stats};
}
