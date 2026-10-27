'use strict';
// Arquivos da Sofia no site (0.3.244): mesma área oculta do Drive que o app mostra.
(function(){
  try{var pref=localStorage.getItem('sofiaTheme')||'system';if(pref==='light'||pref==='dark')document.documentElement.dataset.theme=pref;}catch(e){/* tema do sistema */}
  var $=function(id){return document.getElementById(id);};
  var state={summary:null,cat:'',page:'',token:'',items:[]};
  var INLINE=/^(image\/(png|jpeg|webp|gif)|application\/pdf|audio\/|video\/(mp4|webm))/;
  function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function size(b){b=Number(b)||0;var one=function(v,u){return (v>=100?String(Math.round(v)):v.toFixed(1).replace(/\.0$/,'').replace('.',','))+' '+u;};if(b<1024)return b+' B';if(b<1048576)return one(b/1024,'KB');if(b<1073741824)return one(b/1048576,'MB');if(b<1099511627776)return one(b/1073741824,'GB');return one(b/1099511627776,'TB');}
  function when(iso){if(!iso)return '';var d=new Date(iso);return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  async function api(url,opts){
    opts=opts||{};var r=await fetch(url,{method:opts.method||'GET',cache:'no-store',headers:Object.assign({},opts.body?{'Content-Type':'application/json'}:{},opts.method&&opts.method!=='GET'?{'X-Sofia-Token':state.token}:{}),body:opts.body?JSON.stringify(opts.body):undefined});
    if(r.status===401){location.href='/login';throw new Error('Entre de novo.');}
    var data=null;try{data=await r.json();}catch(e){/* sem corpo */}
    if(!r.ok)throw new Error((data&&data.error)||'Não consegui concluir ('+r.status+').');
    return data;
  }
  function skeleton(target,rows){target.replaceChildren();for(var i=0;i<rows;i++){var li=el('li','file');li.append(el('span','sk w60'),el('span','sk w40'));target.append(li);}}
  function notice(text,link,error){var n=$('notice');n.hidden=!text;n.className='notice'+(error?' error':'');n.replaceChildren();if(!text)return;n.append(document.createTextNode(text));if(link){n.append(document.createTextNode(' '));var a=el('a','',link.label);a.href=link.href;a.target='_blank';a.rel='noopener';n.append(a);}}
  function renderNotice(s){
    if(s.needs_reconnect)return notice('Seus arquivos ainda estão na pasta visível "Sofia OS". No app, abra Perfil → Conta Google e toque em Reconectar para levá-los à área oculta.');
    if(s.migration&&s.migration.state==='running')return notice('Levando seus arquivos para a área oculta: '+(s.migration.moved||0)+' já foram. Pode usar normalmente enquanto isso.');
    if(s.migration&&s.migration.left)return notice(s.migration.left+(s.migration.left===1?' arquivo não pôde ser levado e continua':' arquivos não puderam ser levados e continuam')+' na pasta "Sofia OS" do Drive.',null,true);
    if(s.wiped_at)return notice('Os dados ocultos da Sofia foram apagados nas configurações do Drive em '+when(s.wiped_at)+'. Páginas e backup foram enviados de novo.',null,true);
    notice('');
  }
  function renderUsage(s){
    var sofia=s.categories.reduce(function(n,c){return n+c.bytes;},0),q=s.quota;$('usage').hidden=false;
    var bar=$('usageBar');bar.replaceChildren();var legend=$('usageLegend');legend.replaceChildren();
    if(!q){$('usageText').textContent='Sofia: '+size(sofia);$('usageSofia').textContent='';return;}
    var used=q.usage||0,inDrive=Math.min(used,q.usage_in_drive||0),trash=Math.min(inDrive,q.usage_in_trash||0),mine=Math.min(sofia,Math.max(0,inDrive-trash)),total=q.limit||0;
    var parts=[['Sofia',mine,'p-sofia'],['Outros arquivos do Drive',Math.max(0,inDrive-trash-mine),'p-drive'],['Gmail e Google Fotos',Math.max(0,used-inDrive),'p-mail'],['Lixeira do Drive',trash,'p-trash']];
    $('usageText').textContent=size(used)+(total?' de '+size(total)+' usados':' usados · plano sem limite');
    $('usageSofia').textContent=total?size(Math.max(0,total-used))+' livres':'';
    parts.forEach(function(p){if(p[1]>0){var seg=el('span',p[2]);seg.style.width=Math.max(0.6,p[1]/(total||used||1)*100)+'%';bar.append(seg);}var li=el('li');li.append(el('i',p[2]),el('span','',p[0]),el('b','',size(p[1])));legend.append(li);});
    if(total){var li=el('li');li.append(el('i','p-free'),el('span','','Livre'),el('b','',size(Math.max(0,total-used))));legend.append(li);}
  }
  function renderCats(s){
    var nav=$('cats');nav.replaceChildren();
    s.categories.forEach(function(c){var b=el('button','cat');b.type='button';b.setAttribute('aria-current',String(c.key===state.cat));b.append(el('strong','',c.label),el('span','count',c.count+' · '+size(c.bytes)),el('small','',c.hint));b.onclick=function(){openCat(c.key);};nav.append(b);});
    var box=$('exportCats');if(!box.childElementCount)s.categories.forEach(function(c){var l=el('label');var i=el('input');i.type='checkbox';i.value=c.key;i.checked=c.key!=='Backups';l.append(i,document.createTextNode(c.label));box.append(l);});
  }
  function renderExport(s){
    var e=s.export,st=$('exportStatus'),btn=$('exportButton');st.replaceChildren();btn.disabled=!!(e&&e.state==='running');
    if(!e)return;
    if(e.state==='running'){st.textContent='Copiando: '+e.done+' de '+e.total+'…';setTimeout(refreshSummary,4000);return;}
    if(e.state==='error'){st.textContent='A cópia parou: '+e.error;return;}
    st.append(document.createTextNode('Última cópia: '+e.done+(e.done===1?' arquivo':' arquivos')+(e.failed?' ('+e.failed+' com erro)':'')+' em "'+e.folder_name+'". '));
    if(e.link){var a=el('a','','Abrir no Drive');a.href=e.link;a.target='_blank';a.rel='noopener';st.append(a);}
  }
  function fileRow(f){
    var li=el('li','file');li.append(el('span','file-name',f.name));
    li.append(el('span','file-meta',[f.origin,size(f.size),when(f.modified)].filter(Boolean).join(' · ')));
    var actions=el('span','file-actions'),url='/api/drive/files/'+encodeURIComponent(f.id)+'/content';
    if(INLINE.test(f.mime)){var o=el('a','link-button','Abrir');o.href=url+'?inline=1';o.target='_blank';o.rel='noopener';actions.append(o);}
    var d=el('a','link-button','Baixar');d.href=url;d.setAttribute('download',f.name);actions.append(d);
    if(f.deletable){var x=el('button','link-button danger','Apagar');x.type='button';x.onclick=function(){remove(f,li,x);};actions.append(x);}
    li.append(actions);return li;
  }
  async function remove(f,li,btn){
    if(!confirm('Apagar "'+f.name+'"?\n\nSai do Drive de vez (a área oculta não tem lixeira).'+(state.cat==='Backups'||state.cat==='Backup com senha'?' Os outros backups continuam.':' Onde ele aparecia na Sofia, fica um aviso de que foi apagado.')))return;
    btn.disabled=true;btn.textContent='Apagando…';
    try{await api('/api/drive/files/'+encodeURIComponent(f.id),{method:'DELETE',body:{}});state.items=state.items.filter(function(x){return x.id!==f.id;});li.remove();if(!state.items.length)$('fileList').append(el('li','empty','Nada aqui ainda.'));refreshSummary();}
    catch(e){btn.disabled=false;btn.textContent='Apagar';alert(e.message);}
  }
  function renderCleanup(){
    var key=state.cat==='Comprovantes'?'receipts_cleanup':state.cat==='Áudios'?'voices_cleanup':'';
    var box=$('cleanup');box.replaceChildren();box.hidden=!key||!state.summary||!state.summary[key];if(box.hidden)return;
    var rc=state.summary[key],l=el('label'),i=el('input');i.type='checkbox';i.checked=rc.enabled;
    l.append(i,document.createTextNode(' Apagar sozinho com mais de '+rc.days+' dias'));box.append(l);
    var keep=state.cat==='Áudios'?'A transcrição de cada áudio continua na conversa.':'A despesa lançada em Finanças e a miniatura na conversa continuam.';
    box.append(el('small','muted',(rc.last_at?'Última limpeza: '+when(rc.last_at)+(rc.last_removed?' · '+rc.last_removed+(rc.last_removed===1?' apagado':' apagados'):'')+'. ':'')+keep));
    var cat=state.cat;
    i.onchange=async function(){i.disabled=true;try{var r=await api('/api/drive/cleanup',{method:'POST',body:{cat:cat,enabled:i.checked}});state.summary[key]=r;renderCleanup();if(r.enabled)setTimeout(function(){refreshSummary().then(function(){openCat(cat);});},1500);}catch(e){i.checked=!i.checked;alert(e.message);}finally{i.disabled=false;}};
  }
  async function openCat(key,more){
    state.cat=key;if(!more){state.page='';state.items=[];}
    var c=state.summary.categories.find(function(x){return x.key===key;});
    $('catTitle').textContent=c.label;$('catHint').textContent=c.hint+(c.deletable===false?' Para apagar, apague a página em Páginas.':'');renderCats(state.summary);renderCleanup();
    var list=$('fileList');if(!more)skeleton(list,4);$('more').hidden=true;
    try{
      var r=await api('/api/drive/files?cat='+encodeURIComponent(key)+(state.page?'&page='+encodeURIComponent(state.page):''));
      if(state.cat!==key)return;state.items=state.items.concat(r.items);state.page=r.next_page||'';
      list.replaceChildren();if(!state.items.length){list.append(el('li','empty','Nada aqui ainda.'));}
      state.items.forEach(function(f){list.append(fileRow(f));});$('more').hidden=!state.page;
    }catch(e){list.replaceChildren(el('li','empty',e.message));}
  }
  async function refreshSummary(){
    try{var s=await api('/api/drive/files');state.summary=s;renderNotice(s);renderUsage(s);renderCats(s);renderExport(s);return s;}
    catch(e){notice(e.message,null,true);$('catTitle').textContent='Arquivos indisponíveis';$('fileList').replaceChildren();return null;}
  }
  async function start(){
    skeleton($('fileList'),5);
    try{var b=await api('/api/bootstrap');state.token=b.token||'';}catch(e){/* sem token: só leitura */}
    var s=await refreshSummary();if(!s)return;
    var first=s.categories.find(function(c){return c.count>0;})||s.categories[0];openCat(first.key);
  }
  $('more').onclick=function(){openCat(state.cat,true);};
  $('exportButton').onclick=async function(){
    var cats=[].slice.call(document.querySelectorAll('#exportCats input:checked')).map(function(i){return i.value;});
    if(!cats.length){$('exportStatus').textContent='Escolha pelo menos um tipo.';return;}
    this.disabled=true;$('exportStatus').textContent='Preparando a cópia…';
    try{await api('/api/drive/export',{method:'POST',body:{categories:cats}});await refreshSummary();}catch(e){$('exportStatus').textContent=e.message;this.disabled=false;}
  };
  start();
})();
