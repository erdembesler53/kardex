(function(){
var CFG=window.KARDEX_CONFIG||{};
var LSU='kardex-depo-ui-v2',CACHE='kardex-depo-cache-v1';
var DEF={shelves:20,cab:{A:{name:'Sol',desc:'Atölye malzemeleri',rows:8,depth:2,kind:'koli'},B:{name:'Sağ',desc:'Onaylı ürünler',rows:8,depth:2,kind:'kasa'}}};
function normCfg(c){var d=JSON.parse(JSON.stringify(DEF));if(!c)return d;d.shelves=c.shelves||d.shelves;['A','B'].forEach(function(k){if(c.cab&&c.cab[k])for(var x in c.cab[k])d.cab[k][x]=c.cab[k][x]});return d}
var S={cfg:normCfg(),boxes:{}};
var CABS=['A','B'];
var ui={c:'A',cur:{A:1,B:1},view:'k',hl:null,col:null,last:''};
try{var u=JSON.parse(localStorage.getItem(LSU)||'null');if(u){ui.c=u.c==='B'?'B':'A';if(u.cur)ui.cur={A:u.cur.A||1,B:u.cur.B||1};ui.view=u.view||'k';ui.hl=u.hl||null}}catch(e){}
var sb=null,user=null,online=true,loaded=false,busy=0,rt='',lastErr='',timer=null,anim=null;

function $(s){return document.querySelector(s)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pad(n){return String(n).padStart(2,'0')}
function N(){return S.cfg.shelves}
function wrap(s){var n=N();return ((s-1)%n+n)%n+1}
function code(c,s,r,d){return c+'-'+pad(s)+'-'+pad(r)+'-'+pad(d)}
function cab(c){return S.cfg.cab[c]||{name:'',desc:''}}
function RW(c){return cab(c).rows||8}function DP(c){return cab(c).depth||1}
function siraName(d,c){var D=DP(c||ui.c);if(D===1)return 'tek sıra';if(d===1)return 'ön';if(d===D)return 'arka';return 'orta'}
/* Tam ya da kısmi adres: B · B-01 · B-01-05 · B-01-05-01 */
function parseAddr(t){
  var r=/^\s*([abAB])(?:\s*[-\s.]?\s*(\d{1,2})(?:\s*[-\s.]\s*(\d{1,2})(?:\s*[-\s.]\s*(\d{1,2}))?)?)?\s*$/.exec(t||'');
  if(!r)r=/^\s*([abAB])\s*(\d{2})(\d{2})?(\d{2})?\s*$/.exec(t||'');
  if(!r)return null;
  var c=r[1].toUpperCase(),s=r[2]?+r[2]:null,ro=r[3]?+r[3]:null,d=r[4]?+r[4]:null,C=S.cfg;
  if(s!==null&&(s<1||s>C.shelves))return null;
  if(ro!==null&&(ro<1||ro>RW(c)))return null;
  if(d!==null&&(d<1||d>DP(c)))return null;
  return {c:c,s:s,r:ro,d:d,full:d!==null,code:d!==null?code(c,s,ro,d):null};
}
function parseCode(t){var p=parseAddr(t);return p&&p.full?p:null}
var TRM={'Ş':'S','Ç':'C','Ğ':'G','İ':'I','Ö':'O','Ü':'U','Â':'A','Î':'I','Û':'U'};
function norm(t){return String(t||'').toLocaleUpperCase('tr').replace(/[ŞÇĞİÖÜÂÎÛ]/g,function(c){return TRM[c]}).replace(/[^A-Z0-9]+/g,' ').trim()}
function filled(k){var d=S.boxes[k];return !!(d&&((d.items&&d.items.length)||d.note||d.qty||d.cust||d.appr))}
function shelfFill(c,s){var n=0;for(var r=1;r<=RW(c);r++)for(var d=1;d<=DP(c);d++)if(filled(code(c,s,r,d)))n++;return n}
function sortKeys(a){return a.sort(function(x,y){return x.localeCompare(y,'tr',{numeric:true})})}
function toast(t){var el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('on')},2400)}
function saveUi(){try{localStorage.setItem(LSU,JSON.stringify({c:ui.c,cur:ui.cur,view:ui.view,hl:ui.hl}))}catch(e){}}
function fmtDate(s){if(!s)return '';var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return m?m[3]+'.'+m[2]+'.'+m[1]:s}
function describe(p){return 'Dolap '+p.c+' ('+esc(cab(p.c).name)+' · '+esc(cab(p.c).desc)+')'+(p.s?' · Raf '+pad(p.s):'')+(p.r?' · Satır '+pad(p.r):'')+(p.d?' · Sıra '+pad(p.d)+' ('+siraName(p.d,p.c)+')':'')}

/* ---------- Supabase ---------- */
var TB='kardex_kutular';
function toRow(k,o){var x=k.split('-');return {adres:k,dolap:x[0],raf:+x[1],satir:+x[2],sira:+x[3],icerik:o.items||[],miktar:o.qty||null,musteri:o.cust||null,onay_tarihi:o.appr||null,notlar:o.note||null,guncelleyen:user&&user.email,guncelleme:new Date().toISOString()}}
function fromRow(r){var o={items:r.icerik||[]};if(r.miktar)o.qty=r.miktar;if(r.musteri)o.cust=r.musteri;if(r.onay_tarihi)o.appr=r.onay_tarihi;if(r.notlar)o.note=r.notlar;if(r.guncelleyen)o.by=r.guncelleyen;if(r.guncelleme)o.at=r.guncelleme;return o}
function cacheSave(){try{localStorage.setItem(CACHE,JSON.stringify(S))}catch(e){}}
function track(q){busy++;renderStat();return Promise.resolve(q).then(function(r){busy--;if(r&&r.error)throw r.error;online=true;renderStat();renderBanner();return r},function(e){busy--;throw e})}
function fail(e){busy=Math.max(0,busy);lastErr=(e&&e.message)||String(e);toast('Kaydedilemedi: '+lastErr);renderStat();renderBanner();loadAll()}
function dbBox(k,o){return track(o?sb.from(TB).upsert(toRow(k,o)):sb.from(TB).delete().eq('adres',k))}
function logH(adres,islem,detay){if(!sb)return;sb.from('kardex_hareketler').insert({adres:adres,islem:islem,detay:detay||null,kullanici:user&&user.email}).then(function(){},function(){})}
function loadAll(){
  return Promise.all([sb.from(TB).select('*').limit(10000),sb.from('kardex_ayarlar').select('ayar').eq('id',1).maybeSingle()]).then(function(r){
    if(r[0].error)throw r[0].error;
    var b={};r[0].data.forEach(function(x){b[x.adres]=fromRow(x)});S.boxes=b;
    if(r[1]&&r[1].data&&r[1].data.ayar)S.cfg=normCfg(r[1].data.ayar);
    online=true;loaded=true;lastErr='';cacheSave();clampCur();shell();renderAll();
  }).catch(function(e){online=false;lastErr=(e&&e.message)||String(e);renderStat();renderBanner()});
}
var rtTimer=null;
function refreshSoon(){clearTimeout(rtTimer);rtTimer=setTimeout(function(){cacheSave();renderStat();if(anim)return;if(ui.view==='l')renderList();else{renderCar(0);renderOpen()}},150)}
function subscribe(){
  sb.channel('kardex-depo')
    .on('postgres_changes',{event:'*',schema:'public',table:TB},function(p){if(p.eventType==='DELETE'){if(p.old&&p.old.adres)delete S.boxes[p.old.adres]}else if(p.new&&p.new.adres)S.boxes[p.new.adres]=fromRow(p.new);refreshSoon()})
    .on('postgres_changes',{event:'*',schema:'public',table:'kardex_ayarlar'},function(p){if(p.new&&p.new.ayar){S.cfg=normCfg(p.new.ayar);clampCur();shell();renderAll()}})
    .subscribe(function(st){rt=st;renderStat()});
}
function clampCur(){ui.cur={A:Math.min(ui.cur.A||1,N()),B:Math.min(ui.cur.B||1,N())}}

/* ---------- arama ---------- */
function search(q){
  var out=[],p=parseAddr(q);
  if(p){
    if(p.full)out.push({k:p.code,p:p,hits:(S.boxes[p.code]&&S.boxes[p.code].items)||[],exact:true});
    else{out.push({p:p,partial:true});
      sortKeys(Object.keys(S.boxes)).forEach(function(k){var x=parseCode(k);if(!x||!filled(k))return;
        if(x.c===p.c&&(!p.s||x.s===p.s)&&(!p.r||x.r===p.r))out.push({k:k,p:x,hits:S.boxes[k].items||[]})});
      return out.slice(0,40);}
  }
  var toks=norm(q).split(' ').filter(Boolean);
  if(toks.length){
    sortKeys(Object.keys(S.boxes)).forEach(function(k){
      var x=parseCode(k);if(!x||(p&&k===p.code))return;
      var d=S.boxes[k],items=d.items||[];
      var hay=norm(items.join(' ')+' '+(d.note||'')+' '+(d.cust||'')+' '+k+' '+k.replace(/-/g,''));
      if(toks.every(function(t){return hay.indexOf(t)>=0})){
        var hits=items.filter(function(i){var n=norm(i);return toks.some(function(t){return n.indexOf(t)>=0})});
        out.push({k:k,p:x,hits:hits.length?hits:items});
      }
    });
  }
  return out.slice(0,40);
}
function hiText(t,toks){
  var raw=String(t),up='',mk=[];
  for(var i=0;i<raw.length;i++){var u=raw[i].toLocaleUpperCase('tr');if(u.length!==1)u=' ';u=TRM[u]||u;up+=/[A-Z0-9]/.test(u)?u:' ';mk.push(false)}
  toks.forEach(function(tk){var j=up.indexOf(tk);while(j>=0){for(var x=j;x<j+tk.length;x++)mk[x]=true;j=up.indexOf(tk,j+tk.length)}});
  var s='',on=false;for(i=0;i<raw.length;i++){if(mk[i]!==on){s+=on?'</mark>':'<mark>';on=mk[i]}s+=esc(raw[i])}
  return s+(on?'</mark>':'');
}
function partialCode(p){return p.c+(p.s?'-'+pad(p.s):'')+(p.r?'-'+pad(p.r):'')}
function renderResults(){
  var q=$('#q').value,el=$('#results');
  if(!q.trim()){el.innerHTML='';return}
  var r=search(q),toks=norm(q).split(' ').filter(Boolean);
  if(!r.length){el.innerHTML='<div class="nores">“'+esc(q)+'” bulunamadı. Parça adı ya da <b>B-01-05-01</b> gibi bir adres yazın.</div>';return}
  el.innerHTML=r.map(function(x){
    if(x.partial){var pc=partialCode(x.p);return '<button class="res" data-act="addr" data-a="'+pc+'"><span class="code '+x.p.c+'">'+pc+'</span><span class="t"><b>Bu konuma git</b><small>'+describe(x.p)+'</small></span></button>'}
    return '<button class="res" data-act="res" data-k="'+x.k+'"><span class="code '+x.p.c+'">'+x.k+'</span><span class="t">'+(x.hits.length?x.hits.slice(0,4).map(function(h){return hiText(h,toks)}).join(' · '):'<i>Boş alan</i>')+'<small>'+describe(x.p)+'</small></span></button>'}).join('');
}

/* ---------- çizim ---------- */
function shell(){
  $('#root').innerHTML='<div class="wrap">'+
  '<header class="hd"><div class="brand"><span class="k">kardex</span><span class="r">depo</span><small>Megamat RS 180 · akıllı raf kodlama</small></div><div class="stat" id="stat"></div><button class="ic" data-act="settings" aria-label="Ayarlar">⚙</button></header>'+
  '<div id="banner"></div>'+
  '<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="Parça veya adres ara… (rulman, B-01-05-01)" autocomplete="off" enterkeyhint="search"><div id="results"></div></div>'+
  '<nav class="tabs" id="tabs"></nav><main id="main"></main>'+
  '<div class="card help"><b>Kod yapısı:</b> <code>B-01-05-01</code><br><b>B</b> → dolap (A '+esc(cab('A').name)+': '+esc(cab('A').desc)+' · B '+esc(cab('B').name)+': '+esc(cab('B').desc)+')<br><b>B-01</b> → 1. raf (01–'+pad(N())+')<br><b>B-01-05</b> → rafın 5. satırı (soldan sağa; A: 01–'+pad(RW('A'))+', B: 01–'+pad(RW('B'))+')<br><b>B-01-05-01</b> → o satırın 1. sırası (01 = öndeki; A’da '+DP('A')+', B’de '+DP('B')+' sıra)<br>Aramaya parça adı ya da kısmi adres (B-01, B-01-05) yazın; Kardex rafı en kısa yoldan açıklığa getirir.</div>'+
  '<input type="file" id="file" accept=".csv,text/csv" hidden></div><div id="modal"></div><div id="toast"></div>';
  $('#q').addEventListener('input',renderResults);
  $('#q').addEventListener('keydown',function(e){if(e.key==='Enter'){var f=$('#results .res');if(f)f.click()}else if(e.key==='Escape'){this.value='';renderResults()}});
  $('#file').addEventListener('change',importFile);
}
function renderStat(){
  var el=$('#stat');if(!el)return;
  var tot=N()*(RW('A')*DP('A')+RW('B')*DP('B')),f=0;Object.keys(S.boxes).forEach(function(k){if(filled(k)&&parseCode(k))f++});
  var st=busy?'<span class="dot busy"></span>Kaydediliyor…':(!online?'<span class="dot off"></span>Bağlantı yok':(!loaded?'<span class="dot busy"></span>Yükleniyor…':(rt==='SUBSCRIBED'?'<span class="dot"></span>Canlı':'<span class="dot"></span>Bağlı')));
  el.innerHTML='<b>'+f+'</b>/'+tot+' dolu<br>'+st;
}
function renderBanner(){
  var el=$('#banner');if(!el)return;
  el.innerHTML=!online?'<div class="banner">Sunucuya ulaşılamıyor'+(lastErr?' ('+esc(lastErr)+')':'')+'. Son kaydedilen veriler gösteriliyor.<button data-act="reload">Yeniden dene</button></div>':'';
}
function renderTabs(){
  var h='';CABS.forEach(function(c){h+='<button class="tab '+(ui.view==='k'&&ui.c===c?'on':'')+'" data-act="tab" data-c="'+c+'">KARDEX '+c+'<small>'+esc(cab(c).name)+' · '+esc(cab(c).desc)+'</small></button>'});
  h+='<button class="tab '+(ui.view==='l'?'on':'')+'" data-act="tab" data-c="">Liste<small>tüm stok</small></button>';
  $('#tabs').innerHTML=h;
}
function renderMain(){
  renderTabs();
  if(ui.view==='l'){$('#main').innerHTML='<section class="card lst" id="list"></section>';renderList();return}
  $('#main').innerHTML='<div class="machine"><div class="card carwrap"><div class="ttl"><span>Döner raf sistemi</span><span>'+N()+' raf</span></div><div id="car"></div><div class="cardesc" id="cardesc"></div></div><section class="card open" id="open"></section></div>';
  renderCar(0);renderOpen();renderCarDesc();
}
function renderCar(dir){
  var c=ui.c,cur=ui.cur[c],tot=RW(c)*DP(c),h='';
  for(var o=-4;o<=4;o++){var s=wrap(cur+o),f=shelfFill(c,s);
    h+='<button class="row'+(o===0?' at':'')+'" data-act="goto" data-s="'+s+'" style="--d:'+Math.abs(o)+'"><span class="rn">'+c+'-'+pad(s)+'</span><span class="bar"><i style="width:'+(f/tot*100)+'%"></i></span><span class="fc">'+f+'/'+tot+'</span></button>'}
  $('#car').innerHTML='<div class="strip'+(dir>0?' up':dir<0?' dn':'')+'">'+h+'</div>';
}
function renderCarDesc(){var el=$('#cardesc');if(el)el.innerHTML='Sarı çerçeveli raf <b>açıklıkta</b> (operatör penceresi). Bir rafa dokunun, sistem en kısa yönden döner.'+(ui.last?'<br><b>Son hareket:</b> '+ui.last:'')}
function boxHtml(k,r,d){
  var x=S.boxes[k]||{},it=x.items||[],f=filled(k),cls='box '+(cab(ui.c).kind||'kasa')+(f?'':' empty')+(ui.hl===k?' hl':'')+(ui.col===r&&ui.hl!==k?' col':'');
  var lbl=it.length?it.slice(0,3).map(esc).join('<br>')+(it.length>3?'<br><em>+'+(it.length-3)+' daha</em>':''):(x.note?esc(x.note):'BOŞ');
  return '<button class="'+cls+'" data-act="edit" data-k="'+k+'"><span class="bn">'+pad(r)+'-'+pad(d)+'</span>'+(DP(ui.c)>1?'<span class="bc">'+siraName(d)+'</span>':'')+'<span class="bi">'+lbl+'</span>'+
    (ui.c==='B'&&f?'<span class="bk">ONAYLI</span>':'')+
    (x.cust?'<span class="bm">'+esc(x.cust)+'</span>':'')+
    (x.qty?'<span class="bq">'+esc(x.qty)+'</span>':'')+'</button>';
}
function renderOpen(){
  var el=$('#open');if(!el)return;
  var c=ui.c,s=ui.cur[c],C=S.cfg,p=ui.hl&&parseCode(ui.hl);
  if(p&&(p.c!==c||p.s!==s))p=null;
  var col=p?p.r:(ui.col||null);
  var h='<div class="ohd"><div><div class="olbl">Açıklıktaki raf</div><div class="oname">Raf '+c+'-'+pad(s)+'<span class="cabtag '+c+'">'+esc(cab(c).desc)+'</span></div></div><div class="nav"><button data-act="step" data-d="-1" aria-label="Önceki raf">▲</button><button data-act="step" data-d="1" aria-label="Sonraki raf">▼</button></div></div>';
  if(anim)h+='<div class="moving">⟳ Raf dönüyor '+(anim.dir>0?'▲':'▼')+' — '+anim.left+' adım kaldı</div>';
  h+='<div class="dec"><span><b>'+c+'</b>Dolap ('+esc(cab(c).name)+')</span><i>-</i><span><b>'+pad(s)+'</b>Raf</span><i>-</i><span><b>'+(col?pad(col):'··')+'</b>Satır</span><i>-</i><span><b>'+(p?pad(p.d):'··')+'</b>Sıra'+(p?' ('+siraName(p.d)+')':'')+'</span></div>';
  var fl=shelfFill(c,s),dim=anim?' dim':'';
  /* Masaüstü: üstten bakış planı (arka üstte, ön altta) */
  h+='<div class="lvl plan'+dim+'"><div class="lvh"><span>Üstten görünüm — satırlar soldan sağa</span><span>'+fl+'/'+(RW(c)*DP(c))+' dolu</span></div><div class="pgrid" style="--n:'+RW(c)+'"><span></span>';
  for(var r=1;r<=RW(c);r++)h+='<span class="phd'+(col===r?' on':'')+'">SATIR '+pad(r)+'</span>';
  for(var d=DP(c);d>=1;d--){h+='<span class="plab"><b>Sıra '+pad(d)+'</b>'+siraName(d)+'</span>';for(r=1;r<=RW(c);r++)h+=boxHtml(code(c,s,r,d),r,d)}
  h+='</div><div class="edge"><span>Ön · operatör tarafı</span></div></div>';
  /* Mobil: her satır bir şerit, önden arkaya */
  h+='<div class="lvl lanes'+dim+'" style="--d:'+DP(c)+'"><div class="lvh"><span>Satırlar soldan sağa · sıralar önden arkaya</span><span>'+fl+'/'+(RW(c)*DP(c))+'</span></div><div class="lhd"><span>Satır</span>';
  for(d=1;d<=DP(c);d++)h+='<span>Sıra '+pad(d)+' · '+siraName(d)+'</span>';
  h+='</div>';
  for(r=1;r<=RW(c);r++){h+='<div class="lane'+(col===r?' on':'')+'"><span class="lnum">'+pad(r)+'<small>'+c+'-'+pad(s)+'-'+pad(r)+'</small></span>';for(d=1;d<=DP(c);d++)h+=boxHtml(code(c,s,r,d),r,d);h+='</div>'}
  h+='</div>';
  el.innerHTML=h;
}
function renderList(){
  var keys=sortKeys(Object.keys(S.boxes).filter(function(k){return filled(k)&&parseCode(k)})),h='<div class="tools"><button class="ghost" data-act="export">⬇ Dışa aktar (CSV)</button><button class="ghost" data-act="import">⬆ İçe aktar (CSV)</button></div>';
  if(!keys.length)h+='<p class="sub">Henüz dolu alan yok. Bir KARDEX sekmesinde kutuya dokunarak içerik ekleyin.</p>';
  var g='';keys.forEach(function(k){var p=parseCode(k),gg='Kardex '+p.c+' · '+cab(p.c).desc+' · Raf '+p.c+'-'+pad(p.s);
    if(gg!==g){h+='<div class="grp">'+esc(gg)+'</div>';g=gg}
    var d=S.boxes[k],sub=[d.qty&&('Miktar: '+d.qty),d.cust&&('Müşteri: '+d.cust),d.appr&&('Onay: '+fmtDate(d.appr)),d.note].filter(Boolean).join(' · ');
    h+='<button class="li" data-act="res" data-k="'+k+'"><span class="code '+p.c+'">'+k+'</span><span class="t">'+((d.items||[]).map(esc).join(' · ')||'<i>—</i>')+(sub?'<small>'+esc(sub)+'</small>':'')+'</span></button>'});
  h+='<div class="grp">Son hareketler</div><div id="hist" class="sub">Yükleniyor…</div>';
  $('#list').innerHTML=h;
  sb.from('kardex_hareketler').select('*').order('zaman',{ascending:false}).limit(25).then(function(r){var el=$('#hist');if(!el)return;
    if(r.error||!r.data.length){el.textContent=r.error?'Hareketler okunamadı.':'Henüz hareket yok.';return}
    el.innerHTML=r.data.map(function(x){return '<div class="li" style="cursor:default"><span class="code '+(x.adres[0]==='B'?'B':'')+'">'+esc(x.adres)+'</span><span class="t"><b>'+esc(x.islem)+'</b> '+esc(x.detay||'')+'<small>'+esc(x.kullanici||'')+' · '+new Date(x.zaman).toLocaleString('tr-TR')+'</small></span></div>'}).join('')});
}
function renderAll(){renderStat();renderBanner();renderMain()}

/* ---------- döndürme ---------- */
function scrollHl(){var e=document.querySelector('.box.hl');if(!e||!e.offsetParent){var all=document.querySelectorAll('.box.hl,.lane.on,.phd.on');for(var i=0;i<all.length;i++)if(all[i].offsetParent){e=all[i];break}}if(e&&e.offsetParent)e.scrollIntoView({block:'center',behavior:'smooth'})}
function goTo(c,s,hl,col){
  if(timer){clearTimeout(timer);timer=null;anim=null}
  if(ui.view!=='k'||ui.c!==c){ui.view='k';ui.c=c;renderMain()}
  ui.hl=hl||null;ui.col=col||null;
  var n=N(),cur=ui.cur[c],diff=((s-cur)%n+n)%n;
  if(!diff){renderOpen();renderCar(0);saveUi();setTimeout(scrollHl,50);return}
  var dir=diff<=n/2?1:-1,left=dir>0?diff:n-diff;
  ui.last=(dir>0?'▲ yukarı':'▼ aşağı')+', '+left+' adım ('+c+'-'+pad(cur)+' → '+c+'-'+pad(s)+')';
  anim={left:left,dir:dir};renderOpen();
  var tick=function(){ui.cur[c]=wrap(ui.cur[c]+dir);anim.left--;renderCar(dir);
    if(anim.left>0){renderOpen();timer=setTimeout(tick,Math.max(90,700/left))}
    else{anim=null;timer=null;saveUi();renderOpen();renderCarDesc();setTimeout(scrollHl,60)}};
  timer=setTimeout(tick,80);
}
function goAddr(p){
  if(p.full){goTo(p.c,p.s,p.code);return}
  if(!p.s){if(timer){clearTimeout(timer);timer=null;anim=null}ui.view='k';ui.c=p.c;ui.hl=null;ui.col=null;saveUi();renderMain();return}
  goTo(p.c,p.s,null,p.r);
}

/* ---------- pencereler ---------- */
function modal(h){$('#modal').innerHTML='<div class="ov" data-act="ovclose"><div class="dlg">'+h+'</div></div>'}
function closeModal(){$('#modal').innerHTML=''}
function openEdit(k){
  var p=parseCode(k),d=S.boxes[k]||{},B=p.c==='B';
  modal('<h3><span class="code '+p.c+'">'+k+'</span> '+(B?'Onaylı ürün':'Malzeme')+'</h3><div class="sub">'+describe(p)+'</div>'+
  '<label>'+(B?'Ürün adı / kodu':'İçerik')+' <small>— her satıra bir kalem</small><textarea id="e-items" rows="4" placeholder="'+(B?'ÜRÜN KODU – ÜRÜN ADI':'RULMAN 6204&#10;M8x30 CİVATA')+'">'+esc((d.items||[]).join('\n'))+'</textarea></label>'+
  (B?'<div class="two"><label>Müşteri<input id="e-cust" value="'+esc(d.cust||'')+'" placeholder="Müşteri adı"></label><label>Onay tarihi<input id="e-appr" type="date" value="'+esc(d.appr||'')+'"></label></div>':'')+
  '<div class="two"><label>Miktar / adet<input id="e-qty" value="'+esc(d.qty||'')+'" placeholder="örn. 5 ad"></label><label>Taşı → yeni adres<input id="e-move" placeholder="örn. '+p.c+'-02-03-01" autocapitalize="characters"></label></div>'+
  '<label>Not<input id="e-note" value="'+esc(d.note||'')+'" placeholder="'+(B?'Kalıp no, revizyon, numune bilgisi…':'Ölçü, tedarikçi, stok kodu…')+'"></label>'+
  (d.by?'<div class="sub" style="margin-top:8px">Son güncelleme: '+esc(d.by)+(d.at?' · '+new Date(d.at).toLocaleString('tr-TR'):'')+'</div>':'')+
  '<div class="btns">'+(filled(k)?'<button class="ghost danger" data-act="clear" data-k="'+k+'">Boşalt</button>':'')+'<span style="flex:1"></span><button class="ghost" data-act="close">Vazgeç</button><button class="pri" data-act="save" data-k="'+k+'">Kaydet</button></div>');
  if(!filled(k))setTimeout(function(){var t=$('#e-items');if(t)t.focus()},60);
}
function saveEdit(k){
  var items=$('#e-items').value.split('\n').map(function(s){return s.trim().toLocaleUpperCase('tr')}).filter(Boolean);
  var qty=$('#e-qty').value.trim(),note=$('#e-note').value.trim(),mv=$('#e-move').value.trim(),dest=k;
  var cust=$('#e-cust')?$('#e-cust').value.trim():'',appr=$('#e-appr')?$('#e-appr').value:'';
  if(mv){var p=parseCode(mv);if(!p){toast('Geçersiz adres: '+mv+' (örn. B-01-05-01)');return}
    if(p.code!==k){if(filled(p.code)){toast(p.code+' dolu — önce boşaltın.');return}dest=p.code}}
  var old=S.boxes[k]||{},o=null;delete S.boxes[k];
  if(dest!==k&&dest[0]!==k[0]){if(!cust)cust=old.cust||'';if(!appr)appr=old.appr||''}
  if(items.length||qty||note||cust||appr){o={items:items};if(qty)o.qty=qty;if(note)o.note=note;if(dest[0]==='B'){if(cust)o.cust=cust;if(appr)o.appr=appr}S.boxes[dest]=o}
  closeModal();cacheSave();
  if(dest!==k){Promise.all([dbBox(k,null),dbBox(dest,o)]).catch(fail);logH(dest,'taşıma',k+' → '+dest+': '+items.join(' | '))}
  else{dbBox(k,o).catch(fail);logH(k,o?'güncelleme':'boşaltma',items.join(' | '))}
  renderStat();
  if(dest!==k){toast(k+' → '+dest+' taşındı');var q=parseCode(dest);goTo(q.c,q.s,dest)}else{ui.hl=k;renderOpen();renderCar(0);toast(k+' kaydedildi')}
}
function openSettings(){
  var C=S.cfg,A=cab('A'),B=cab('B');
  modal('<h3>Ayarlar</h3><div class="sub">Raf yapısı kodlamayı belirler. Mevcut kayıtlar silinmez; aralık dışına düşen adresler gizlenir.</div>'+
  '<div class="two"><label>Dolap A konumu<input id="s-an" value="'+esc(A.name)+'"></label><label>Dolap A içeriği<input id="s-ad" value="'+esc(A.desc)+'"></label></div>'+
  '<div class="two"><label>Dolap B konumu<input id="s-bn" value="'+esc(B.name)+'"></label><label>Dolap B içeriği<input id="s-bd" value="'+esc(B.desc)+'"></label></div>'+
  '<label>Raf sayısı (her iki dolap)<input id="s-sh" type="number" min="4" max="99" value="'+C.shelves+'"></label>'+
  '<div class="two"><label>A · raf başına satır (koli)<input id="s-arw" type="number" min="1" max="20" value="'+RW('A')+'"></label><label>A · satır başına sıra<input id="s-adp" type="number" min="1" max="6" value="'+DP('A')+'"></label></div>'+
  '<div class="two"><label>B · raf başına satır<input id="s-brw" type="number" min="1" max="20" value="'+RW('B')+'"></label><label>B · satır başına sıra<input id="s-bdp" type="number" min="1" max="6" value="'+DP('B')+'"></label></div>'+
  '<div class="btns"><button class="ghost" data-act="export">⬇ CSV yedek</button><span style="flex:1"></span><button class="ghost" data-act="close">Vazgeç</button><button class="pri" data-act="savecfg">Kaydet</button></div>'+
  '<div class="btns" style="border-top:1px solid var(--ln);padding-top:12px"><span class="sub">Giriş: <b>'+esc(user&&user.email)+'</b></span><span style="flex:1"></span><button class="ghost danger" data-act="logout">Çıkış yap</button></div>');
}
function saveCfg(){
  function iv(id,a,b,d){var v=parseInt($(id).value,10);return isNaN(v)?d:Math.min(b,Math.max(a,v))}
  var C=S.cfg;
  var A=C.cab.A,B=C.cab.B;
  A.name=$('#s-an').value.trim()||'Sol';A.desc=$('#s-ad').value.trim()||'Atölye malzemeleri';B.name=$('#s-bn').value.trim()||'Sağ';B.desc=$('#s-bd').value.trim()||'Onaylı ürünler';
  C.shelves=iv('#s-sh',4,99,C.shelves);A.rows=iv('#s-arw',1,20,A.rows);A.depth=iv('#s-adp',1,6,A.depth);B.rows=iv('#s-brw',1,20,B.rows);B.depth=iv('#s-bdp',1,6,B.depth);
  ui.cur={A:Math.min(ui.cur.A,C.shelves),B:Math.min(ui.cur.B,C.shelves)};
  closeModal();cacheSave();shell();renderAll();
  track(sb.from('kardex_ayarlar').upsert({id:1,ayar:S.cfg,guncelleyen:user&&user.email,guncelleme:new Date().toISOString()})).then(function(){toast('Ayarlar kaydedildi');logH('-','ayar','Ayarlar değişti')}).catch(fail);
}

/* ---------- CSV ---------- */
function toCSV(){
  var rows=[['Adres','Dolap','Raf','Satır','Sıra','İçerik','Miktar','Müşteri','Onay tarihi','Not']];
  sortKeys(Object.keys(S.boxes)).forEach(function(k){if(!filled(k))return;var d=S.boxes[k],x=k.split('-');
    rows.push([k,x[0],x[1],x[2],x[3],(d.items||[]).join(' | '),d.qty||'',d.cust||'',fmtDate(d.appr),d.note||''])});
  return rows.map(function(r){return r.map(function(v){v=String(v==null?'':v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(';')}).join('\r\n');
}
function exportCSV(){
  var csv='﻿'+toCSV(),fn='kardex-stok-'+new Date().toISOString().slice(0,10)+'.csv';
  try{var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=fn;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},800);toast('CSV indirildi')}catch(e){showCSV(csv)}
}
function showCSV(csv){
  modal('<h3>CSV verisi</h3><div class="sub">Kopyalayıp Excel’e yapıştırabilir ya da .csv olarak kaydedebilirsiniz.</div><textarea id="csvbox" rows="10" style="text-transform:none" readonly>'+esc(csv.replace(/^﻿/,''))+'</textarea><div class="btns"><span style="flex:1"></span><button class="ghost" data-act="close">Kapat</button><button class="pri" data-act="copycsv">Kopyala</button></div>');
}
function parseCSV(t){
  t=t.replace(/^﻿/,'');var first=t.split('\n')[0],dlm=(first.split(';').length>=first.split(',').length)?';':',';
  var rows=[],row=[],f='',q=false;
  for(var i=0;i<t.length;i++){var c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===dlm){row.push(f);f=''}else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!=='\r')f+=c}
  if(f||row.length){row.push(f);rows.push(row)}return rows;
}
function isoDate(s){s=String(s||'').trim();var m=/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);return m?m[3]+'-'+pad(m[2])+'-'+pad(m[1]):s}
function importFile(e){
  var file=e.target.files[0];if(!file)return;var r=new FileReader();
  r.onload=function(){
    var rows=parseCSV(String(r.result));if(!rows.length){toast('Dosya boş');return}
    var h=rows[0].map(norm);function ix(){for(var i=0;i<arguments.length;i++){var j=h.indexOf(arguments[i]);if(j>=0)return j}return -1}
    var ia=ix('ADRES'),ii=ix('ICERIK','PARCA','URUN'),iq=ix('MIKTAR','ADET'),ic=ix('MUSTERI'),id=ix('ONAY TARIHI','ONAY'),inn=ix('NOT');
    if(ia<0){ia=0;ii=ii<0?1:ii}else rows.shift();
    var ok=0,bad=0,up=[];
    rows.forEach(function(rw){if(!rw.join('').trim())return;var p=parseCode(rw[ia]);if(!p){bad++;return}
      var o={items:String(rw[ii]||'').split(/\s*\|\s*/).map(function(s){return s.trim().toLocaleUpperCase('tr')}).filter(Boolean)};
      if(iq>=0&&rw[iq])o.qty=rw[iq].trim();if(inn>=0&&rw[inn])o.note=rw[inn].trim();
      if(p.c==='B'){if(ic>=0&&rw[ic])o.cust=rw[ic].trim();if(id>=0&&rw[id])o.appr=isoDate(rw[id])}
      S.boxes[p.code]=o;up.push(toRow(p.code,o));ok++});
    cacheSave();renderAll();
    var chunks=[];for(var i=0;i<up.length;i+=400)chunks.push(up.slice(i,i+400));
    Promise.all(chunks.map(function(c){return track(sb.from(TB).upsert(c))})).then(function(){toast(ok+' alan içe aktarıldı'+(bad?', '+bad+' satır atlandı':''));logH('-','içe aktarma',ok+' kayıt')}).catch(fail);
  };r.readAsText(file,'utf-8');e.target.value='';
}

/* ---------- olaylar ---------- */
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-act]');if(!el)return;var a=el.dataset.act,k=el.dataset.k,p;
  if(a==='ovclose'){if(e.target===el)closeModal();return}
  if(a==='tab'){var c=el.dataset.c;if(timer){clearTimeout(timer);timer=null;anim=null}if(c){ui.view='k';ui.c=c}else ui.view='l';ui.col=null;saveUi();renderMain()}
  else if(a==='goto'){ui.col=null;goTo(ui.c,+el.dataset.s)}
  else if(a==='step')goTo(ui.c,wrap(ui.cur[ui.c]+(+el.dataset.d)));
  else if(a==='edit'){if(anim)return;ui.hl=k;ui.col=null;renderOpen();openEdit(k)}
  else if(a==='close')closeModal();
  else if(a==='save')saveEdit(k);
  else if(a==='clear'){delete S.boxes[k];closeModal();cacheSave();renderOpen();renderCar(0);renderStat();dbBox(k,null).then(function(){toast(k+' boşaltıldı')}).catch(fail);logH(k,'boşaltma','')}
  else if(a==='res'||a==='addr'){p=a==='res'?parseCode(k):parseAddr(el.dataset.a);$('#q').value='';renderResults();$('#q').blur();goAddr(p);var t=$('#tabs');if(t)t.scrollIntoView({behavior:'smooth'})}
  else if(a==='settings')openSettings();
  else if(a==='savecfg')saveCfg();
  else if(a==='export')exportCSV();
  else if(a==='import')$('#file').click();
  else if(a==='reload')loadAll();
  else if(a==='logout'){closeModal();sb.auth.signOut()}
  else if(a==='copycsv'){var b=$('#csvbox');try{navigator.clipboard.writeText(b.value).then(function(){toast('Kopyalandı')},function(){b.select();toast('Metni seçip kopyalayın')})}catch(x){b.select()}}
});

/* ---------- başlat ---------- */
function showSetup(){
  document.getElementById('root').innerHTML='<div class="wrap"><div class="card login"><div class="brand"><span class="k">kardex</span><span class="r">depo</span></div><h2>Kurulum tamamlanmadı</h2><p class="sub"><b>config.js</b> dosyasına Supabase proje adresinizi (Project URL) ve anon anahtarınızı yazın, sonra sayfayı yenileyin.</p></div></div>';
}
function showLogin(){
  document.getElementById('root').innerHTML='<div class="wrap"><form class="card login" id="lf"><div class="brand"><span class="k">kardex</span><span class="r">depo</span><small>Megamat RS 180 · akıllı raf kodlama</small></div>'+
  '<label>E-posta<input id="le" type="email" autocomplete="username" required></label><label>Şifre<input id="lp" type="password" autocomplete="current-password" required></label>'+
  '<button class="pri" style="width:100%;margin-top:14px" id="lb">Giriş yap</button><p class="sub" id="lm"></p></form></div><div id="toast"></div>';
  document.getElementById('lf').addEventListener('submit',function(e){e.preventDefault();var b=$('#lb');b.disabled=true;b.textContent='Giriş yapılıyor…';
    sb.auth.signInWithPassword({email:$('#le').value.trim(),password:$('#lp').value}).then(function(r){
      if(r.error){b.disabled=false;b.textContent='Giriş yap';$('#lm').textContent='Giriş başarısız: '+(r.error.message==='Invalid login credentials'?'e-posta veya şifre hatalı':r.error.message)}
      else{user=r.data.user;start()}});
  });
}
var started=false;
function start(){
  if(started)return;started=true;
  try{var c=JSON.parse(localStorage.getItem(CACHE)||'null');if(c&&c.boxes){S.boxes=c.boxes;S.cfg=normCfg(c.cfg)}}catch(e){}
  clampCur();shell();renderAll();loadAll();subscribe();
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&loaded)loadAll()});
}
if(!CFG.supabaseUrl||!CFG.supabaseAnonKey||/BURAYA/.test(CFG.supabaseUrl+CFG.supabaseAnonKey)||!window.supabase){showSetup()}
else{
  sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  sb.auth.getSession().then(function(r){var ss=r.data&&r.data.session;if(ss){user=ss.user;start()}else showLogin()});
  sb.auth.onAuthStateChange(function(ev,ss){if(ev==='SIGNED_OUT'){user=null;started=false;try{localStorage.removeItem(CACHE)}catch(e){}location.reload()}else if(ss)user=ss.user});
}
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(function(){});
})();
