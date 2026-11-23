"use client";
import { useEffect, useMemo, useState } from "react";
import { Plane, Search, SlidersHorizontal, Compass, Bookmark, Sparkles, ArrowUpRight, ExternalLink, MapPin, Clock3, Building2, RefreshCw, ShieldCheck, KeyRound, LogOut, Mail, X, Check, AlertCircle, ChevronRight, Database, Github, WandSparkles, LockKeyhole } from "lucide-react";
import type { Job } from "@/lib/jobs";
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Tab = "discover" | "saved" | "ai";
type Model = {id:string;label:string};
type Saved = {job_id:string;title:string;company:string;location:string;url:string;source:string;posted_at:string|null;status:string};
const providerModels:Record<string,string[]> = {
 OpenAI:["gpt-4.1-mini"],Claude:["claude-sonnet-4-5"],Gemini:["gemini-2.5-flash"]
};
function dateLabel(date:string|null) {
 if(!date)return "Date unknown";
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
 const [loading,setLoading]=useState(true);
 const [warnings,setWarnings]=useState<string[]>([]);
 const [scannedAt,setScannedAt]=useState("");
 const [active,setActive]=useState<string>("");
 const [query,setQuery]=useState("");
 const [where,setWhere]=useState("all");
 const [source,setSource]=useState("all");
 const [sort,setSort]=useState("newest");
 const [user,setUser]=useState<User|null>(null);
 const [saved,setSaved]=useState<Saved[]>([]);
 const [authOpen,setAuthOpen]=useState(false);
 const [email,setEmail]=useState("");
 const [authMessage,setAuthMessage]=useState("");
 const [provider,setProvider]=useState("OpenAI");
 const [apiKey,setApiKey]=useState("");
 const [models,setModels]=useState<Model[]>([]);
 const [model,setModel]=useState("");
 const [modelsLoading,setModelsLoading]=useState(false);
 const [profile,setProfile]=useState("");
 const [draft,setDraft]=useState("");
 const [draftLoading,setDraftLoading]=useState(false);
 const [message,setMessage]=useState("");
 const supabaseReady=!!getSupabase();
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
 async function scan(){
   setLoading(true);setMessage("");
   try{
     const response=await fetch("/api/jobs",{cache:"no-store"});
     const data=await response.json();
     if(!response.ok)throw Error(data.error||"Job sources unavailable");
     setJobs(data.jobs||[]);setWarnings(data.warnings||[]);setScannedAt(data.scannedAt||"");
     setActive(previous=>previous || data.jobs?.[0]?.id || "");
   }catch(e){setMessage(e instanceof Error?e.message:"Unable to load jobs");}
   finally{setLoading(false);}
 }
 useEffect(()=>{void scan();},[]);
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
  setAuthMessage("");
  const sb=getSupabase();if(!sb){setAuthMessage("Accounts aren't enabled yet. The owner needs to connect Supabase first.");return;}
  const {error}=await sb.auth.signInWithOtp({email,emailRedirectTo:window.location.origin});
  setAuthMessage(error ? error.message : "Magic sign-in link sent. Check your inbox.");
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
    <div><span className="source-dot blue"/> Direct application links</div>
   </div>
   <div className="side-bottom">
    <div className="tip"><div className="tip-heading"><ShieldCheck size={17}/> Privacy first</div>
     <p>Applications are always yours to review and submit. Your AI key isn't saved.</p></div>
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
      <p>One place for jobs across company career pages and trusted remote feeds. Relevant openings, newest first.</p>
      <div className="hero-glow"/>
     </div>
     <div className="metrics">
      <div><span>OPEN ROLES FOUND</span><strong>{loading?"—":jobs.length}</strong><small>Across available sources</small></div>
      <div><span>COMPANIES</span><strong>{loading?"—":new Set(jobs.map(j=>j.company)).size}</strong><small>Hiring teams discovered</small></div>
      <div><span>SAVED OPPORTUNITIES</span><strong>{saved.length}</strong><small>{user?"Private to your account":"Sign in to save jobs"}</small></div>
     </div>
     <div className="section-row"><div><h2>Explore opportunities</h2><p>Explore recent DevOps, SRE and Platform roles.</p></div>
      <button className="outline-button" onClick={()=>void scan()} disabled={loading}><RefreshCw size={16} className={loading?"spin":""}/> Refresh</button></div>
     <div className="filterbar">
      <label className="searchbox"><Search size={18}/><input placeholder="Search roles, companies, technologies..." value={query} onChange={e=>setQuery(e.target.value)} /></label>
      <label className="filterselect"><MapPin size={16}/><select value={where} onChange={e=>setWhere(e.target.value)}><option value="all">All India</option><option value="mumbai">Mumbai area</option><option value="remote">Remote</option></select></label>
      <label className="filterselect"><SlidersHorizontal size={16}/><select value={source} onChange={e=>setSource(e.target.value)}><option value="all">All sources</option>{sources.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      <label className="filterselect"><Clock3 size={16}/><select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="score">Best match</option></select></label>
     </div>
     {warnings.length>0&&<div className="notice"><AlertCircle size={16}/> {warnings.length} source(s) unavailable during this scan. Other sources may still have results.</div>}
     {message&&<div className="notice error"><AlertCircle size={16}/>{message}<button onClick={()=>setMessage("")} aria-label="Dismiss"><X size={16}/></button></div>}
     <div className="listing-layout">
      <div className="listing">
       <div className="listing-head"><span>{loading?"Searching sources...":filtered.length+" matching opportunities"}</span><small>{scannedAt?"Updated "+new Date(scannedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"Public job feeds"}</small></div>
       {loading?<div className="empty"><RefreshCw size={30} className="spin"/><h3>Scanning job sources</h3><p>Checking published company career feeds.</p></div>:
        filtered.length===0?<div className="empty"><Search size={30}/><h3>No matching roles</h3><p>Try fewer filters or refresh the search.</p></div>:
        filtered.map(j=><button key={j.id} onClick={()=>setActive(j.id)} className={selected?.id===j.id?"job-card active":"job-card"}>
         <div className="job-card-top"><span className="company-avatar">{sourceLogo(j.company)}</span>
          <div className="job-head"><strong>{j.title}</strong><span>{j.company}</span></div>
          <span className="fit">{j.score}% fit</span>
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
       <div className="matchbar"><div><span>Keyword match</span><strong>{selected.score}/100</strong></div><div className="progress"><i style={{width:selected.score+"%"}}/></div><small>Skills and location relevance, not interview probability.</small></div>
       <h3>Technologies mentioned</h3><div className="chips">{selected.tags.length?selected.tags.map(t=><span key={t}>{t}</span>):<p className="muted">Review full job description for requirements.</p>}</div>
       <h3>About this opportunity</h3><p className="description">{selected.description.slice(0,1000)||"Open the official listing for its description."}</p>
       <div className="detail-buttons"><button className="primary-button" onClick={()=>applyLink(selected.url)}>View & apply <ExternalLink size={16}/></button>
        <button className="outline-button save-button" onClick={()=>void save(selected)}>{saved.some(x=>x.job_id===selected.id)?<Check size={16}/>:<Bookmark size={16}/>} {saved.some(x=>x.job_id===selected.id)?"Saved":"Save"}</button></div>
       <button className="ai-link" onClick={()=>{setTab("ai");setDraft("");}}><Sparkles size={15}/> Draft an application with AI <ArrowUpRight size={15}/></button>
       </>:<div className="empty">Choose a role to see details</div>}
      </aside>
     </div>
     <p className="footer-note">Jobs come from public feeds. Posting dates vary by source. Verify eligibility, availability and details directly with the employer.</p>
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
    <button className="primary-button full" onClick={()=>void signIn()} disabled={!email.includes("@")}><Mail size={17}/> Send sign-in link</button>
    {authMessage&&<p className="auth-message">{authMessage}</p>}
    {!supabaseReady&&<p className="auth-message">Accounts are not enabled on this preview. Public job browsing works without signing in.</p>}
    </div>
   </div>}
 </div>;
}
