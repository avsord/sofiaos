'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const defaults={'./system-notification-permission':{ensureSystemNotificationPermission:async()=>true}};
module.exports=function load(file,deps={},globals={}){const exports={},available={...defaults,...deps};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,require:name=>{if(!(name in available))throw Error('Unexpected dependency '+name);return available[name];},setTimeout,clearTimeout,Date,URL,console,Error,Promise,Set,Map,...globals});return exports;};
