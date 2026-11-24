import test from "node:test";
import assert from "node:assert/strict";
import {rolePhrases,roleRelevance,buildQuery,extractIndexedJob,
 searchIndexedJobs,validateCareerDomains} from "../lib/portal-search";
import {parseBoard} from "../lib/company-boards";

test("roles are chosen by the visitor rather than hard-coded DevOps terms",()=>{
 assert.deepEqual(rolePhrases("Data Scientist OR Product Designer"),["data scientist","product designer"]);
 assert.equal(roleRelevance("Data Scientist","Analyze data","Data Scientist"),94);
 assert.equal(roleRelevance("Senior UX Designer","Figma design","Product Designer"),0);
 assert.equal(roleRelevance("DevOps Engineer","AWS kubernetes","Data Analyst"),0);
 assert.ok(roleRelevance("Product Designer","Design product interfaces","Product Designer")>=90);
 assert.equal(roleRelevance("JavaScript Developer","React apps","Java"),0);
});
test("Serper queries target the selected role and a specific portal",()=>{
 const query=buildQuery("Data Analyst OR Business Analyst","Mumbai","linkedin.com/jobs/view");
 assert.match(query,/Data Analyst/i);
 assert.match(query,/Business Analyst/i);
 assert.match(query,/Mumbai/i);
 assert.match(query,/site:linkedin.com\/jobs\/view/);
 assert.doesNotMatch(buildQuery("UI Designer","India","indeed.com"),/DevOps/i);
});
test("non-vacancy portal pages and irrelevant results are rejected",()=>{
 const t={name:"LinkedIn",domain:"linkedin.com",site:"linkedin.com/jobs/view",id:"linkedin"};
 assert.equal(extractIndexedJob({title:"LinkedIn Jobs",link:"https://www.linkedin.com/jobs/",snippet:"Data Scientist"} ,t,"Data Scientist","India"),null);
 assert.equal(extractIndexedJob({title:"DevOps Engineer",link:"https://www.linkedin.com/jobs/view/10001",snippet:"AWS"},t,"Data Scientist","India"),null);
 const job=extractIndexedJob({title:"Data Scientist — Example | LinkedIn",link:"https://www.linkedin.com/jobs/view/10001?utm_source=google",snippet:"Data analytics role in Mumbai"},t,"Data Scientist","Mumbai");
 assert.ok(job);
 assert.equal(job?.postedAt,null);
 assert.match(job!.dateKind,/not verified/);
 assert.match(job!.source,/Google index/);
 assert.ok(!job!.url.includes("utm_source"));
});
test("company site input does not enable arbitrary private URL fetching",()=>{
 assert.deepEqual(validateCareerDomains(["https://careers.example.com/jobs",
  "http://localhost:3000","https://127.0.0.1", "https://intranet.local/roles"]),["careers.example.com"]);
 assert.equal(parseBoard("https://localhost:3000/"),null);
 assert.equal(parseBoard("https://fake-workday.example.com/External"),null);
 assert.deepEqual(parseBoard("https://jobs.ashbyhq.com/example"),{kind:"ashby",slug:"example"});
 const workday=parseBoard("https://example.wd5.myworkdayjobs.com/en-US/External");
 assert.ok(workday&&workday.kind==="workday");
});
test("Serper uses conservative paging: 10 per page, no page=1, no unrelated jobs",async()=>{
 const original=globalThis.fetch;
 const calls:Array<{num:number;page?:number;q:string}>=[];
 globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(String(options?.body||"{}")) as {q:string;page?:number;num:number};
  calls.push(body);
  assert.equal(body.num,10);
  assert.equal(body.page===undefined||body.page===2,true);
  assert.match(body.q,/data analyst/i);
  const organic=body.page===2?[
    {title:"Data Analyst role",link:"https://www.linkedin.com/jobs/view/1100",snippet:"India"}
   ]:Array.from({length:10},(_,i)=>({
    title:i<8?"Data Analyst":"DevOps Engineer",
    link:"https://www.linkedin.com/jobs/view/"+(1000+i),
    snippet:i<8?"Data analytics position India":"Kubernetes platform AWS"
   }));
  return new Response(JSON.stringify({organic}),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
  const out=await searchIndexedJobs("test_serper_key_012345",["linkedin"],"Data Analyst","India",[],{depth:2,freshness:"any"});
  assert.equal(calls.length,2);
  assert.equal(calls[0].page,undefined);
  assert.equal(calls[1].page,2);
  assert.equal(out.stats.queries,2);
  assert.equal(out.stats.successfulQueries,2);
  assert.equal(out.stats.failedQueries,0);
  assert.equal(out.stats.inspected,11);
  assert.equal(out.jobs.length,9);
  assert.ok(out.jobs.every(job=>job.title.includes("Data Analyst")));
 }finally{globalThis.fetch=original;}
});

test("HTTP 400 for recency uses one compatibility retry without it",async()=>{
 const original=globalThis.fetch;
 const calls:Array<{tbs?:string;num:number}>=[];
 globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(String(options?.body||"{}")) as {tbs?:string;num:number};
  calls.push(body);
  if(body.tbs)return new Response("unsupported option",{status:400});
  return new Response(JSON.stringify({organic:[{title:"Data Analyst",link:"https://www.linkedin.com/jobs/view/123456",snippet:"Data Analyst"}]}),{status:200});
 };
 try{
  const out=await searchIndexedJobs("valid_fake_key_12345",["linkedin"],"Data Analyst","India",[],{freshness:"month"});
  assert.equal(calls.length,2);
  assert.equal(calls[0].tbs,"qdr:m");
  assert.equal(calls[1].tbs,undefined);
  assert.equal(out.jobs.length,1);
  assert.equal(out.stats.successfulQueries,1);
  assert.equal(out.stats.failedQueries,1);
  assert.match(out.warnings.join(" "),/recency filter/i);
 }finally{globalThis.fetch=original;}
});

test("HTTP 400 stops before requesting all sources; no false zero-results success",async()=>{
 const original=globalThis.fetch;
 let called=0;
 globalThis.fetch=async()=>{called++;return new Response("bad search request",{status:400});};
 try{
  await assert.rejects(
   ()=>searchIndexedJobs("valid_fake_key_12345",["linkedin","indeed","naukri","wellfound","monster"],"DevOps","India",[],{depth:2,freshness:"any"}),
   /HTTP 400/
  );
  assert.ok(called<=2,"Expected preflight abort, calls made: "+called);
 }finally{globalThis.fetch=original;}
});

test("valid empty Serper response is different from provider error",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({organic:[]}),{status:200});
 try{
  const result=await searchIndexedJobs("valid_fake_key_12345",["linkedin"],"Data Analyst","India",[]);
  assert.equal(result.jobs.length,0);
  assert.equal(result.stats.successfulQueries,1);
  assert.equal(result.stats.failedQueries,0);
 }finally{globalThis.fetch=original;}
});

test("India company searches reject explicitly US-only remote locations",async()=>{
 const {fetchCompanyJobs}=await import("../lib/company-boards");
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({name:"Example",jobs:[
  {title:"Data Analyst",city:"Remote",country:"United States",shortlink:"https://apply.workable.com/j/US1"},
  {title:"Data Analyst",city:"Mumbai",country:"India",shortlink:"https://apply.workable.com/j/IN1"}
 ]}),{status:200,headers:{"Content-Type":"application/json"}});
 try{
  const result=await fetchCompanyJobs(["https://apply.workable.com/example"],"Data Analyst","India");
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].location,"Mumbai, India");
 }finally{globalThis.fetch=original;}
});
