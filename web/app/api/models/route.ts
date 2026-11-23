import { NextRequest, NextResponse } from "next/server";
export const runtime="nodejs";
export const maxDuration=20;
const fail=(message:string,status=400)=>NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:NextRequest){
 try {
 const origin=request.headers.get("origin"); if(origin && new URL(origin).host!==request.nextUrl.host) return fail("Invalid request origin",403);
 const input=await request.json() as {provider?:string;apiKey?:string};
 const key=String(input.apiKey||"").trim(), provider=String(input.provider||"");
 if(key.length<8 || key.length>4096 || !["OpenAI","Claude","Gemini"].includes(provider)) return fail("Choose a provider and enter its API key");
 let url:string,headers:Record<string,string>;
 if(provider==="OpenAI"){url="https://api.openai.com/v1/models";headers={Authorization:"Bearer "+key};}
 else if(provider==="Claude"){url="https://api.anthropic.com/v1/models?limit=100";headers={"x-api-key":key,"anthropic-version":"2023-06-01"};}
 else {url="https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";headers={"x-goog-api-key":key};}
 const response=await fetch(url,{headers,cache:"no-store",signal:AbortSignal.timeout(12000)});
 if(!response.ok) return fail(response.status===401||response.status===403?"API key rejected or unavailable":"Provider model lookup failed ("+response.status+")",response.status===429?429:400);
 const data=await response.json();
 type Listed={id?:string;name?:string;display_name?:string;displayName?:string;supportedGenerationMethods?:string[]};
 let models:{id:string;label:string}[]=[];
 if(provider==="Gemini")models=((data.models||[]) as Listed[]).filter(x=>(x.supportedGenerationMethods||[]).includes("generateContent"))
   .map(x=>({id:(x.name||"").replace(/^models\//,""),label:x.displayName||x.name||""}));
 else models=((data.data||[]) as Listed[]).filter(x=>provider==="Claude" || /^(gpt-|o[1-9]|chatgpt-)/i.test(x.id||""))
   .map(x=>({id:x.id||"",label:x.display_name||x.id||""}));
 models=models.filter(x=>x.id).sort((a,b)=>a.label.localeCompare(b.label));
 return NextResponse.json({models:models.slice(0,150)},{headers:{"Cache-Control":"no-store"}});
 }catch{return fail("Could not load models. Check the key and connection.");}
}
