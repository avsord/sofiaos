'use strict';
const {AppError}=require('./util');
const VERSION=62;
function authorize(plan,source='planner'){
  if(!plan||typeof plan!=='object')throw new AppError('AI_PLAN_INVALID','A IA não forneceu um plano semântico válido.',502);
  return {...plan,_semantic_authority:'ai',_semantic_version:VERSION,_semantic_source:String(source||'planner').slice(0,80)};
}
function derive(plan,patch={}){
  if(!isAuthorized(plan))throw new AppError('SEMANTIC_AUTHORITY_REQUIRED','O backend recusou uma ação sem autorização semântica da IA.',500);
  return {...plan,...patch,_semantic_authority:'ai',_semantic_version:VERSION,_semantic_source:plan._semantic_source||'derived-from-ai'};
}
function isAuthorized(plan){return Boolean(plan&&plan._semantic_authority==='ai'&&Number(plan._semantic_version)>=VERSION);}
function assertAuthorized(plan){if(!isAuthorized(plan))throw new AppError('SEMANTIC_AUTHORITY_REQUIRED','O backend recusou uma ação sem autorização semântica da IA.',500);return plan;}
module.exports={VERSION,authorize,derive,isAuthorized,assertAuthorized};
