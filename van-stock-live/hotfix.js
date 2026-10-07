const fs = require('fs');
const path = require('path');
const express = require('express');

// Kooner Van Stock V2 enhancements.
// Injects mobile-safe van QR rendering, new-product stock-in workflow,
// and Initial Van Load mode without replacing the proven core app.
const originalStatic = express.static;

express.static = function patchedStatic(root, options) {
  const staticMiddleware = originalStatic(root, options);

  return function koonerStatic(req, res, next) {
    if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
      try {
        let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        const fix = String.raw`<script>
(function(){
  window.kvsLoadCount = window.kvsLoadCount || 0;

  // Reliable mobile QR rendering.
  window.locationqr = function(){
    const l = loc(activeLocation);
    const payload = (l && l.type === 'van' ? 'VAN:' : 'LOC:') + activeLocation;
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=' + encodeURIComponent(payload);
    return head('Location QR', true) +
      '<div class="content"><div class="card" style="text-align:center">' +
      '<h2>' + esc((l && l.name) || activeLocation) + '</h2>' +
      '<div style="background:#fff;border:1px solid #e5e1ed;border-radius:16px;padding:18px;display:inline-block">' +
      '<img src="' + qrUrl + '" alt="Location QR code" style="display:block;width:min(72vw,320px);height:auto">' +
      '</div>' +
      '<p style="margin-top:14px"><b>' + esc(payload) + '</b></p>' +
      '<p class="tiny muted">Print this as a durable Kooner van/location label. Scan it using Scan Location or during a stock transfer.</p>' +
      '<button class="btn full" onclick="window.print()">Print QR label</button>' +
      '</div></div>';
  };
  window.QRcodeDraw = function(){};

  // Add Initial Van Load to the Home screen.
  const originalHome = window.home;
  window.home = function(){
    let html = originalHome();
    const marker = '</div><div class="card" style="margin-top:12px">';
    const button = '<button class="action" onclick="go(\'initialload\')"><span class="ico">🚐</span><b>Initial Van Load</b><small>Rapidly load existing stock</small></button>';
    if (html.includes(marker)) html = html.replace(marker, button + marker);
    return html;
  };

  // Extend the app renderer with Initial Van Load.
  const originalRender = window.render;
  window.render = function(v,arg){
    if(v === 'initialload') return window.initialload();
    return originalRender(v,arg);
  };

  window.initialload = function(){
    const l = loc(activeLocation);
    const opts = [...state.products].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>
      '<option value="'+esc(p.id)+'">'+esc(p.name)+(p.partNo?' · '+esc(p.partNo):'')+' (current '+esc(qtyText(p))+')</option>'
    ).join('');
    return head('Initial Van Load', true) +
      '<div class="content">' +
      '<div class="card hero"><h2>Load existing van stock</h2>' +
      '<div class="location">Loading into: '+esc((l&&l.name)||activeLocation)+'</div>' +
      '<p class="muted" style="margin-top:10px">Scan each part, enter how many are physically on the van, save, then scan the next item.</p>' +
      '<p><span class="pill">'+window.kvsLoadCount+' item(s) added this session</span></p></div>' +
      '<div class="card"><button class="btn full green" onclick="initialScan()">📷 Scan next product</button>' +
      '<label>Or select an existing product</label><select id="ilProduct">'+opts+'</select>' +
      '<label>Quantity to add</label><input id="ilQty" type="number" value="1" min="0.01" step="0.01">' +
      '<button class="btn full" style="margin-top:12px" onclick="addSelectedInitial()">Add selected product</button></div>' +
      '<div class="card"><div class="name">How this works</div><div class="meta">Every quantity added creates an auditable Stock In movement marked Initial Van Load. Existing stock is never silently overwritten.</div></div>' +
      '</div>';
  };

  window.initialScan = function(){
    openScanner('Scan stock item', code=>{
      const p = state.products.find(x=>x.barcode===code || norm(x.partNo)===norm(code));
      if(p) return initialKnownQty(p);
      newProduct(code, true);
    });
  };

  window.initialKnownQty = function(p){
    const m=document.createElement('div');
    m.className='modal';
    m.innerHTML='<div class="sheet"><div class="row space"><h2>Add to van stock</h2><button class="btn light" id="ilClose">Close</button></div>'+
      '<div class="notice"><b>'+esc(p.name)+'</b>'+(p.partNo?'<br>'+esc(p.partNo):'')+'<br>Current: '+esc(qtyText(p))+'</div>'+
      '<label>Quantity physically on van to add</label><input id="ilScanQty" type="number" value="1" min="0.01" step="0.01">'+
      '<button class="btn full green" style="margin-top:12px" id="ilSave">Add stock & scan next</button></div>';
    document.body.appendChild(m);
    m.querySelector('#ilClose').onclick=()=>m.remove();
    m.querySelector('#ilSave').onclick=async()=>{
      const q=Number(m.querySelector('#ilScanQty').value);
      if(!(q>0)) return toast('Enter a valid quantity');
      try{
        await api('/api/movements',{method:'POST',body:JSON.stringify({employeeId:state.user.employeeId,type:'IN',productId:p.id,qty:q,fromLocation:null,toLocation:activeLocation,reason:'Initial Van Load',reference:'Initial van load'})});
        m.remove(); window.kvsLoadCount++; await refresh(); toast(p.name+' added'); go('initialload');
      }catch(e){toast(e.message)}
    };
  };

  window.addSelectedInitial = async function(){
    const p=state.products.find(x=>x.id===document.querySelector('#ilProduct').value);
    const q=Number(document.querySelector('#ilQty').value);
    if(!p || !(q>0)) return toast('Choose a product and valid quantity');
    try{
      await api('/api/movements',{method:'POST',body:JSON.stringify({employeeId:state.user.employeeId,type:'IN',productId:p.id,qty:q,fromLocation:null,toLocation:activeLocation,reason:'Initial Van Load',reference:'Initial van load'})});
      window.kvsLoadCount++; await refresh(); toast(p.name+' added'); go('initialload');
    }catch(e){toast(e.message)}
  };

  // New product workflow: save catalogue only OR save and immediately stock it into the active van/location.
  window.newProduct = function(barcode, initialLoad){
    const m=document.createElement('div');
    m.className='modal';
    const l=loc(activeLocation);
    m.innerHTML='<div class="sheet"><div class="row space"><h2>New product</h2><button class="btn light" id="npClose">Close</button></div>'+
      (barcode?'<div class="notice">Unknown barcode: <b>'+esc(barcode)+'</b></div>':'')+
      '<label>Description</label><input id="nName">'+
      '<label>Category</label><input id="nCat" placeholder="e.g. Brake Pads">'+
      '<label>Manufacturer</label><input id="nMan" placeholder="e.g. Brembo">'+
      '<label>Manufacturer / supplier part number</label><input id="nPart">'+
      '<label>Unit</label><select id="nUnit"><option>each</option><option>set</option><option>litre</option></select>'+
      '<label>Vehicle manufacturer / model applications (optional)</label><input id="nApp" placeholder="e.g. Renault Master, Nissan Interstar">'+
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5e1ed">'+
      '<div class="name">Add stock now</div><div class="meta">Location: '+esc((l&&l.name)||activeLocation)+'</div>'+
      '<label>Quantity</label><input id="nQty" type="number" value="1" min="0.01" step="0.01"></div>'+
      '<div class="grid" style="margin-top:12px"><button class="btn light full" id="saveOnly">Save Product Only</button><button class="btn green full" id="saveStock">Save & Add Stock</button></div></div>';
    document.body.appendChild(m);
    m.querySelector('#npClose').onclick=()=>m.remove();

    async function create(addStock){
      const name=m.querySelector('#nName').value.trim();
      if(!name) return toast('Description is required');
      const qty=Number(m.querySelector('#nQty').value);
      if(addStock && !(qty>0)) return toast('Enter a valid stock quantity');
      try{
        const created=await api('/api/products',{method:'POST',body:JSON.stringify({name,category:m.querySelector('#nCat').value,manufacturer:m.querySelector('#nMan').value,partNo:m.querySelector('#nPart').value,barcode:barcode||'',unit:m.querySelector('#nUnit').value,applications:m.querySelector('#nApp').value.split(',').map(x=>x.trim()).filter(Boolean)})});
        if(addStock){
          await api('/api/movements',{method:'POST',body:JSON.stringify({employeeId:state.user.employeeId,type:'IN',productId:created.id,qty,fromLocation:null,toLocation:activeLocation,reason:initialLoad?'Initial Van Load':'New Product Stock In',reference:barcode?'Barcode registration':'Product registration'})});
        }
        m.remove();
        if(addStock && initialLoad) window.kvsLoadCount++;
        await refresh();
        toast(addStock ? 'Product created and stock added' : 'Product created with zero stock');
        if(initialLoad) go('initialload'); else if(view==='admin') go('admin'); else go('stock');
      }catch(e){toast(e.message)}
    }
    m.querySelector('#saveOnly').onclick=()=>create(false);
    m.querySelector('#saveStock').onclick=()=>create(true);
  };

  // Refresh the visible Home screen so the new Initial Van Load button appears immediately.
  try { if (state && state.user && view === 'home') go('home'); } catch(e) {}
})();
</script>`;
        html = html.replace('</body>', fix + '</body>');
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.type('html').send(html);
      } catch (err) {
        console.error('Van Stock enhancement injection failed:', err.message);
      }
    }

    return staticMiddleware(req, res, next);
  };
};
