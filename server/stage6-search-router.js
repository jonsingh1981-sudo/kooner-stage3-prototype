'use strict';

const express=require('express');
const cookieParser=require('cookie-parser');
const {query}=require('./db');
const {authMiddleware,requireAuth,requirePermission,isInternal,canAccessSite}=require('./auth');

const router=express.Router();
const auth=[cookieParser(),authMiddleware,requireAuth,requirePermission('search')];
function clean(v){return String(v||'').trim().slice(0,120)}
function siteAllowed(user,row){return isInternal(user)||canAccessSite(user,row.customer_id,row.site_id)}

router.get('/api/v1/search',...auth,async(req,res,next)=>{try{
  const q=clean(req.query.q);if(q.length<2)return res.json({items:[],limit:0});
  const like='%'+q+'%',items=[];
  async function add(sql,params,map){const r=await query(sql,params);for(const x of r.rows){if(siteAllowed(req.user,x))items.push(map(x))}}

  await add(`SELECT w.legacy_ref ref,w.fault_description label,w.customer_reference,c.name customer,s.name site,w.customer_id,w.site_id
    FROM work_orders w JOIN customers c ON c.id=w.customer_id JOIN sites s ON s.id=w.site_id
    WHERE w.archived_at IS NULL AND (w.legacy_ref ILIKE $1 OR COALESCE(w.customer_reference,'') ILIKE $1 OR w.fault_description ILIKE $1) LIMIT 20`,[like],x=>({type:'Work Order',ref:x.ref,label:x.label,customer:x.customer,site:x.site}));
  await add(`SELECT v.legacy_ref ref,v.registration||' • '||COALESCE(v.make,'')||' '||COALESCE(v.model,'') label,c.name customer,s.name site,v.customer_id,v.current_site_id site_id
    FROM vehicles v JOIN customers c ON c.id=v.customer_id LEFT JOIN sites s ON s.id=v.current_site_id
    WHERE v.archived_at IS NULL AND (v.registration ILIKE $1 OR COALESCE(v.unit_number,'') ILIKE $1 OR COALESCE(v.vin,'') ILIKE $1) LIMIT 20`,[like],x=>({type:'Vehicle',ref:x.ref,label:x.label,customer:x.customer,site:x.site}));

  if(isInternal(req.user)){
    const customers=await query(`SELECT legacy_ref ref,name label FROM customers WHERE archived_at IS NULL AND (name ILIKE $1 OR legacy_ref ILIKE $1 OR COALESCE(account_code,'') ILIKE $1) LIMIT 15`,[like]);
    items.push(...customers.rows.map(x=>({type:'Customer',ref:x.ref,label:x.label})));
    const sites=await query(`SELECT s.legacy_ref ref,s.name label,c.name customer,s.postcode,s.customer_id,s.id site_id FROM sites s JOIN customers c ON c.id=s.customer_id WHERE s.archived_at IS NULL AND (s.name ILIKE $1 OR s.legacy_ref ILIKE $1 OR COALESCE(s.postcode,'') ILIKE $1) LIMIT 15`,[like]);
    items.push(...sites.rows.map(x=>({type:'Site',ref:x.ref,label:`${x.label} • ${x.postcode||''}`,customer:x.customer})));
    const techs=await query(`SELECT legacy_ref ref,display_name label,role_name,base_region FROM technicians WHERE display_name ILIKE $1 OR legacy_ref ILIKE $1 OR COALESCE(assigned_van,'') ILIKE $1 LIMIT 15`,[like]);
    items.push(...techs.rows.map(x=>({type:'Technician',ref:x.ref,label:`${x.label} • ${x.role_name||''} • ${x.base_region||''}`})));
    const invoices=await query(`SELECT i.legacy_ref ref,'£'||i.gross::text||' • '||i.status label,c.name customer,i.customer_id,COALESCE(i.explicit_site_id,(SELECT COALESCE(il.site_id,w.site_id) FROM invoice_lines il LEFT JOIN work_orders w ON w.id=il.work_order_id WHERE il.invoice_id=i.id AND COALESCE(il.site_id,w.site_id) IS NOT NULL LIMIT 1)) site_id FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.legacy_ref ILIKE $1 OR COALESCE(i.customer_reference,'') ILIKE $1 LIMIT 15`,[like]);
    items.push(...invoices.rows.map(x=>({type:'Invoice',ref:x.ref,label:x.label,customer:x.customer})));
    const estimates=await query(`SELECT e.legacy_ref ref,e.status||' • v'||e.current_version_no label,c.name customer,s.name site,w.customer_id,w.site_id FROM estimates e JOIN work_orders w ON w.id=e.work_order_id JOIN customers c ON c.id=w.customer_id JOIN sites s ON s.id=w.site_id WHERE e.legacy_ref ILIKE $1 OR w.legacy_ref ILIKE $1 LIMIT 15`,[like]);
    items.push(...estimates.rows.map(x=>({type:'Estimate',ref:x.ref,label:x.label,customer:x.customer,site:x.site})));
  }else{
    const c=await query(`SELECT c.legacy_ref ref,c.name label,c.id customer_id,s.id site_id FROM customers c JOIN user_scopes us ON us.customer_id=c.id JOIN sites s ON s.id=us.site_id WHERE us.user_id=$2 AND (c.name ILIKE $1 OR c.legacy_ref ILIKE $1 OR COALESCE(c.account_code,'') ILIKE $1) LIMIT 1`,[like,req.user.id]);
    if(c.rowCount)items.push({type:'Customer',ref:c.rows[0].ref,label:c.rows[0].label});
    const sites=await query(`SELECT s.legacy_ref ref,s.name label,s.postcode,c.name customer,s.customer_id,s.id site_id FROM sites s JOIN customers c ON c.id=s.customer_id JOIN user_scopes us ON us.site_id=s.id WHERE us.user_id=$2 AND (s.name ILIKE $1 OR s.legacy_ref ILIKE $1 OR COALESCE(s.postcode,'') ILIKE $1) LIMIT 15`,[like,req.user.id]);
    items.push(...sites.rows.map(x=>({type:'Site',ref:x.ref,label:`${x.label} • ${x.postcode||''}`,customer:x.customer})));
    if(req.user.permissions.includes('portal.finance')){
      const invoices=await query(`SELECT i.legacy_ref ref,i.invoice_type,i.customer_id,i.explicit_site_id site_id,c.name customer FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.customer_id=$2 AND (i.legacy_ref ILIKE $1 OR COALESCE(i.customer_reference,'') ILIKE $1) LIMIT 15`,[like,req.user.customer_id]);
      for(const x of invoices.rows){if(req.user.permissions.includes('portal.finance.all_sites')||(x.site_id&&canAccessSite(req.user,x.customer_id,x.site_id)))items.push({type:'Invoice',ref:x.ref,label:x.invoice_type,customer:x.customer})}
    }
    if(req.user.permissions.includes('estimates.read')){
      await add(`SELECT e.legacy_ref ref,e.status||' • v'||e.current_version_no label,c.name customer,s.name site,w.customer_id,w.site_id FROM estimates e JOIN work_orders w ON w.id=e.work_order_id JOIN customers c ON c.id=w.customer_id JOIN sites s ON s.id=w.site_id WHERE w.customer_id=$2 AND (e.legacy_ref ILIKE $1 OR w.legacy_ref ILIKE $1) LIMIT 15`,[like,req.user.customer_id],x=>({type:'Estimate',ref:x.ref,label:x.label,customer:x.customer,site:x.site}));
    }
  }

  const seen=new Set(),unique=[];for(const x of items){const k=x.type+'|'+x.ref;if(!seen.has(k)){seen.add(k);unique.push(x)}}
  const limit=Math.min(Math.max(Number(req.query.limit)||30,1),100),offset=Math.max(Number(req.query.offset)||0,0);
  res.json({items:unique.slice(offset,offset+limit),total:unique.length,limit,offset,query:q});
}catch(e){next(e)}});

module.exports=router;
