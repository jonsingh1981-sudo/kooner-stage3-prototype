'use strict';

// Temporary Stage 6 compatibility hotfix.
// The original prototype compatibility service contains one duplicated closing brace
// in the pricing-rule loop. Loading it normally prevents the Node service from
// starting. Patch only that exact source fragment while Stage 6 remains in build.
const fs=require('fs');
const Module=require('module');
const original=Module._extensions['.js'];

Module._extensions['.js']=function stage6CompatibilityCompile(mod,filename){
  if(filename.endsWith('/server/state.js')||filename.endsWith('\\server\\state.js')){
    let source=fs.readFileSync(filename,'utf8');
    const bad="json(p)])}}\n  }\n  for(const w of (state.wos||[])){";
    const good="json(p)])}\n  }\n  for(const w of (state.wos||[])){";
    if(!source.includes(bad))throw new Error('Stage 6 state hotfix target was not found; refuse to patch an unexpected source version.');
    source=source.replace(bad,good);
    mod._compile(source,filename);
    return;
  }
  return original(mod,filename);
};
