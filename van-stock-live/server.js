const express=require('express');
const {createClient}=require('redis');
const path=require('path');
const app=express();
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));

const KEY='kooner:vanstock:state:v2';
let redis=null, memory=null;
const opening=[
['Rear lamp','',1,'each'],['Front pads - set A','',3,'set'],['Rear pads - set A','',5,'set'],['Front discs','',2,'each'],['Rear discs','',4,'each'],['O/S caliper','RCA603N',2,'each'],['Front N/S caliper','LCA603N',2,'each'],['O/S ball joint','',1,'each'],['N/S ball joint','',1,'each'],['O/S caliper - unidentified','',1,'each'],['N/S caliper - unidentified','',1,'each'],['Front pads - set B','',10,'set'],['Rear pads - set B','',9,'set'],['Brake discs','82 00 688 880 / Brembo 09.E18.10',4,'each'],['DOT 4 brake fluid','DOT 4',5,'litre'],['GL5 75W/90','GL5 75W/90',20,'litre'],['Screenwash','',20,'litre'],['Ceramic 5W30 oil','5W30',40,'litre'],['C3 Mid SAPS 5W30 oil','5W30 C3',10,'litre'],['Air filters','',5,'each'],['Fuel filters','',5,'each'],['Oil filter','',1,'each'],['Servo plugs - orange','',70,'each'],['Brake pad sensors','44 06 741 68R',12,'each'],['Harness brake pad sensors','',4,'each'],['Part','44 06 700 01R',2,'each'],['Part','41 06 800 01R',2,'each'],['Crankshaft pulley','',1,'each'],['Alternators','',2,'each'],['Power steering pump','',1,'each'],['Wheel speed sensors','',2,'each'],['Brake caliper slider kit','',1,'each'],['Handbrake cables','CABA80',4,'each'],['Gear shift cables','',1,'each'],['Window switches','254114738R',2,'each'],['Pipe','22 32 001 55R',1,'each'],['DPF pressure sensor','',1,'each'],['Exhaust bracket and clamp','',1,'each'],['Intercooler hose','7426095674',1,'each'],['DPF','VXG15IT',1,'each'],['Roadbelt tensioners','',2,'each'],['820EN battery','820EN',1,'each']
];
function seed(){
 const products=opening.map((x,i)=>({id:'P'+String(i+1).padStart(3,'0'),name:x[0],partNo:x[1],manufacturer:x[1].includes('Brembo')?'Brembo':'',category:'',barcode:'',unit:x[3],packSize:1,applications:[],stock:{AB26CDE:x[2],'KOONER-WEDNESBURY-VMU':0}}));
 return {version:2,users:[{employeeId:'BJS006503',name:'Jon Singh',role:'Dispatch & Operations Manager',assignedLocation:'AB26CDE',active:true}],locations:[{code:'AB26CDE',name:'Test Van - AB26CDE',type:'van',vehicleReg:'AB26CDE'},{code:'KOONER-WEDNESBURY-VMU',name:'Kooner Wednesbury VMU',type:'stores',vehicleReg:''}],products,movements:[],stocktakes:[],updatedAt:new Date().toISOString()};
}
async function load(){
 if(redis){try{const s=await redis.get(KEY);if(s)return JSON.parse(s)}catch(e){console.error('Redis read failed',e.message)}}
 if(!memory) memory=seed(); return JSON.parse(JSON.stringify(memory));
}
async function save(s){s.updatedAt=new Date().toISOString();memory=s;if(redis){try{await redis.set(KEY,JSON.stringify(s))}catch(e){console.error('Redis write failed',e.message)}}return s}
async function mutate(fn){const s=await load();const out=fn(s)||s;await save(s);return out}
function findUser(s,id){return s.users.find(u=>u.active!==false&&String(u.employeeId).toUpperCase()===String(id||'').trim().toUpperCase())}
function findLoc(s,c){return s.locations.find(l=>l.code===c)}
function findProd(s,id){return s.products.find(p=>p.id===id)}
function nextId(prefix,arr){let max=0;for(const x of arr){const n=parseInt(String(x.id||'').replace(/\D/g,''));if(Number.isFinite(n))max=Math.max(max,n)}return prefix+String(max+1).padStart(3,'0')}

app.get('/api/health',async(req,res)=>res.json({ok:true,redis:!!redis,time:new Date().toISOString()}));
app.post('/api/login',async(req,res)=>{const s=await load();const u=findUser(s,req.body.employeeId);if(!u)return res.status(404).json({error:'Employee ID not recognised'});res.json({user:u,locations:s.locations})});
app.get('/api/bootstrap',async(req,res)=>{const s=await load();const u=findUser(s,req.query.employeeId)||null;res.json({user:u,locations:s.locations,products:s.products,movements:s.movements.slice(0,100),stocktakes:s.stocktakes.slice(0,20),updatedAt:s.updatedAt})});
app.get('/api/history',async(req,res)=>{const s=await load();res.json(s.movements.slice(0,Number(req.query.limit||200)))});
app.post('/api/movements',async(req,res)=>{
 try{let result;await mutate(s=>{const {employeeId,type,productId,qty,fromLocation,toLocation,reason,reference}=req.body;const u=findUser(s,employeeId),p=findProd(s,productId),q=Number(qty);if(!u)throw Error('Unknown employee');if(!p)throw Error('Unknown product');if(!(q>0))throw Error('Quantity must be greater than zero');
   const ensure=c=>{if(c&&!findLoc(s,c))throw Error('Unknown location '+c)};ensure(fromLocation);ensure(toLocation);p.stock=p.stock||{};const from=fromLocation||null,to=toLocation||null;if(from&&Number(p.stock[from]||0)<q)throw Error('Not enough stock at '+from);if(from)p.stock[from]=Number(p.stock[from]||0)-q;if(to)p.stock[to]=Number(p.stock[to]||0)+q;
   const m={id:'M'+Date.now()+Math.random().toString(16).slice(2,6),when:new Date().toISOString(),employeeId:u.employeeId,user:u.name,type:String(type||'MOVE').toUpperCase(),productId:p.id,product:p.name,partNo:p.partNo||'',qty:q,unit:p.unit,fromLocation:from,toLocation:to,reason:reason||'',reference:reference||''};s.movements.unshift(m);s.movements=s.movements.slice(0,5000);result={movement:m,product:p};});res.json(result)}catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/products',async(req,res)=>{try{let created;await mutate(s=>{const b=req.body||{};if(!String(b.name||'').trim())throw Error('Description is required');if(b.barcode&&s.products.some(p=>p.barcode===b.barcode))throw Error('Barcode already registered');created={id:nextId('P',s.products),name:String(b.name).trim(),category:String(b.category||''),manufacturer:String(b.manufacturer||''),partNo:String(b.partNo||''),barcode:String(b.barcode||''),unit:String(b.unit||'each'),packSize:Number(b.packSize||1),applications:Array.isArray(b.applications)?b.applications:[],stock:{}};for(const l of s.locations)created.stock[l.code]=0;s.products.push(created)});res.json(created)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/users',async(req,res)=>{try{let created;await mutate(s=>{const b=req.body||{},id=String(b.employeeId||'').trim().toUpperCase();if(!id||!b.name)throw Error('Employee ID and name are required');if(s.users.some(u=>u.employeeId===id))throw Error('Employee already exists');if(b.assignedLocation&&!findLoc(s,b.assignedLocation))throw Error('Unknown assigned location');created={employeeId:id,name:String(b.name).trim(),role:String(b.role||'Technician'),assignedLocation:String(b.assignedLocation||''),active:true};s.users.push(created)});res.json(created)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/locations',async(req,res)=>{try{let created;await mutate(s=>{const b=req.body||{},code=String(b.code||'').trim().toUpperCase().replace(/\s+/g,'-');if(!code||!b.name)throw Error('Location code and name are required');if(findLoc(s,code))throw Error('Location already exists');created={code,name:String(b.name).trim(),type:String(b.type||'van'),vehicleReg:String(b.vehicleReg||'').toUpperCase()};s.locations.push(created);for(const p of s.products){p.stock=p.stock||{};p.stock[code]=0}});res.json(created)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/stocktake',async(req,res)=>{try{let result;await mutate(s=>{const b=req.body||{},u=findUser(s,b.employeeId),l=findLoc(s,b.locationCode);if(!u)throw Error('Unknown employee');if(!l)throw Error('Unknown location');const vars=[];for(const c of b.counts||[]){const p=findProd(s,c.productId);if(!p)continue;const actual=Number(c.actualQty),expected=Number((p.stock||{})[l.code]||0);if(!Number.isFinite(actual)||actual<0)continue;if(actual!==expected){p.stock[l.code]=actual;const diff=actual-expected;vars.push({productId:p.id,product:p.name,expected,actual,difference:diff});s.movements.unshift({id:'M'+Date.now()+Math.random().toString(16).slice(2,6),when:new Date().toISOString(),employeeId:u.employeeId,user:u.name,type:'ADJUST',productId:p.id,product:p.name,partNo:p.partNo||'',qty:Math.abs(diff),unit:p.unit,fromLocation:diff<0?l.code:null,toLocation:diff>0?l.code:null,reason:'Stocktake variance',reference:'Stocktake'})}}
 const st={id:'ST'+Date.now(),when:new Date().toISOString(),employeeId:u.employeeId,user:u.name,locationCode:l.code,variances:vars};s.stocktakes.unshift(st);result=st});res.json(result)}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/reset',async(req,res)=>{memory=seed();await save(memory);res.json({ok:true})});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

async function start(){
 const url=process.env.REDIS_URL;
 if(url){try{redis=createClient({url});redis.on('error',e=>console.error('Redis',e.message));await redis.connect();console.log('Redis connected');const existing=await redis.get(KEY);if(!existing)await redis.set(KEY,JSON.stringify(seed()));}catch(e){console.error('Redis unavailable; using memory',e.message);redis=null}}
 app.listen(process.env.PORT||3000,()=>console.log('Kooner Van Stock V2 running'));
}
start();
