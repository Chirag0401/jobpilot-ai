import type { Job } from "@/lib/jobs";

/** Portal jobs are GOOGLE INDEX RESULTS, not an authorized portal jobs API.
 * Never fetch/scrape the target portal or assert publication date or location eligibility.
 */
export const PORTALS = [
 { id:"linkedin", name:"LinkedIn", domain:"linkedin.com" },
 { id:"indeed", name:"Indeed", domain:"indeed.com" },
 { id:"naukri", name:"Naukri", domain:"naukri.com" },
 { id:"wellfound", name:"Wellfound", domain:"wellfound.com" },
 { id:"cutshort", name:"Cutshort", domain:"cutshort.io" },
 { id:"instahyre", name:"Instahyre", domain:"instahyre.com" },
 { id:"foundit", name:"foundit", domain:"foundit.in" },
 { id:"monster", name:"Monster", domain:"monster.com" },
 { id:"workday", name:"Workday career pages", domain:"myworkdayjobs.com" },
 { id:"greenhouse", name:"Greenhouse career pages", domain:"greenhouse.io" },
 { id:"lever", name:"Lever career pages", domain:"lever.co" },
 { id:"ashby", name:"Ashby career pages", domain:"ashbyhq.com" },
 { id:"smartrecruiters", name:"SmartRecruiters career pages", domain:"smartrecruiters.com" },
 { id:"workable", name:"Workable career pages", domain:"workable.com" },
] as const;
export type PortalId = (typeof PORTALS)[number]["id"];

type Organic = { title?: string; link?: string; snippet?: string; date?: string };
const cleanText = (s:string) => s.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,1800);
function publicUrl(raw:string,domain:string):string|null {
 try {
  const u=new URL(raw);
  if(u.protocol!=="https:" || !u.hostname || u.username || u.password) return null;
  const host=u.hostname.toLowerCase();
  if(host!==domain && !host.endsWith("."+domain)) return null;
  u.hash="";
  for(const k of [...u.searchParams.keys()]) if(/^utm_|^trk$|^ref$|^source$/i.test(k))u.searchParams.delete(k);
  return u.toString();
 }catch{return null;}
}
export function validateCareerDomains(values:unknown):string[] {
 if(!Array.isArray(values))return [];
 const result:string[]=[];
 for(const raw of values.slice(0,5)) {
  if(typeof raw!=="string" || raw.length>300)continue;
  try {
   const url=new URL(raw);
   if(url.protocol!=="https:" || url.username || url.password || url.port || !url.hostname || url.hostname.length>200)continue;
   const hostname=url.hostname.toLowerCase();
   if(!/^[a-z0-9.-]+$/.test(hostname) || !hostname.includes(".") || hostname.endsWith(".local") || hostname.endsWith(".internal"))continue;
   if(/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname))continue;
   if(!result.includes(hostname))result.push(hostname);
  }catch{/* invalid company website */}
 }
 return result;
}
type SearchTarget = {name:string;domain:string};
export async function searchIndexedJobs(key:string,ids:string[],role:string,location:string,careerSites:string[]) {
 const selected = [...new Set(ids)].slice(0,PORTALS.length);
 const targets:SearchTarget[]=selected.flatMap(id=> {
  const p=PORTALS.find(s=>s.id===id);
  return p?[{name:p.name,domain:p.domain}]:[];
 });
 targets.push(...validateCareerDomains(careerSites).map(domain=>({name:"Company careers",domain})));
 const bounded=targets.slice(0,16);
 const results:Job[]=[];const warnings:string[]=[];
 const cleanRole=role.replace(/[^\p{L}\p{N} +.#-]/gu," ").trim().slice(0,90)||"DevOps SRE Platform Engineer";
 const cleanLocation=location.replace(/[^\p{L}\p{N} ,.-]/gu," ").trim().slice(0,60)||"India";
 // 1 query per selected source; users must click to incur Serper API usage.
 for(let offset=0;offset<bounded.length;offset+=4) {
  const part=bounded.slice(offset,offset+4);
  await Promise.all(part.map(async target=>{
   const q=cleanRole+" "+cleanLocation+" jobs site:"+target.domain;
   try {
    const response=await fetch("https://google.serper.dev/search",{
     method:"POST",cache:"no-store",redirect:"error",
     headers:{"Content-Type":"application/json","X-API-KEY":key},
     body:JSON.stringify({q,num:10,gl:"in",hl:"en"}),
     signal:AbortSignal.timeout(12000)
    });
    if(!response.ok){
     warnings.push(response.status===401||response.status===403
       ? "Serper rejected your API key."
       :response.status===429?"Serper request limit or credits reached."
       : "Search unavailable for "+target.name+" (HTTP "+response.status+").");
     return;
    }
    const data=await response.json() as {organic?:Organic[]};
    for(const hit of (data.organic||[]).slice(0,10)){
     const link=publicUrl(String(hit.link||""),target.domain);
     const title=cleanText(String(hit.title||""));
     if(!link || !title || !/devops|dev ops|platform|sre|site reliability|cloud|infrastructure|kubernetes|openshift/i.test(title+" "+String(hit.snippet||""))) continue;
     const description=cleanText(String(hit.snippet||""));
     results.push({
      id:"indexed:"+link,title,company:"See original listing",
      location:"India search · eligibility unverified",source:target.name+" · Search",
      url:link,postedAt:null,dateKind:"indexed; posting date unverified",
      description:description||"Indexed result. Open the original listing to verify details.",
      score:55,tags:["Indexed result"]
     });
    }
   }catch{warnings.push("Search request failed for "+target.name+".");}
  }));
 }
 const byUrl=new Map<string,Job>();
 for(const job of results)byUrl.set(job.url,job);
 return {jobs:[...byUrl.values()].slice(0,160),warnings,queries:bounded.length};
}
