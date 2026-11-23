export type Job = {
 id: string; title: string; company: string; location: string; source: string;
 url: string; postedAt: string | null; dateKind: string; description: string;
 score: number; tags: string[];
};
type Feed = { name: string; load: () => Promise<Job[]> };
const roles = ["devops", "dev ops", "site reliability", "sre", "platform engineer", "cloud engineer",
 "infrastructure engineer", "openshift", "kubernetes engineer", "cloud native engineer"];
const skills = ["aws", "kubernetes", "terraform", "openshift", "argocd", "helm", "linux", "grafana",
 "prometheus", "gitlab", "github actions", "docker", "ansible", "istio", "ci/cd"];
const canon = (s: string) => { try { const u = new URL(s); if (u.protocol !== "https:") return "";
 u.hash = ""; for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$)/.test(k)) u.searchParams.delete(k);
 return u.toString(); } catch { return ""; } };
const htmlText = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")
 .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 10000);
const timestamp = (s: unknown): string | null => { if (!s) return null;
 const n = typeof s === "number" ? (s > 100000000000 ? s : s * 1000) : Date.parse(String(s));
 return Number.isFinite(n) ? new Date(n).toISOString() : null; };
function job(title: string, company: string, location: string, source: string, url: string, rawDate: unknown,
 dateKind: string, description: string): Job | null {
 const link = canon(url); if (!link || !title) return null;
 const txt = (title + " " + description).toLowerCase();
 const tags = skills.filter(x => txt.includes(x)).slice(0, 7);
 const local = location.toLowerCase();
 const indiaEligible = /india|mumbai|navi mumbai|pune|hyderabad|bengaluru|bangalore|chennai|gurgaon|gurugram|noida|delhi|thane|kolkata|ahmedabad|worldwide|anywhere/.test(local);
 if (!indiaEligible) return null;
 if (!roles.some(x => title.toLowerCase().includes(x))) return null;
 if (/\b(intern|principal|director|vp|head of)\b/i.test(title)) return null;
 const score = Math.min(99, 42 + (local.includes("mumbai") ? 22 : local.includes("india") ? 17 : 10) + tags.length * 5);
 return { id: source + ":" + link, title, company, location, source, url: link,
   postedAt: timestamp(rawDate), dateKind, description: htmlText(description), tags, score };
}
async function json<T>(url: string): Promise<T> {
 const response = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(12000),
 headers: { "User-Agent": "JobPilotAI/1.0 (+public job board feed)", "Accept": "application/json" } });
 if (!response.ok) throw new Error("Upstream HTTP " + response.status);
 return response.json() as Promise<T>;
}
async function ashby(board: string): Promise<Job[]> {
 const data = await json<{jobs?:Record<string,unknown>[] }>("https://api.ashbyhq.com/posting-api/job-board/" + encodeURIComponent(board));
 return (data.jobs || []).filter(x => x.isListed !== false).map(x => job(String(x.title || ""),board,
  String(x.location || ""), "Ashby", String(x.jobUrl || ""), x.publishedAt, "last published",
  String(x.descriptionPlain || x.descriptionHtml || ""))).filter((x):x is Job=>!!x);
}
async function greenhouse(board: string): Promise<Job[]> {
 const data = await json<{jobs?: Record<string,unknown>[]}>("https://boards-api.greenhouse.io/v1/boards/" + encodeURIComponent(board) + "/jobs?content=true");
 return (data.jobs || []).map(x => job(String(x.title || ""),board,
  String((x.location as {name?:string}|undefined)?.name || ""), "Greenhouse",
  String(x.absolute_url || ""), x.first_published || x.updated_at,
  x.first_published ? "first published" : "updated", String(x.content || ""))).filter((x):x is Job=>!!x);
}
async function lever(board: string): Promise<Job[]> {
 const data = await json<Record<string,unknown>[]>("https://api.lever.co/v0/postings/" + encodeURIComponent(board) + "?mode=json");
 return (Array.isArray(data) ? data : []).map(x => job(String(x.text || ""),board,
 String((x.categories as {location?:string}|undefined)?.location || ""), "Lever",
 String(x.hostedUrl || ""), x.createdAt, "created", String(x.description || ""))).filter((x):x is Job=>!!x);
}
async function remotive(): Promise<Job[]> {
 const data = await json<{ jobs?:Record<string,unknown>[] }>("https://remotive.com/api/remote-jobs?limit=150");
 return (data.jobs || []).map(x => {
 const loc = String(x.candidate_required_location || "");
 return /india|worldwide|anywhere/i.test(loc) ? job(String(x.title||""), String(x.company_name||"Unknown"),
 "Remote · India eligible", "Remotive", String(x.url||""), x.publication_date, "published",
 String(x.description||"")) : null; }).filter((x):x is Job=>!!x);
}
async function himalayas(): Promise<Job[]> {
 const terms=["devops","platform engineer","site reliability"]; const results=await Promise.allSettled(terms.map(q=>json<{jobs?:Record<string,unknown>[]}>("https://himalayas.app/jobs/api/search?q=" + encodeURIComponent(q) + "&country=IN&sort=recent&page=1")));
 const entries=results.flatMap(r=>r.status==="fulfilled" ? (r.value.jobs || []) : []);
 return entries.map(x=>{
 const restrictions = (Array.isArray(x.locationRestrictions) ? x.locationRestrictions : []) as Array<{alpha2?:string;name?:string}>;
 if (restrictions.length && !restrictions.some(y => /^(in|india|worldwide|global)$/i.test(String(y.alpha2||y.name||"")))) return null;
 return job(String(x.title||""),String(x.companyName||"Unknown"),"Remote · India eligible","Himalayas",
 String(x.applicationLink||""),x.pubDate,"published",String(x.description||x.excerpt||""));
 }).filter((x):x is Job=>!!x);
}
const feeds: Feed[]=[
 {name:"Ashby · Linkup",load:()=>ashby("Linkup")},
 {name:"Ashby · Sarvam",load:()=>ashby("sarvam")},
 {name:"Ashby · Uptime AI",load:()=>ashby("uptimeai")},
 {name:"Greenhouse · SonicWall",load:()=>greenhouse("sonicwall")},
 {name:"Lever · Mactores",load:()=>lever("mactores")},
 {name:"Lever · BrightEdge",load:()=>lever("brightedge")},
 {name:"Remotive",load:remotive},
 {name:"Himalayas",load:himalayas}
];
export async function getJobs():Promise<{jobs:Job[];warnings:string[];scannedAt:string}> {
 const results=await Promise.allSettled(feeds.map(f=>f.load())); const warnings:string[]=[];
 const all: Job[]=[];
 results.forEach((r,i)=>{if(r.status==="fulfilled") all.push(...r.value); else warnings.push(feeds[i].name + " was temporarily unavailable");});
 const unique=new Map<string,Job>();
 for(const j of all) {const old=unique.get(j.url);if(!old || (j.postedAt||"")>(old.postedAt||"")) unique.set(j.url,j);}
 const jobs=[...unique.values()].sort((a,b)=> (b.postedAt||"").localeCompare(a.postedAt||"") || b.score-a.score).slice(0,200);
 return {jobs,warnings,scannedAt:new Date().toISOString()};
}