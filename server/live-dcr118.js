'use strict';
const fs=require('fs');
const path=require('path');
const {query,tx}=require('./db');

function assert(ok,msg){if(!ok)throw new Error(msg)}
function read(name){return fs.readFileSync(path.join(__dirname,'..',name),'utf8')}

async function promoteDcr118(note){
 return tx(async c=>{
  const r118=await c.query("SELECT id,status,retest_result FROM dcr_items WHERE dcr_ref='DCR-118' FOR UPDATE");
  assert(r118.rowCount===1,'DCR-118 missing');
  const d118=r118.rows[0];
  const manualPassed=d118.status==='Completed'&&/Manual Retest PASS/i.test(String(d118.retest_result||''));
  const target118=manualPassed?'Completed':'Ready to Test';
  if(!manualPassed){
   await c.query(`UPDATE dcr_items SET status=$2,resolution=$3,retest_result=$4,deferred=false,updated_at=now() WHERE id=$1`,[
    d118.id,target118,
    'Minimum mobile layout correction deployed: existing My Day / Jobs / Sync / More navigation remains fixed and is reserved its own safe-area space; the Stage 6 DATABASE/API BACKED test indicator is positioned above it, does not intercept taps, and sits below modal actions. No Technician workflow redesign was introduced.',
    'Current deploy automated DCR-118 layout/regression checks passed. Jon phone retest required before DCR-117 manual UAT resumes.'
   ]);
   if(d118.status!==target118)await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[d118.id,d118.status,target118,note,'Stage 6 DCR-118 automated acceptance']);
  }

  const r117=await c.query("SELECT id,status,retest_result FROM dcr_items WHERE dcr_ref='DCR-117' FOR UPDATE");
  assert(r117.rowCount===1,'DCR-117 missing');
  const d117=r117.rows[0],manualCorrection=/Manual Test 1 Failed|Correction Required|blocked by Technician journey/i.test(String(d117.status||''))||/Manual Test 1 FAIL|blocked by DCR-121/i.test(String(d117.retest_result||''));
  if(manualCorrection)return{dcr118:target118,dcr117:d117.status,manualPassed,preservedDcr117Correction:true};
  const target117=manualPassed?'Ready to Test':'Ready to Test – Manual UAT Blocked by DCR-118';
  const retest117=manualPassed
   ?'Automated DCR-117 acceptance remains passed. Manual Smart Technician Close UAT may resume because DCR-118 manual phone retest passed.'
   :'DCR-117 automated acceptance remains passed, but Jon manual Smart Technician Close UAT remains blocked until DCR-118 phone retest passes.';
  await c.query(`UPDATE dcr_items SET status=$2,retest_result=$3,updated_at=now() WHERE id=$1`,[d117.id,target117,retest117]);
  if(d117.status!==target117)await c.query('INSERT INTO dcr_history(dcr_id,from_status,to_status,note,changed_by) VALUES($1,$2,$3,$4,$5)',[d117.id,d117.status,target117,manualPassed?'DCR-118 manual PASS preserved; DCR-117 manual UAT may resume.':'DCR-117 kept ready but manually blocked until Jon passes DCR-118 on a phone. It is not failed or completed.','Stage 6 UAT']);
  return{dcr118:target118,dcr117:target117,manualPassed,preservedDcr117Correction:false}
 })
}

async function runDcr118(core,final,evidence,dcr117){
 if((process.env.APP_ENV||'test')!=='stage6-test')return{skipped:true};
 const results=[];const check=(name,ok,detail='')=>{assert(ok,`${name}: ${detail||'failed'}`);results.push({name,ok:true,detail})};
 const html=read('technician.html'),baseCss=read('technician.css'),fixCss=read('technician-dcr118.css'),coreJs=read('technician-core.js');
 const primaryBefore=(await query("SELECT w.status,w.financial_status,w.version,w.updated_at FROM work_orders w WHERE w.legacy_ref='WO-10046'")).rows[0];
 assert(primaryBefore,'Primary manual UAT Work Order WO-10046 is missing');

 check('Existing Stage 6 core regression passed',core?.failed===0&&core?.total>=24,`${core?.passed||0}/${core?.total||0}`);
 check('Existing Stage 6 final regression passed',final?.failed===0&&final?.total>=42,`${final?.passed||0}/${final?.total||0}`);
 check('DCR-116 evidence regression passed',evidence?.failed===0&&evidence?.passed>=12,`${evidence?.passed||0}/${evidence?.passed||0}`);
 check('DCR-117 automated acceptance remains passed',dcr117?.failed===0&&dcr117?.passed>=15,`${dcr117?.passed||0}/${dcr117?.total||0}`);

 check('DCR-118 layout override is loaded after base Technician CSS',html.indexOf('technician-dcr118.css')>html.indexOf('technician.css'),'Technician override stylesheet order');
 check('My Day navigation remains present',html.includes('id="nav-home"')&&html.includes("mobileGo('home')"),'nav-home → home');
 check('Jobs navigation remains present and wired',html.includes('id="nav-jobs"')&&html.includes("mobileGo('jobs')"),'nav-jobs → jobs');
 check('Sync navigation remains present and wired',html.includes('id="nav-sync"')&&html.includes("mobileGo('sync')"),'nav-sync → sync');
 check('More navigation remains present and wired',html.includes('id="nav-more"')&&html.includes("mobileGo('more')"),'nav-more → more');
 check('Navigation handler still exists',/function\s+mobileGo\s*\(/.test(coreJs)||/mobileGo\s*=/.test(coreJs),'technician-core.js');

 check('Technician bottom navigation remains fixed',/\.bottom\{[^}]*position:fixed/.test(baseCss),'fixed navigation');
 check('Mobile safe-area is reserved',fixCss.includes('env(safe-area-inset-bottom'),'safe-area-inset-bottom');
 check('Stage 6 indicator is moved above navigation',/#stage6Banner\{[\s\S]*?bottom:calc\(62px \+ env\(safe-area-inset-bottom,0px\)\)!important/.test(fixCss),'banner above 62px navigation');
 check('Stage 6 indicator cannot intercept Technician taps',/#stage6Banner\{[\s\S]*?pointer-events:none!important/.test(fixCss),'pointer-events none');
 check('Modal layer remains above Stage 6 indicator',/\.modal\{[\s\S]*?z-index:100!important/.test(fixCss)&&/#stage6Banner\{[\s\S]*?z-index:40!important/.test(fixCss),'modal 100 > indicator 40');
 check('Long Technician content has reserved bottom space',/\.phone\{[\s\S]*?padding-bottom:calc\(108px \+ env\(safe-area-inset-bottom,0px\)\)!important/.test(fixCss),'content clearance for indicator + navigation');

 const primaryAfter=(await query("SELECT w.status,w.financial_status,w.version,w.updated_at FROM work_orders w WHERE w.legacy_ref='WO-10046'")).rows[0];
 check('WO-10046 was not altered by DCR-118 acceptance',JSON.stringify(primaryAfter)===JSON.stringify(primaryBefore),JSON.stringify(primaryAfter));
 const primaryMeta=(await query("SELECT value FROM system_meta WHERE key='primary_manual_uat_work_order'")).rows[0]?.value;
 check('Primary manual UAT record remains WO-10046 / AB26 CDE',primaryMeta?.workOrder==='WO-10046'&&primaryMeta?.registration==='AB26 CDE',JSON.stringify(primaryMeta));

 const note=`DCR-118 deployed automated regression PASS (${results.length} checks). Existing Technician navigation remains present and wired; safe-area/layout rules keep the Stage 6 indicator above the fixed navigation and below modal actions. WO-10046 / AB26 CDE was not altered.`;
 const statuses=await promoteDcr118(note);
 const result={passed:results.length,failed:0,total:results.length,dcr:'DCR-118',dcrStatus:statuses.dcr118,dcr117Status:statuses.dcr117,manualRetestPassed:statuses.manualPassed,preservedDcr117Correction:!!statuses.preservedDcr117Correction,primaryManualWorkOrder:'WO-10046',registration:'AB26 CDE',results,note};
 console.log(JSON.stringify({level:'info',event:'stage6_dcr118_acceptance_complete',...result}));
 return result
}

module.exports={runDcr118};
