'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {canAccessCustomer,canAccessSite,requirePermission,csrfRequired}=require('../auth');
const {assertTransition}=require('../business');

function customerUser(){return{user_type:'customer',customer_id:'CUST-1',scopes:[{customer_id:'CUST-1',site_id:'SITE-1'},{customer_id:'CUST-1',site_id:'SITE-2'}],permissions:['workorders.read'],csrf_token:'csrf-test'}}
function internalUser(){return{user_type:'internal',customer_id:null,scopes:[],permissions:['workorders.read']}}
function response(){return{statusCode:200,body:null,status(n){this.statusCode=n;return this},json(x){this.body=x;return this}}}

test('customer/site isolation helper fails closed outside site scope',()=>{const u=customerUser();assert.equal(canAccessCustomer(u,'CUST-1'),true);assert.equal(canAccessCustomer(u,'CUST-2'),false);assert.equal(canAccessSite(u,'CUST-1','SITE-1'),true);assert.equal(canAccessSite(u,'CUST-1','SITE-9'),false);assert.equal(canAccessSite({...u,scopes:[]},'CUST-1','SITE-1'),false)});
test('internal user scope helper permits internal operational access',()=>{const u=internalUser();assert.equal(canAccessCustomer(u,'ANY'),true);assert.equal(canAccessSite(u,'ANY','ANY'),true)});
test('permission middleware denies unauthenticated and missing permission',()=>{let r=response(),next=false;requirePermission('billing.write')({user:null,id:'r1'},r,()=>next=true);assert.equal(r.statusCode,401);assert.equal(next,false);r=response();next=false;requirePermission('billing.write')({user:customerUser(),id:'r2'},r,()=>next=true);assert.equal(r.statusCode,403);assert.equal(r.body.message,'ACCESS DENIED / NOT AUTHORISED');assert.equal(next,false)});
test('admin wildcard satisfies permission middleware',()=>{const req={user:{...internalUser(),permissions:['admin.*']},id:'r3'},r=response();let next=false;requirePermission('billing.write')(req,r,()=>next=true);assert.equal(next,true)});
test('CSRF write protection rejects absent token and accepts exact session token',()=>{let r=response(),next=false;csrfRequired({user:customerUser(),id:'r4',get:()=>undefined},r,()=>next=true);assert.equal(r.statusCode,403);assert.equal(next,false);r=response();next=false;csrfRequired({user:customerUser(),id:'r5',get:k=>k==='x-csrf-token'?'csrf-test':undefined},r,()=>next=true);assert.equal(next,true)});
test('Work Order cannot silently jump from triage to completed',()=>assert.throws(()=>assertTransition('workOrder','Pending Triage','Operationally Complete'),/Invalid workOrder transition/));
test('Attendance completion is independent of Work Order completion',()=>assert.doesNotThrow(()=>assertTransition('attendance','In Progress','Completed')));
test('Estimate terminal versions cannot be approved again',()=>{assert.throws(()=>assertTransition('estimate','Superseded','Approved'));assert.throws(()=>assertTransition('estimate','Cancelled','Approved'));assert.throws(()=>assertTransition('estimate','Declined','Approved'))});
test('Billing enforces review and validation sequence',()=>{assert.throws(()=>assertTransition('billing','Billing Review','Invoiced'));assert.doesNotThrow(()=>assertTransition('billing','Billing Review','Validated'));assert.doesNotThrow(()=>assertTransition('billing','Validated','Ready to Invoice'))});
test('Emergency/VOR review can return to Operations triage',()=>assert.doesNotThrow(()=>assertTransition('portalRequest','Emergency / VOR Reviewed','Awaiting Operations Triage')));
