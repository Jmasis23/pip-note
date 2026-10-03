import {createClient} from "npm:@supabase/supabase-js@2";
import {arrangementRequest} from "../../../src/captureArrangement.ts";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"POST,OPTIONS"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return reply(405,{error:"POST only"});
 if(Deno.env.get("CAPTURE_JEV_ENABLED")!=="true")return reply(503,{error:"Capture suggestions are off"});
 const authorization=req.headers.get("authorization")??"";
 const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data,error}=await userClient.auth.getUser();if(error||!data.user)return reply(401,{error:"Sign in required"});
 if(Number(req.headers.get("content-length")??0)>100000)return reply(413,{error:"Capture too large"});
 let input;try{const raw=await req.text();if(raw.length>100000)return reply(413,{error:"Capture too large"});input=JSON.parse(raw);}catch{return reply(400,{error:"Invalid capture"});}
 if(typeof input.text!=="string"||!input.text.trim()||input.text.length>20000||!Array.isArray(input.folders)||input.folders.length>100||input.folders.some((f:unknown)=>typeof f!=="string"||(f as string).length>60))return reply(400,{error:"Invalid capture"});
 const key=Deno.env.get("TYPESAFE_API_KEY");if(!key)return reply(503,{error:"Suggestions unavailable"});
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const quota=await admin.rpc("consume_capture_arrangement",{account:data.user.id});
 if(quota.error)return reply(503,{error:"Suggestions unavailable"});if(quota.data!==true)return reply(429,{error:"Suggestion limit reached"});
 try{const response=await fetch("https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify(arrangementRequest(input)),signal:AbortSignal.timeout(1800)});if(!response.ok)return reply(502,{error:"Suggestions unavailable"});const j=await response.json();return reply(200,{answers:j.answers});}catch{return reply(504,{error:"Suggestions unavailable"});}
});
