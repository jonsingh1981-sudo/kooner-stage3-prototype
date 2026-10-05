/* Stage 4 bridge: keep Operations/Desktop and Technician Mobile in the same prototype/state. */
(function(){
  let top=document.querySelector('.top');
  if(top&&!document.getElementById('techMobileLink')){
    let a=document.createElement('a');a.id='techMobileLink';a.href='technician.html';a.target='_blank';a.className='btn';a.textContent='Technician Mobile';a.style.textDecoration='none';a.style.whiteSpace='nowrap';
    let newWo=[...top.querySelectorAll('button')].find(x=>x.textContent.includes('New Work Order'));if(newWo)top.insertBefore(a,newWo);else top.appendChild(a);
  }
  window.addEventListener('storage',e=>{if(e.key==='koonerv1'&&e.newValue){try{S=JSON.parse(e.newValue);if(typeof render==='function'&&current!=='__wo')render()}catch(err){console.warn('Stage 4 shared-state refresh failed',err)}}});
  if(new URLSearchParams(location.search).get('technicianInit')==='1')setTimeout(()=>location.replace('technician.html'),150);
})();
