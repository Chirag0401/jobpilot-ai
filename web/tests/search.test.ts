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
 assert.match(query,/Data Analyst/);
 assert.match(query,/Business Analyst/);
 assert.match(query,/Mumbai/);
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
test("Serper pagination returns relevant jobs without unrelated preset jobs",async()=>{
 const original=globalThis.fetch;
 let called=0;
 globalThis.fetch=async(_request,options)=>{
  called++;
  const payload=JSON.parse(String(options?.body||"{}")) as {q:string;page:number;num:number};
  assert.match(payload.q,/Data Analyst/);
  assert.equal(payload.num,20);
  return new Response(JSON.stringify({organic:[
   {title:"Data Analyst | Example",link:"https://www.linkedin.com/jobs/view/"+payload.page,
    snippet:"Data Analyst role in India"},
   {title:"DevOps Engineer | Other",link:"https://www.linkedin.com/jobs/view/8999",
    snippet:"AWS Terraform remote"}
  ]}),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try {
  const out=await searchIndexedJobs("test_serper_key_012345",["linkedin"],
   "Data Analyst","India",[],{depth:2,freshness:"month"});
  assert.equal(called,2);
  assert.equal(out.stats.queries,2);
  assert.equal(out.stats.inspected,4);
  assert.equal(out.jobs.length,2);
  assert.ok(out.jobs.every(j=>j.title.includes("Data Analyst")));
  assert.ok(out.jobs.every(j=>!j.postedAt));
 }finally{globalThis.fetch=original;}
});
