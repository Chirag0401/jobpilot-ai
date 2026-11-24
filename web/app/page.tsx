"use client";
import { useEffect, useMemo, useState } from "react";
import { Plane, Search, SlidersHorizontal, Compass, Bookmark, Sparkles, ArrowUpRight, ExternalLink, MapPin, Clock3, Building2, RefreshCw, ShieldCheck, KeyRound, LogOut, Mail, X, Check, AlertCircle, ChevronRight, Database, Github, WandSparkles, LockKeyhole } from "lucide-react";
import type { Job } from "@/lib/jobs";
import { PORTALS } from "@/lib/portal-search";
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Tab = "discover" | "saved" | "ai";
type Model = {id:string;label:string};
type Saved = {job_id:string;title:string;company:string;location:string;url:string;source:string;posted_at:string|null;status:string};
const providerModels:Record<string,string[]> = {
 OpenAI:["gpt-4.1-mini"],Claude:["claude-sonnet-4-5"],Gemini:["gemini-2.5-flash"]
};
function dateLabel(date:string|null) {
 if(!date)return "Posting date unverified";
 const days=Math.floor((Date.now()-new Date(date).getTime())/86400000);
 if(!Number.isFinite(days))return "Date unknown";
 if(days<=0)return "Today";
 if(days===1)return "Yesterday";
 if(days<30)return days+" days ago";
 return new Date(date).toLocaleDateString("en-IN",{month:"short",day:"numeric",year:"numeric"});
}
function sourceLogo(source:string){return source.slice(0,1).toUpperCase();}
export default function Page(){
 const [tab,setTab]=useState<Tab>("discover");
 const [jobs,setJobs]=useState<Job[]>([]);
 const [loading,setLoading]=useState(false);
 const [hasSearched,setHasSearched]=useState(false);
 const [searchKind,setSearchKind]=useState<"portals"|"company"|null>(null);
 const [lastSearch,setLastSearch]=useState("");
 const [searchStats,setSearchStats]=useState<{queries?:number;inspected:number;matched:number;duplicates?:number}|null>(null);
 const [warnings,setWarnings]=useState<string[]>([]);
 const [scannedAt,setScannedAt]=useState("");
 const [active,setActive]=useState<string>("");
 const [query,setQuery]=useState("");
 const [where,setWhere]=useState("all");
 const [source,setSource]=useState("all");
 const [sort,setSort]=useState("score");
 const [user,setUser]=useState<User|null>(null);
 const [saved,setSaved]=useState<Saved[]>([]);
 const [authOpen,setAuthOpen]=useState(false);
 const [email,setEmail]=useState("");
 const [authMessage,setAuthMessage]=useState("");
 const [authIsError,setAuthIsError]=useState(false);
 const [authSending,setAuthSending]=useState(false);
 const [authCooldownSeconds,setAuthCooldownSeconds]=useState(0);
 const [provider,setProvider]=useState("OpenAI");
 const [apiKey,setApiKey]=useState("");
 const [models,setModels]=useState<Model[]>([]);
 const [model,setModel]=useState("");
 const [modelsLoading,setModelsLoading]=useState(false);
 const [profile,setProfile]=useState("");
 const [draft,setDraft]=useState("");
 const [draftLoading,setDraftLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [serperKey,setSerperKey]=useState("");
 const [portalIds,setPortalIds]=useState<string[]>(["linkedin","indeed","naukri","workday","wellfound"]);
 const [searchRole,setSearchRole]=useState("");
 const [searchLocation,setSearchLocation]=useState("India");
 const [searchDepth,setSearchDepth]=useState<1|2>(1);
 const [freshness,setFreshness]=useState<"any"|"week"|"month">("month");
 const [careerUrlsText,setCareerUrlsText]=useState("");
 const [discovering,setDiscovering]=useState(false);
 const [careersLoading,setCareersLoading]=useState(false);
 const [discoveryNotice,setDiscoveryNotice]=useState("");
 const supabaseReady=!!getSupabase();
 useEffect(()=>{
   // Supabase includes authentication failures in the URL fragment after redirect.
   // Surface them in our existing sign-in modal, without leaving error details in URL.
   const fragment=new URLSearchParams(window.location.hash.replace(/^#/, ""));
   const errorCode=fragment.get("error_code") || fragment.get("error");
   if(errorCode){
     setAuthOpen(true);
     setAuthIsError(true);
     setAuthMessage(errorCode==="otp_expired"
       ? "This sign-in link has expired or has already been used. Enter your email to request a new one."
       : "Sign-in did not complete. Please request a fresh email link.");
     window.history.replaceState(null,"",window.location.pathname+window.location.search);
   }
 },[]);
 useEffect(()=>{
   const sb=getSupabase();if(!sb)return;
   sb.auth.getUser().then(({data})=>setUser(data.user));
   const {data:{subscription}}=sb.auth.onAuthStateChange((_event,session)=>setUser(session?.user||null));
   return ()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{
   const sb=getSupabase();if(!sb||!user){setSaved([]);return;}
   sb.from("saved_jobs").select("*").order("created_at",{ascending:false}).then(({data,error})=>{
     if(error){setMessage("Saved jobs database is not configured yet.");return;}
     setSaved((data||[]) as Saved[]);
   });
 },[user]);
 function resetSearch(kind:"portals"|"company"){
  setHasSearched(true);
  setSearchKind(kind);
  setLastSearch(searchRole.trim());
  setJobs([]);setActive("");
  setSource("all");setWhere("all");setQuery("");setSort("score");
  setWarnings([]);setSearchStats(null);setScannedAt("");
  setDiscoveryNotice("");setMessage("");setLoading(true);
 }
 const careerUrls=()=>careerUrlsText.split(/[\r\n]+/).map(x=>x.trim()).filter(Boolean).slice(0,6);
 async function searchPortals(){
  if(discovering||careersLoading)return;
  if(!searchRole.trim()){setMessage("Enter the job role you want first.");return;}
  if(!portalIds.length&&!careerUrls().length){setMessage("Select at least one portal or company website.");return;}
  if(serperKey.trim().length<8){setMessage("Enter a valid Serper API key for indexed portal search.");return;}
  resetSearch("portals");
  setDiscovering(true);
  try{
   const response=await fetch("/api/discover",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({apiKey:serperKey,portalIds,role:searchRole,location:searchLocation,
     careerSites:careerUrls().slice(0,5),depth:searchDepth,freshness})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Search could not complete");
   const results:Job[]=data.jobs||[];
   setJobs(results);setActive(results[0]?.id||"");
   setSearchStats(data.stats||null);
   setScannedAt(new Date().toISOString());
   const metrics=data.stats||{};
   setDiscoveryNotice("Search complete: "+results.length+" relevant results from "+(metrics.inspected||0)+
    " indexed hits across "+(metrics.queries||0)+" queries. Unverified dates and locations are clearly labeled.");
   setWarnings(data.warnings||[]);
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to search selected portals");}
  finally{setDiscovering(false);setLoading(false);}
 }
 async function searchCompanies(){
  if(discovering||careersLoading)return;
  if(!searchRole.trim()){setMessage("Enter the job role you want first.");return;}
  const urls=careerUrls();
  if(!urls.length){setMessage("Add at least one supported company career URL.");return;}
  resetSearch("company");
  setCareersLoading(true);
  try{
   const response=await fetch("/api/company",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({urls,role:searchRole,location:searchLocation})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Unable to search career pages");
   const results:Job[]=data.jobs||[];
   setJobs(results);setActive(results[0]?.id||"");
   setSearchStats(data.stats||null);
   setScannedAt(new Date().toISOString());
   setDiscoveryNotice("Career scan complete: "+results.length+" relevant results from "+
    (data.stats?.inspected||0)+" public ATS job entries.");
   setWarnings(data.warnings||[]);
  }catch(e){setMessage(e instanceof Error?e.message:"Unable to search company career pages");}
  finally{setCareersLoading(false);setLoading(false);}
 }
 // A client-side cooldown reduces accidental duplicate email requests.
 // It cannot override or reset Supabase's project-wide SMTP quota.
 useEffect(()=>{
   if(authCooldownSeconds<=0)return;
   const timer=window.setTimeout(()=>setAuthCooldownSeconds(seconds=>Math.max(0,seconds-1)),1000);
   return ()=>window.clearTimeout(timer);
 },[authCooldownSeconds]);
 const providers=["OpenAI","Claude","Gemini"];
 useEffect(()=>{setModels([]);setModel("");setApiKey("");setDraft("");},[provider]);
 const selected=jobs.find(j=>j.id===active)||jobs[0];
 const filtered=useMemo(()=>{
   const term=query.toLowerCase().trim();
   const available=jobs.filter(j=>(!term || (j.title+" "+j.company+" "+j.description+" "+j.tags.join(" ")).toLowerCase().includes(term))
    && (where==="all" || (where==="mumbai" ? /mumbai|navi mumbai|thane/i.test(j.location) :
    where==="remote" ? /remote/i.test(j.location) : /india/i.test(j.location)))
    && (source==="all" || j.source===source));
   return [...available].sort((a,b)=>sort==="score"?b.score-a.score:(b.postedAt||"").localeCompare(a.postedAt||"")||b.score-a.score);
 },[jobs,query,where,source,sort]);
 const sources=Array.from(new Set(jobs.map(j=>j.source))).sort();
 async function loadModels(){
  setModelsLoading(true);setMessage("");
  try{
    const response=await fetch("/api/models",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,apiKey})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"Could not load models");
    setModels(data.models||[]);setModel(data.models?.[0]?.id||"");
    if(!data.models?.length)setMessage("No compatible text models were returned by this API key. You can enter a model ID manually.");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not load models");}
  finally{setModelsLoading(false);}
 }
 async function generate(){
  if(!selected){setMessage("Select a job first.");return;}
  setDraftLoading(true);setMessage("");
  try{
    const response=await fetch("/api/draft",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({provider,model,apiKey,job:selected,profile})});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"Generation failed");
    setDraft(data.text||"No text returned");setTab("ai");
  }catch(e){setMessage(e instanceof Error?e.message:"Generation failed");}
  finally{setDraftLoading(false);}
 }
 async function save(job:Job){
  if(!user){setAuthOpen(true);return;}
  const sb=getSupabase();if(!sb)return;
  const {error}=await sb.from("saved_jobs").upsert({user_id:user.id,job_id:job.id,title:job.title,
   company:job.company,location:job.location,source:job.source,url:job.url,posted_at:job.postedAt,status:"saved"},
   {onConflict:"user_id,job_id"});
  if(error){setMessage("Couldn't save this job. Please check your database setup.");return;}
  setSaved(prev=>[{job_id:job.id,title:job.title,company:job.company,location:job.location,
    url:job.url,source:job.source,posted_at:job.postedAt,status:"saved"},...prev.filter(x=>x.job_id!==job.id)]);
 }
 async function removeSaved(id:string){
  const sb=getSupabase();if(!sb||!user)return;
  const {error}=await sb.from("saved_jobs").delete().eq("job_id",id).eq("user_id",user.id);
  if(error){setMessage("Couldn't remove this job.");return;}
  setSaved(prev=>prev.filter(x=>x.job_id!==id));
 }
 async function signIn(){
  if(authSending || authCooldownSeconds>0)return;
  setAuthMessage("");
  setAuthIsError(false);
  const sb=getSupabase();
  if(!sb){setAuthIsError(true);setAuthMessage("Accounts aren't enabled yet. The owner needs to connect Supabase first.");return;}
  const address=email.trim();
  if(!address.includes("@"))return;
  setAuthSending(true);
  try{
    // Explicit production redirect; the same URL must be allowed in Supabase Auth.
    const redirectTo=(process.env.NEXT_PUBLIC_JOBPILOT_SITE_URL || window.location.origin).replace(/\/$/, "");
    const {error}=await sb.auth.signInWithOtp({email:address,options:{emailRedirectTo:redirectTo}});
    if(error){
      setAuthIsError(true);
      const code=error.code||"";
      if(code==="over_email_send_rate_limit" || /email rate limit exceeded/i.test(error.message)){
        setAuthCooldownSeconds(10*60);
        setAuthMessage("The site's email sending quota has been reached. No new magic link was sent. Try again after Supabase's limit resets. The site owner needs to configure custom SMTP for reliable sign-in.");
      } else if(error.status===429 || /rate limit/i.test(error.message)){
        setAuthCooldownSeconds(60);
        setAuthMessage("Too many sign-in requests. Please retry after the provider's rate limit resets.");
      } else if(code==="email_address_not_authorized"){
        setAuthMessage("The site's built-in email sender only supports authorized team addresses. The site owner needs to configure custom SMTP.");
      } else {
        setAuthMessage(error.message);
      }
    } else {
      setAuthCooldownSeconds(60);
      setAuthMessage("Sign-in email requested successfully. Check your inbox and open only the newest link.");
    }
  }catch{
    setAuthIsError(true);
    setAuthMessage("Couldn't request a sign-in link. Check your connection and try again.");
  }finally{setAuthSending(false);}
 }
 function openJob(id:string){setActive(id);setTab("discover");setDraft("");}
 function applyLink(url:string){window.open(url,"_blank","noopener,noreferrer");}
 return <div className="shell">
  <aside className="sidebar">
   <div className="brand"><div className="brandmark"><Plane size={21} strokeWidth={2.6}/></div>
     <div><strong>jobpilot<span>.ai</span></strong><small>YOUR CAREER COPILOT</small></div></div>
   <div className="side-label">WORKSPACE</div>
   <nav className="nav" aria-label="Main navigation">
    <button className={tab==="discover"?"nav-item selected":"nav-item"} onClick={()=>setTab("discover")}><Compass size={18}/> Discover jobs <ChevronRight size={15} className="nav-right"/></button>
    <button className={tab==="saved"?"nav-item selected":"nav-item"} onClick={()=>setTab("saved")}><Bookmark size={18}/> Saved jobs <span className="count">{saved.length}</span></button>
    <button className={tab==="ai"?"nav-item selected":"nav-item"} onClick={()=>setTab("ai")}><Sparkles size={18}/> AI application studio</button>
   </nav>
   <div className="side-label sources-label">YOUR SOURCES</div>
   <div className="sidebar-sources">
    <div><span className="source-dot green"/> Ashby & company ATS</div>
    <div><span className="source-dot purple"/> Remote job feeds</div>
    <div><span className="source-dot blue"/> Indexed portal discovery</div>
   </div>
   <div className="side-bottom">
    <div className="tip"><div className="tip-heading"><ShieldCheck size={17}/> Privacy first</div>
     <p>Applications are always yours to review and submit. Your AI and Serper keys aren't saved.</p></div>
    <a className="github-link" href="https://github.com/Chirag0401/jobpilot-ai" target="_blank" rel="noreferrer"><Github size={17}/> Open-source on GitHub <ArrowUpRight size={14}/></a>
   </div>
  </aside>
  <main className="main">
   <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{tab==="discover"?"Discover":tab==="saved"?"Saved jobs":"AI Studio"}</strong></div>
    <div className="top-actions"><span className="live"><span/> BETA VERSION</span>
    {user?<button className="user-pill" onClick={async()=>{await getSupabase()?.auth.signOut();setUser(null);}}><LogOut size={15}/> Sign out</button>:
    <button className="user-pill" onClick={()=>{setAuthOpen(true);setAuthMessage("");}}><LockKeyhole size={15}/> Sign in</button>}</div>
   </header>
   <div className="content">
    {tab==="discover" ? <>
     <div className="hero"><div className="eyebrow"><Sparkles size={15}/> INTELLIGENT JOB DISCOVERY</div>
      <h1>Your next big move <span>starts here.</span></h1>
      <p>Search for your role, choose the websites you trust, and see only results from that search. No preset jobs or career assumptions.</p>
      <div className="hero-glow"/>
     </div>
     <section className="discovery-panel" aria-label="Additional job sources">
       <div className="discovery-header"><div><h3>Search for your next role</h3><p>Choose a role, location and sources. No jobs load until you search.</p></div><Search size={20}/></div>
       <div className="discovery-query">
        <label className="field"><span>Job title / role <small>Required</small></span><input autoFocus value={searchRole} onChange={e=>setSearchRole(e.target.value)} maxLength={90} placeholder="e.g. Data Analyst, UI Designer, Software Engineer, DevOps OR SRE"/></label>
        <label className="field"><span>Location <small>Editable</small></span><input value={searchLocation} onChange={e=>setSearchLocation(e.target.value)} maxLength={60} placeholder="India, Mumbai, Remote, United States"/></label>
       </div>
       <div className="discovery-grid">
        <div className="discovery-card">
         <div className="discovery-card-title"><strong>Portal search powered by Serper</strong><a href="https://serper.dev/" target="_blank" rel="noreferrer">Get Serper key <ArrowUpRight size={12}/></a></div>
         <label className="field"><span>Serper API key <small>Not stored</small></span><input type="password" autoComplete="off" value={serperKey} onChange={e=>setSerperKey(e.target.value)} placeholder="Paste key for Google-indexed job search"/></label>
         <div className="discovery-row">
          <label className="field"><span>Search-index recency</span><select value={freshness} onChange={e=>setFreshness(e.target.value as "any"|"week"|"month")}><option value="month">Past month (Google)</option><option value="week">Past week (Google)</option><option value="any">Any time</option></select></label>
          <label className="field"><span>Search depth</span><select value={searchDepth} onChange={e=>setSearchDepth(Number(e.target.value)===2?2:1)}><option value={1}>Standard (up to 20 per portal)</option><option value={2}>Deeper (up to 40 per portal)</option></select></label>
         </div>
         <div className="discovery-card-title"><strong>Select portals ({portalIds.length}/{PORTALS.length})</strong><button className="text-action" onClick={()=>setPortalIds(portalIds.length===PORTALS.length?[]:PORTALS.map(p=>p.id))}>{portalIds.length===PORTALS.length?"Clear all":"Select all"}</button></div>
         <div className="portal-options">{PORTALS.map(p=><label className="portal-option" key={p.id}><input type="checkbox" checked={portalIds.includes(p.id)} onChange={e=>setPortalIds(prev=>e.target.checked?[...prev,p.id]:prev.filter(x=>x!==p.id))}/>{p.name}</label>)}</div>
         <button className="primary-button full" onClick={()=>void searchPortals()} disabled={loading||!searchRole.trim()||serperKey.trim().length<8||(!portalIds.length&&!careerUrlsText.trim())}><Search size={15}/>{discovering?"Searching indexed sources...":"Search selected portals"}</button>
         <p className="discovery-note">Estimate: {(portalIds.length+Math.min(careerUrls().length,5))*searchDepth} Serper queries/credits. Google might return fewer results than requested. Index recency does not establish job posting dates.</p>
        </div>
        <div className="discovery-card">
         <div className="discovery-card-title"><strong>Company career pages</strong><span className="mini-tag">Direct public feeds</span></div>
         <label className="field"><span>Career URLs <small>One per line · up to 6</small></span>
          <textarea rows={5} value={careerUrlsText} onChange={e=>setCareerUrlsText(e.target.value)} placeholder={"https://jobs.ashbyhq.com/company\nhttps://apply.workable.com/company\nhttps://company.wd5.myworkdayjobs.com/en-US/External"}/></label>
         <button className="outline-button full" disabled={loading||!searchRole.trim()||!careerUrlsText.trim()} onClick={()=>void searchCompanies()}><Building2 size={15}/>{careersLoading?"Checking careers sites...":"Scan supported boards (free)"}</button>
         <p className="discovery-note">Search YOUR role on supported public career feeds: Workday, Ashby, Greenhouse, Lever, Workable and SmartRecruiters. Workday's unofficial feed may change; use Serper for other domains.</p>
        </div>
       </div>
       {discoveryNotice&&<div className="discovery-notice" role="status">{discoveryNotice}</div>}
      </section>
      {message&&<div className="notice error" role="alert"><AlertCircle size={16}/>{message}<button onClick={()=>setMessage("")} aria-label="Dismiss"><X size={16}/></button></div>}
      {hasSearched ? <>
      <div className="metrics">
      <div><span>RESULTS FOR THIS SEARCH</span><strong>{loading?"—":jobs.length}</strong><small>Your selected role</small></div>
      <div><span>SOURCES</span><strong>{loading?"—":new Set(jobs.map(j=>j.source)).size}</strong><small>Sources matching your search</small></div>
      <div><span>SAVED OPPORTUNITIES</span><strong>{saved.length}</strong><small>{user?"Private to your account":"Sign in to save jobs"}</small></div>
     </div>
     <div className="section-row"><div><h2>Results for {lastSearch}</h2><p>Only your latest search; searching again replaces the old results.</p></div><button className="outline-button" onClick={()=>void (searchKind==="portals"?searchPortals():searchCompanies())} disabled={loading}><RefreshCw size={16} className={loading?"spin":""}/> Search again</button></div>
     <div className="filterbar">
      <label className="searchbox"><Search size={18}/><input placeholder="Filter these results..." value={query} onChange={e=>setQuery(e.target.value)} /></label>
      <label className="filterselect"><MapPin size={16}/><select value={where} onChange={e=>setWhere(e.target.value)}><option value="all">All locations (including unverified)</option><option value="mumbai">Mumbai area</option><option value="remote">Remote</option></select></label>
      <label className="filterselect"><SlidersHorizontal size={16}/><select value={source} onChange={e=>setSource(e.target.value)}><option value="all">All sources</option>{sources.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      <label className="filterselect"><Clock3 size={16}/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="score">Most relevant</option><option value="newest">Newest (if available)</option></select></label>
     </div>
     
      {warnings.length>0&&<div className="notice"><AlertCircle size={16}/> {warnings.length} source warning(s): {warnings.slice(0,3).join(" · ")}{warnings.length>3?" (and more)":""}</div>}
     
     <div className="listing-layout">
      <div className="listing">
       <div className="listing-head"><span>{loading?"Searching selected sources...":filtered.length+" matching results"}</span><small>{scannedAt?"Updated "+new Date(scannedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"Public job feeds"}</small></div>
       {loading?<div className="empty"><RefreshCw size={30} className="spin"/><h3>Searching for {lastSearch}...</h3><p>Checking only the sources you selected.</p></div>:
        filtered.length===0?<div className="empty"><Search size={30}/><h3>No matching jobs in these sources</h3><p>Broaden the role or location, or use the deeper search. Indexed coverage is not exhaustive.</p></div>:
        filtered.map(j=><button key={j.id} onClick={()=>setActive(j.id)} className={selected?.id===j.id?"job-card active":"job-card"}>
         <div className="job-card-top"><span className="company-avatar">{sourceLogo(j.company)}</span>
          <div className="job-head"><strong>{j.title}</strong><span>{j.company}</span></div>
          <span className="fit">{j.score>=90?"Strong title match":j.score>=65?"Role match":"Possible match"}</span>
         </div>
         <div className="job-meta"><span><MapPin size={13}/>{j.location}</span><span><Clock3 size={13}/>{dateLabel(j.postedAt)}</span></div>
         <div className="job-bottom"><span className="source-tag">{j.source}</span><span className="job-tags">{j.tags.slice(0,2).join(" · ")}</span><ChevronRight size={17}/></div>
        </button>)}
      </div>
      <aside className="detail">
       {selected?<><div className="detail-head"><div className="detail-avatar">{sourceLogo(selected.company)}</div>
       <span className="source-tag">{selected.source}</span></div>
       <h2>{selected.title}</h2><div className="detail-company"><Building2 size={16}/>{selected.company}</div>
       <div className="detail-info"><span><MapPin size={15}/>{selected.location}</span><span><Clock3 size={15}/>{dateLabel(selected.postedAt)} · {selected.dateKind}</span></div>
       <div className="detail-divider"/>
       <div className="matchbar"><div><span>Role keyword relevance</span><strong>{selected.score}/100</strong></div><div className="progress"><i style={{width:selected.score+"%"}}/></div><small>Based on role text, not your resume, eligibility or interview probability.</small></div>
       <h3>Listing details</h3><div className="chips">{selected.tags.length?selected.tags.map(t=><span key={t}>{t}</span>):<p className="muted">Review full job description for requirements.</p>}</div>
       <h3>{selected.source.includes("Google index")?"Google search excerpt (unverified)":"About this opportunity"}</h3><p className="description">{selected.description.slice(0,1000)||"Open the official listing for its description."}</p>
       <div className="detail-buttons"><button className="primary-button" onClick={()=>applyLink(selected.url)}>View & apply <ExternalLink size={16}/></button>
        <button className="outline-button save-button" onClick={()=>void save(selected)}>{saved.some(x=>x.job_id===selected.id)?<Check size={16}/>:<Bookmark size={16}/>} {saved.some(x=>x.job_id===selected.id)?"Saved":"Save"}</button></div>
       <button className="ai-link" onClick={()=>{setTab("ai");setDraft("");}}><Sparkles size={15}/> Draft an application with AI <ArrowUpRight size={15}/></button>
       </>:<div className="empty">Choose a role to see details</div>}
      </aside>
     </div>
     {searchStats&&<p className="footer-note">Search details: {searchStats.inspected} indexed/feed listings inspected, {searchStats.matched} role matches, {jobs.length} unique results{searchStats.queries?", "+searchStats.queries+" Serper queries":""}. This is not a count of all open jobs.</p>}
      <p className="footer-note">Jobs include direct public feeds and optionally Google-indexed results. Indexed results have unverified publication dates and locations. Confirm job eligibility, availability and details with the original employer.</p>
      </> : <div className="search-empty"><Search size={30}/><h3>Ready when you are</h3><p>Enter a job role and choose sources above, then click Search. Nothing is loaded by default.</p></div>}
    </>:tab==="saved"?<>
     <div className="section-row page-heading"><div><div className="eyebrow">YOUR SHORTLIST</div><h1>Saved opportunities</h1><p>A private space to keep track of roles worth pursuing.</p></div></div>
     {!user?<div className="feature-empty"><Bookmark size={34}/><h2>Keep your best opportunities together</h2><p>Sign in with email to privately save jobs and return to them later.</p><button className="primary-button" onClick={()=>setAuthOpen(true)}>Sign in to save jobs <ArrowUpRight size={16}/></button></div>:
      saved.length===0?<div className="feature-empty"><Bookmark size={34}/><h2>Nothing saved yet</h2><p>Explore openings and bookmark the ones you like.</p><button className="primary-button" onClick={()=>setTab("discover")}>Discover jobs <ArrowUpRight size={16}/></button></div>:
      <div className="saved-grid">{saved.map(j=><div className="saved-card" key={j.job_id}><span className="source-tag">{j.source}</span><h3>{j.title}</h3><p>{j.company} · {j.location}</p><div><a href={j.url} target="_blank" rel="noreferrer">Official listing <ArrowUpRight size={14}/></a><button onClick={()=>void removeSaved(j.job_id)}>Remove</button></div></div>)}</div>}
    </>:<>
     <div className="section-row page-heading"><div><div className="eyebrow"><Sparkles size={15}/> YOUR AI COPILOT</div><h1>Application studio</h1><p>Write thoughtful, personal answers using your choice of AI model.</p></div></div>
     <div className="studio-grid">
      <div className="studio-panel">
       <div className="panel-heading"><div><h2>AI configuration</h2><p>Use your own model provider and API key.</p></div><WandSparkles size={20}/></div>
       <label className="field"><span>AI provider</span><select value={provider} onChange={e=>setProvider(e.target.value)}>{providers.map(p=><option key={p}>{p}</option>)}</select></label>
       <label className="field"><span>API key</span><input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="Paste your API key (not saved)"/></label>
       <button className="outline-button full" onClick={()=>void loadModels()} disabled={modelsLoading||apiKey.trim().length<8}><RefreshCw size={15} className={modelsLoading?"spin":""}/>{modelsLoading?"Loading models...":"Load available models"}</button>
       <label className="field"><span>Model <small>{models.length?"Retrieved from provider":"Enter a model ID or connect a key"}</small></span>
        {models.length?<select value={model} onChange={e=>setModel(e.target.value)}><option value="">Select a model</option>{models.map(m=><option key={m.id} value={m.id}>{m.label} ({m.id})</option>)}</select>:
        <input value={model} onChange={e=>setModel(e.target.value)} placeholder={providerModels[provider][0]}/>}</label>
       <label className="field"><span>Your verified experience <small>Optional</small></span><textarea rows={5} value={profile} onChange={e=>setProfile(e.target.value)} placeholder="Example: 4 years building CI/CD pipelines and Kubernetes infrastructure..."/></label>
       <div className="key-note"><KeyRound size={16}/> API keys are used for this request only, never saved in a database. Provider API usage may incur charges.</div>
      </div>
      <div className="studio-panel draft-panel">
       <div className="panel-heading"><div><h2>Application draft</h2><p>Review and edit the output before using it.</p></div><Sparkles size={20}/></div>
       <label className="field"><span>Selected job</span><select value={selected?.id||""} onChange={e=>setActive(e.target.value)}><option value="">Choose a job</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.title} — {j.company}</option>)}</select></label>
       <label className="field"><span>Your editable answer</span><textarea className="draft-text" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="AI-generated answers will appear here. You are always in control."/></label>
       {message&&<div className="notice error"><AlertCircle size={16}/>{message}</div>}
       <div className="draft-buttons"><button className="primary-button" disabled={draftLoading||!selected||!apiKey||!model} onClick={()=>void generate()}>{draftLoading?"Generating...":"Generate draft"} <Sparkles size={16}/></button>
        <button className="outline-button" disabled={!draft} onClick={()=>navigator.clipboard.writeText(draft)}>Copy answer</button></div>
       <p className="footer-note">AI-generated text can contain errors. Check every statement before submitting an application.</p>
      </div>
     </div>
    </>}
   </div>
  </main>
  {authOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setAuthOpen(false);}}>
    <div className="modal" role="dialog" aria-modal="true" aria-label="Sign in"><button className="modal-close" onClick={()=>setAuthOpen(false)}><X size={18}/></button>
    <div className="brandmark modal-logo"><Plane size={23}/></div><h2>Welcome to JobPilot</h2><p>Sign in to save opportunities privately and manage your job search.</p>
    <label className="field"><span>Email address</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
    <button className="primary-button full" onClick={()=>void signIn()} disabled={!email.includes("@")||authSending||authCooldownSeconds>0}><Mail size={17}/> {authSending?"Sending...":authCooldownSeconds>0?"Retry in "+Math.ceil(authCooldownSeconds/60)+"m":"Send sign-in link"}</button>
    {authMessage&&<p role="status" aria-live="polite" className={authIsError?"auth-message auth-error":"auth-message"}>{authMessage}</p>}
    {!supabaseReady&&<p className="auth-message">Accounts are not enabled on this preview. Public job browsing works without signing in.</p>}
    </div>
   </div>}
 </div>;
}
