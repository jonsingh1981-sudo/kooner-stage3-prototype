'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {hashPassword,verifyPassword,newTotpSecret,verifyTotp}=require('../security');
const {assertTransition}=require('../business');

function hotpForTest(secret){
 const crypto=require('crypto'),B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret){const i=B32.indexOf(c);bits+=i.toString(2).padStart(5,'0')}const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const key=Buffer.from(bytes),counter=Math.floor(Date.now()/1000/30),b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',key).update(b).digest(),off=h[h.length-1]&15,n=(h.readUInt32BE(off)&0x7fffffff)%1e6;return String(n).padStart(6,'0')
}

test('password hashing never stores plain password and verifies correctly',async()=>{const p='Stage6-test-value';const h=await hashPassword(p);assert.notEqual(h,p);assert.match(h,/^scrypt\$/);assert.equal(await verifyPassword(p,h),true);assert.equal(await verifyPassword(p+'x',h),false)});
test('TOTP foundation verifies current authenticator code',()=>{const secret=newTotpSecret(),code=hotpForTest(secret);assert.equal(verifyTotp(secret,code),true);assert.equal(verifyTotp(secret,'000000'),code==='000000')});
test('invalid Work Order status jump is rejected',()=>{assert.throws(()=>assertTransition('workOrder','Pending Triage','Operationally Complete'),/Invalid workOrder transition/)});
test('Attendance completion does not imply Work Order completion rule',()=>{assert.doesNotThrow(()=>assertTransition('attendance','In Progress','Completed'));assert.throws(()=>assertTransition('workOrder','Dispatched','Operationally Complete'))});
test('estimate terminal states cannot be directly re-approved',()=>{assert.throws(()=>assertTransition('estimate','Approved','Approved')?null:null);assert.throws(()=>assertTransition('estimate','Superseded','Approved'))});
test('billing cannot jump directly from Billing Review to Invoiced',()=>{assert.throws(()=>assertTransition('billing','Billing Review','Invoiced'));assert.doesNotThrow(()=>assertTransition('billing','Billing Review','Validated'))});
test('Emergency/VOR triage can return to Awaiting Operations Triage',()=>{assert.doesNotThrow(()=>assertTransition('portalRequest','In Review','Awaiting Operations Triage'))});
