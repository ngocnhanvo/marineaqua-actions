import { writeFile, mkdir } from "node:fs/promises";
const REPO="ngocnhanvo/marineaqua-actions";
const ASTRO="ngocnhanvo/marineaqua-astro";
const GH="https://api.github.com";
const WORKFLOW="marineaqua-production-deploy.yml";
const token=process.env.GH_TOKEN;
if(!token)throw Error("Missing GitHub workflow credential");
const report={triggeredAt:new Date().toISOString(),events:[],status:"STARTED"};
await mkdir("brand-release-evidence",{recursive:true});
const headers={
 Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
 "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"
};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function safe(method,path,body){
 for(let n=1;n<=4;n++){
  try{
   const response=await fetch(GH+path,{method,headers,
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
   if([429,502,503,504].includes(response.status)&&n<4){
    await sleep(n*1000);continue;
   }
   if(!response.ok()&&response.status!==204)
    throw Error("GitHub "+method+" "+path.split("?")[0]+" HTTP "+response.status);
   return response.status===204?null:response.json();
  }catch(error){
   if(n===4||!(/fetch failed|timeout|AbortError/i.test(String(error))))throw error;
   await sleep(n*1000);
  }
 }
}
const runList=()=>safe("GET","/repos/"+REPO+"/actions/workflows/"+WORKFLOW+"/runs?per_page=30");
const runInfo=id=>safe("GET","/repos/"+REPO+"/actions/runs/"+id);
try{
 const astroRef=await safe("GET","/repos/"+ASTRO+"/git/ref/heads/master");
 const expectedSHA=astroRef?.object?.sha;
 if(!/^[a-f0-9]{40}$/.test(expectedSHA||""))throw Error("Astro master source SHA unknown");
 report.expectedAstroSHA=expectedSHA;
 const previous=await runList();
 const priorIds=new Set(previous.workflow_runs.map(r=>r.id));
 const dispatchedAt=Date.now();
 await safe("POST","/repos/"+REPO+"/dispatches",{
  event_type:"wp_trigger_build",client_payload:{site_domain:"marine-aqua.io.vn"}
 });
 report.events.push({event:"BUILD_TRIGGER_ACCEPTED",time:new Date().toISOString()});
 console.log("MARINEAQUA_BUILD_TRIGGER_ACCEPTED expectedAstroSHA="+expectedSHA);
 let run=null;
 const discoverDeadline=Date.now()+5*60*1000;
 while(Date.now()<discoverDeadline){
  const list=await runList();
  const candidates=list.workflow_runs.filter(r=>
   !priorIds.has(r.id)&&r.event==="repository_dispatch"&&
   r.name==="Marine Aqua Astro deployment (WordPress Build Website only)"&&
   new Date(r.created_at).getTime()>=dispatchedAt-15000);
  if(candidates.length>1)throw Error("Multiple production runs after dispatch; cannot identify request uniquely");
  if(candidates.length===1){run=candidates[0];break}
  await sleep(12000);
 }
 if(!run)throw Error("Cannot locate unique production run for accepted dispatch");
 report.runId=run.id;report.url=run.html_url;
 console.log("MARINEAQUA_BUILD_RUN_LOCKED="+run.html_url);
 const buildDeadline=Date.now()+55*60*1000;
 while(Date.now()<buildDeadline){
  run=await runInfo(run.id);
  report.events.push({event:"BUILD_STATUS",status:run.status,conclusion:run.conclusion,
   time:new Date().toISOString()});
  console.log("MARINEAQUA_BUILD_STATUS="+run.status+" conclusion="+
   (run.conclusion||"pending")+" run="+run.id);
  if(run.status==="completed")break;
  await sleep(20000);
 }
 if(run?.status!=="completed")throw Error("Production build wait timed out run="+report.url);
 if(run.conclusion!=="success")throw Error("Production build "+run.conclusion+" run="+report.url);
 console.log("MARINEAQUA_BUILD_SUCCESS="+run.html_url);
 report.status="BUILD_SUCCESS";
 const readinessDeadline=Date.now()+120000;
 let ready=false,last="";
 while(Date.now()<readinessDeadline){
  try{
   const response=await fetch("https://marine-aqua.io.vn/marineaqua-staging-build.json",{
    headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(15000)});
   if(response.ok()){
    const value=await response.json();
    if(value.commit===expectedSHA&&value.branch==="master"&&value.target==="marine-aqua.io.vn"){
     ready=true;break;
    }
    last="Revision mismatch";
   }else last="HTTP "+response.status;
  }catch(e){last=String(e?.message||e).slice(0,120)}
  await sleep(10000);
 }
 if(!ready)throw Error("DEPLOY_READINESS_FAILED "+last+" expectedSHA="+expectedSHA);
 report.status="DEPLOY_READY";
 console.log("MARINEAQUA_DEPLOY_READY="+expectedSHA);
}catch(e){
 report.status="FAIL";
 report.error=String(e?.stack||e?.message||e).slice(0,800);
 console.error("MARINEAQUA_BRAND_RELEASE_FAIL="+report.error);
 process.exitCode=1;
}finally{
 await writeFile("brand-release-evidence/result.json",JSON.stringify(report,null,2)+"\n");
}
