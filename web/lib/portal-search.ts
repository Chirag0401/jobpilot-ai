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
export type SearchStats={queries:number;successfulQueries:number;failedQueries:number;inspected:number;matched:number;duplicates:number;sources:SourceStat[]};
export class SerperSearchError extends Error {
 constructor(message:string,public readonly status:number){super(message);this.name="SerperSearchError";}
}
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
 const cleanedTitle=" "+words(title)+" ",cleanedBody=" "+words(description)+" ";
 let score=0;
 for(const phrase of phrases){
  if(cleanedTitle.includes(" "+phrase+" "))score=Math.max(score,94);
  else if(cleanedBody.includes(" "+phrase+" "))score=Math.max(score,65);
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
/**
 * Search reliability rules:
 * - Verify ONE Serper request before fan-out (never spend 28 requests on an HTTP 400).
 * - Use the previously working conservative num:10 request, omit page=1.
 * - If an optional time filter is rejected (400), retry ONCE without it and warn.
 * - If narrow site path is rejected (400), retry ONCE on the same public site's domain.
 * - Paginate only when the preceding page had 10 organic hits.
 * - Never report HTTP errors as a successful "zero jobs" search.
 */
export async function searchIndexedJobs(
 key:string,ids:string[],role:string,location:string,careerSites:string[],
 opts:{depth?:SearchDepth;freshness?:Freshness}={}
):Promise<SearchResult>{
 if(!rolePhrases(role).length)throw new Error("Enter a job role to search for");
 const selected=[...new Set(ids)].slice(0,PORTALS.length);
 const targets:SearchTarget[]=selected.flatMap(id=>{
  const p=PORTALS.find(x=>x.id===id);
  return p?[{id:p.id,name:p.name,domain:p.domain,site:p.site}]:[];
 });
 targets.push(...validateCareerDomains(careerSites).map(domain=>({
  id:"company",name:"Company careers · "+domain,domain,site:domain
 })));
 const bounded=targets.slice(0,16);
 if(!bounded.length)throw new Error("Select a portal or enter a company domain");
 const depth=opts.depth===2?2:1;
 const requestedTbs=opts.freshness==="week"?"qdr:w":opts.freshness==="month"?"qdr:m":undefined;
 let tbs:string|undefined=requestedTbs;
 let useDomainOnly=false;
 let stopEarly=false;
 const stats:SearchStats={queries:0,successfulQueries:0,failedQueries:0,inspected:0,matched:0,duplicates:0,sources:[]};
 const warnings:string[]=[];
 const found:Job[]=[];
 const counts=new Map<string,{inspected:number;matched:number}>();
 function count(target:SearchTarget){
  const name=target.name;
  let entry=counts.get(name);
  if(!entry){entry={inspected:0,matched:0};counts.set(name,entry);}
  return entry;
 }
 function errorMessage(status:number){
  if(status===401||status===403)return "Serper rejected the API key (HTTP "+status+"). Check the key in your Serper dashboard.";
  if(status===429)return "Serper rate limit or search credits have been reached (HTTP 429). Check your account quota.";
  if(status===400)return "Serper rejected the request (HTTP 400), even after using the basic search format. No job listings were retrieved. Check the API key, provider access and search settings.";
  return "Serper returned HTTP "+status+" instead of job search results.";
 }
 type ProviderReply={status:number;organic:Organic[]};
 async function request(target:SearchTarget,page:number):Promise<ProviderReply>{
  stats.queries++;
  const query=buildQuery(role,location,useDomainOnly?target.domain:target.site);
  const payload={
   q:query,num:10,gl:googleLocale(location),hl:"en",
   ...(page>1?{page}:{}),
   ...(tbs?{tbs}:{})
  };
  try{
   const response=await fetch("https://google.serper.dev/search",{
    method:"POST",cache:"no-store",redirect:"error",
    headers:{"Content-Type":"application/json","X-API-KEY":key},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
   });
   if(!response.ok){stats.failedQueries++;return {status:response.status,organic:[]};}
   const result=await response.json() as {organic?:Organic[]};
   stats.successfulQueries++;
   return {status:200,organic:Array.isArray(result.organic)?result.organic.slice(0,10):[]};
  }catch{
   stats.failedQueries++;
   return {status:503,organic:[]};
  }
 }
 function addResults(target:SearchTarget,hits:Organic[]){
  const item=count(target);
  stats.inspected+=hits.length;item.inspected+=hits.length;
  for(const hit of hits){
   const job=extractIndexedJob(hit,target,role,location);
   if(!job)continue;
   stats.matched++;item.matched++;found.push(job);
  }
 }
 // Probe first. Older JobPilot searches worked using num=10 with no explicit first-page index.
 // On 400, relax only optional parameters; never retry authentication or quota failures.
 const first=bounded[0];
 let probe=await request(first,1);
 if(probe.status===400 && tbs){
  tbs=undefined;
  warnings.push("Serper rejected the search-index recency filter; results are NOT restricted to the chosen timeframe.");
  probe=await request(first,1);
 }
 if(probe.status===400 && first.site!==first.domain){
  useDomainOnly=true;
  warnings.push("Serper rejected a narrow site query; broader portal-domain search was used instead.");
  probe=await request(first,1);
 }
 if(probe.status!==200)throw new SerperSearchError(errorMessage(probe.status),probe.status);
 addResults(first,probe.organic);
 // Deeper uses a second page of 10, only if there is evidence another page might exist.
 async function secondPage(target:SearchTarget,firstHits:Organic[]){
  if(depth!==2||firstHits.length<10||stopEarly)return;
  const next=await request(target,2);
  if(next.status===200)addResults(target,next.organic);
  else {
   warnings.push(next.status===400
    ?target.name+" has no accessible second page (HTTP 400); first-page results were retained."
    :target.name+": "+errorMessage(next.status));
   if(next.status===429||next.status===401||next.status===403)stopEarly=true;
  }
 }
 await secondPage(first,probe.organic);
 // Scan additional sources in small batches; preserve any good results on partial outages.
 for(let i=1;i<bounded.length && !stopEarly;i+=4){
  await Promise.all(bounded.slice(i,i+4).map(async target=>{
   const response=await request(target,1);
   if(response.status===200){
    addResults(target,response.organic);
    await secondPage(target,response.organic);
   }else {
    warnings.push(target.name+": "+errorMessage(response.status));
    if([401,403,429].includes(response.status))stopEarly=true;
   }
  }));
 }
 const unique=new Map<string,Job>();
 for(const job of found){
  const prev=unique.get(job.url);
  if(!prev||prev.score<job.score)unique.set(job.url,job);
 }
 stats.duplicates=found.length-unique.size;
 stats.sources=bounded.map(source=>({source:source.name,...(counts.get(source.name)||{inspected:0,matched:0})}));
 const jobs=[...unique.values()].sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,400);
 if(stats.successfulQueries===0)throw new SerperSearchError("No Serper requests succeeded; no job results were checked.",502);
 return {jobs,warnings:[...new Set(warnings)],stats};
}
