import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const FRONT='https://marine-aqua.io.vn';
const REPO='ngocnhanvo/marineaqua-actions';
const SOURCE_SHA='f243c2c650eb3261251de8f38a7d2ee3737b12e6';
const RELEASE_AT='2026-11-13T17:04:41Z';
const DIR='footer-agent-evidence';
const result={project:'marine-aqua.vn',test:'footer-agent-removal-live',source_branch:'master',
  source_sha:SOURCE_SHA,release_request_at:RELEASE_AT,production:{status:'NOT_TESTED'},
  browser:{status:'NOT_TESTED',checks:[]},failures:[],status:'STARTED'};

async function gh(path,asText=false){
  assert.ok(process.env.GITHUB_TOKEN,'Read-only GitHub API token is unavailable');
  const response=await fetch('https://api.github.com'+path,{
    headers:{'Authorization':'Bearer '+process.env.GITHUB_TOKEN,
      'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'Marine-Aqua-ReadOnly-QA'},
    signal:AbortSignal.timeout(25000)});
  assert.ok(response.ok,'GitHub read-only API HTTP '+response.status+' at '+path.split('?')[0]);
  return asText?response.text():response.json();
}

async function verifyProduction(){
  const cutoff=Date.parse(RELEASE_AT)-15000;
  let match=null;
  for(let attempt=0;attempt<21&&!match;attempt++){
    const body=await gh('/repos/'+REPO+'/actions/workflows/marineaqua-production-deploy.yml/runs?per_page=30');
    const candidates=(body.workflow_runs||[]).filter(r=>r.event==='repository_dispatch'&&Date.parse(r.created_at)>=cutoff);
    for(const run of candidates){
      const details=await gh('/repos/'+REPO+'/actions/runs/'+run.id+'/jobs?per_page=100');
      for(const job of (details.jobs||[])){
        if(job.status!=='completed')continue;
        const log=await gh('/repos/'+REPO+'/actions/jobs/'+job.id+'/logs',true);
        if(log.includes(SOURCE_SHA)){match={run,jobs:details.jobs,log};break;}
      }
      if(match)break;
    }
    if(!match&&attempt<20)await new Promise(resolve=>setTimeout(resolve,12000));
  }
  assert.ok(match,'Could not find deployment job logs for expected Astro master SHA');
  const {run,jobs,log}=match;
  result.production={status:'FAIL',run_id:run.id,url:run.html_url,attempt:run.run_attempt,
    conclusion:run.conclusion,job_count:jobs.length,
    provenance_sha_found:true,signed_activation:log.includes('SIGNED_UNZIP_SUCCESS')};
  assert.equal(run.status,'completed','Production deploy is not complete');
  assert.equal(run.conclusion,'success','Production deploy failed');
  assert.ok(jobs.length>0&&jobs.every(j=>j.conclusion==='success'),
    'A production deploy job was unsuccessful');
  assert.ok(log.includes('SIGNED_UNZIP_SUCCESS'),'Signed activation marker missing');
  result.production.status='PASS';
}

async function verifyBrowser(){
  const browser=await chromium.launch({headless:true});
  try{
    for(const view of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
      const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},serviceWorkers:'block'});
      const page=await ctx.newPage();
      const check={viewport:view.name,status:'STARTED'};
      result.browser.checks.push(check);
      try{
        await page.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())
          ?route.continue():route.abort('blockedbyclient'));
        const response=await page.goto(FRONT+'/',{waitUntil:'domcontentloaded',timeout:45000});
        assert.equal(response?.status(),200,'Homepage must return HTTP 200');
        const nav=page.locator('footer#footer-contact nav[aria-labelledby="footer-navigation-title"]');
        await nav.waitFor({state:'attached',timeout:30000});
        assert.equal(await page.locator('#marine-footer-agent').count(),0,'Removed footer Agent button still exists');
        assert.equal(await nav.getByText('Chat với Agent',{exact:true}).count(),0,'Footer still contains Agent label');
        const knowledge=nav.locator('a[data-marine-footer-link="knowledge"]');
        assert.equal(await knowledge.count(),1,'Tin kiến thức link is absent');
        const href=await knowledge.getAttribute('href');
        assert.match(href||'',/\/cat\/[a-z0-9-]+\/?(?:\?.*)?$/,'Knowledge article category URL is invalid');
        check.knowledge_href=href;
        const archive=await page.request.get(new URL(href,FRONT).href,{timeout:30000});
        assert.equal(archive.status(),200,'Knowledge archive is not HTTP 200');
        check.knowledge_status=archive.status();
        const launcher=page.locator('#ai-agent-btn');
        assert.equal(await launcher.count(),1,'Floating consultation launcher is missing');
        await launcher.click({timeout:12000});
        const aiEntry=page.locator('#marine-consult-ai');
        await aiEntry.waitFor({state:'visible',timeout:12000});
        await aiEntry.click({timeout:12000});
        await page.waitForFunction(()=>document.querySelector('#ai-chat-box')?.getAttribute('aria-hidden')==='false',
          null,{timeout:12000});
        check.agent_chat_opened=true;
        const w=await page.evaluate(()=>({document:document.documentElement.scrollWidth,
          viewport:document.documentElement.clientWidth}));
        assert.ok(w.document<=w.viewport+2,'Horizontal page overflow');
        check.width=w;
        await page.screenshot({path:DIR+'/'+view.name+'-footer-agent.png',fullPage:true,animations:'disabled'});
        check.status='PASS';
      }finally{await ctx.close();}
    }
    result.browser.status='PASS';
  }finally{await browser.close();}
}

await mkdir(DIR,{recursive:true});
try{
  try{await verifyProduction();}catch(e){result.failures.push('PRODUCTION: '+String(e.message||e));}
  try{await verifyBrowser();}catch(e){result.browser.status='FAIL';result.failures.push('BROWSER: '+String(e.message||e));}
  result.status=result.failures.length?'FAIL':'PASS';
  if(result.status!=='PASS')process.exitCode=1;
}finally{
  await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');
  console.log('MARINEAQUA_FOOTER_AGENT_QA='+JSON.stringify(result));
}
