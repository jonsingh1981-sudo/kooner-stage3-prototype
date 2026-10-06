'use strict';
const crypto=require('crypto');
const {promisify}=require('util');
const scryptAsync=promisify(crypto.scrypt);

async function hashPassword(password){
  const salt=crypto.randomBytes(16);
  const derived=await scryptAsync(String(password),salt,64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}
async function verifyPassword(password,stored){
  try{
    const [kind,saltHex,hashHex]=String(stored||'').split('$');
    if(kind!=='scrypt'||!saltHex||!hashHex)return false;
    const derived=await scryptAsync(String(password),Buffer.from(saltHex,'hex'),64);
    return crypto.timingSafeEqual(Buffer.from(hashHex,'hex'),Buffer.from(derived));
  }catch{return false}
}
function randomToken(bytes=32){return crypto.randomBytes(bytes).toString('base64url')}
function sha256(v){return crypto.createHash('sha256').update(String(v)).digest('hex')}
function keyMaterial(){return crypto.createHash('sha256').update(process.env.MFA_ENCRYPTION_KEY||process.env.SESSION_SECRET||'development-only-stage6-key').digest()}
function encryptSecret(text){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',keyMaterial(),iv);
  const enc=Buffer.concat([cipher.update(String(text),'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}
function decryptSecret(blob){
  const [ivS,tagS,encS]=String(blob||'').split('.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',keyMaterial(),Buffer.from(ivS,'base64url'));
  decipher.setAuthTag(Buffer.from(tagS,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encS,'base64url')),decipher.final()]).toString('utf8');
}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf){let bits='',out='';for(const b of buf)bits+=b.toString(2).padStart(8,'0');for(let i=0;i<bits.length;i+=5){const c=bits.slice(i,i+5).padEnd(5,'0');out+=B32[parseInt(c,2)]}return out}
function base32Decode(s){let bits='';for(const c of String(s).replace(/=+$/,'').toUpperCase()){const i=B32.indexOf(c);if(i<0)continue;bits+=i.toString(2).padStart(5,'0')}const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(bytes)}
function hotp(secret,counter,digits=6){const key=base32Decode(secret),b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',key).update(b).digest();const off=h[h.length-1]&15;const n=(h.readUInt32BE(off)&0x7fffffff)%10**digits;return String(n).padStart(digits,'0')}
function verifyTotp(secret,code,windowSize=1){const step=Math.floor(Date.now()/1000/30);for(let w=-windowSize;w<=windowSize;w++)if(hotp(secret,step+w)===String(code).trim())return true;return false}
function newTotpSecret(){return base32Encode(crypto.randomBytes(20))}
module.exports={hashPassword,verifyPassword,randomToken,sha256,encryptSecret,decryptSecret,verifyTotp,newTotpSecret};
