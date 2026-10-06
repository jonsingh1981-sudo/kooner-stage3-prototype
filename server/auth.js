'use strict';
const {query}=require('./db');
const {sha256}=require('./security');

async function loadAuthUser(rawToken){
 if(!rawToken)return null;
 const tokenHash=sha256(rawToken);
 const r=await query(`
  SELECT u.id,u.legacy_ref,u.email,u.display_name,u.active,u.user_type,u.customer_id,u.mfa_required,
         s.id session_id,s.csrf_token,s.expires_at,s.revoked_at,
         COALESCE(array_agg(DISTINCT ro.code) FILTER (WHERE ro.code IS NOT NULL),'{}') roles,
         COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL),'{}') permissions
  FROM sessions s JOIN users u ON u.id=s.user_id
  LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles ro ON ro.id=ur.role_id
  LEFT JOIN role_permissions rp ON rp.role_id=ro.id LEFT JOIN permissions p ON p.id=rp.permission_id
  WHERE s.token_hash=$1
  GROUP BY u.id,s.id`,[tokenHash]);
 if(!r.rowCount)return null;
 const u=r.rows[0];
 if(!u.active||u.revoked_at||new Date(u.expires_at)<=new Date())return null;
 const scopes=await query(`SELECT scope_type,customer_id,site_id FROM user_scopes WHERE user_id=$1`,[u.id]);
 u.scopes=scopes.rows;
 return u;
}

async function authMiddleware(req,res,next){
 try{
  const raw=req.cookies?.kooner_session;
  req.user=await loadAuthUser(raw);
  if(req.user)await query('UPDATE sessions SET last_seen_at=now() WHERE id=$1',[req.user.session_id]);
  next();
 }catch(e){next(e)}
}

function requireAuth(req,res,next){if(!req.user)return res.status(401).json({error:'UNAUTHENTICATED',message:'Authentication required',requestId:req.id});next()}
function requirePermission(code){return (req,res,next)=>{if(!req.user)return res.status(401).json({error:'UNAUTHENTICATED',message:'Authentication required',requestId:req.id});if(req.user.permissions.includes('admin.*')||req.user.permissions.includes(code))return next();return res.status(403).json({error:'ACCESS_DENIED',message:'ACCESS DENIED / NOT AUTHORISED',requestId:req.id})}}
function requireAnyPermission(...codes){return (req,res,next)=>{if(!req.user)return res.status(401).json({error:'UNAUTHENTICATED',message:'Authentication required',requestId:req.id});if(req.user.permissions.includes('admin.*')||codes.some(c=>req.user.permissions.includes(c)))return next();return res.status(403).json({error:'ACCESS_DENIED',message:'ACCESS DENIED / NOT AUTHORISED',requestId:req.id})}}
function isInternal(user){return user?.user_type==='internal'}
function customerScopeIds(user){return new Set((user?.scopes||[]).filter(x=>x.customer_id).map(x=>String(x.customer_id)))}
function siteScopeIds(user){return new Set((user?.scopes||[]).filter(x=>x.site_id).map(x=>String(x.site_id)))}
function canAccessCustomer(user,customerId){if(isInternal(user))return true;if(!customerId)return false;return String(user.customer_id)===String(customerId)||customerScopeIds(user).has(String(customerId))}
function canAccessSite(user,customerId,siteId){if(isInternal(user))return true;if(!canAccessCustomer(user,customerId))return false;const sites=siteScopeIds(user);if(!sites.size)return false;return sites.has(String(siteId))}
function hasRole(user,code){return !!user?.roles?.includes(code)}
function roleLabel(user){return (user?.roles||[])[0]||'Unknown'}
function csrfRequired(req,res,next){
 if(!req.user)return res.status(401).json({error:'UNAUTHENTICATED',message:'Authentication required',requestId:req.id});
 const token=req.get('x-csrf-token');
 if(!token||token!==req.user.csrf_token)return res.status(403).json({error:'CSRF',message:'Security token missing or expired',requestId:req.id});
 next();
}
module.exports={loadAuthUser,authMiddleware,requireAuth,requirePermission,requireAnyPermission,isInternal,canAccessCustomer,canAccessSite,hasRole,roleLabel,csrfRequired};
