(function(){
var CFG=window.KARDEX_CONFIG||{};
var LSU='kardex-depo-ui-v2',CACHE='kardex-depo-cache-v2';
var DEF={shelves:20,cab:{A:{name:'Sol',desc:'Atölye malzemeleri',rows:8,depth:2,kind:'kasa'},B:{name:'Sağ',desc:'Onaylı ürünler',rows:8,depth:2,kind:'koli'}}};
function normCfg(c){var d=JSON.parse(JSON.stringify(DEF));if(!c)return d;d.shelves=c.shelves||d.shelves;['A','B'].forEach(function(k){if(c.cab&&c.cab[k])for(var x in c.cab[k])d.cab[k][x]=c.cab[k][x]});d.cab.A.kind='kasa';d.cab.B.kind='koli';return d}
var S={cfg:normCfg(),boxes:{},docs:{}};
var CABS=['A','B'];
var ui={c:'A',cur:{A:1,B:1},view:'k',hl:null,col:null,last:'',box:null,selU:null,find:null};
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
function filled(k){var d=S.boxes[k];return !!(d&&((d.items&&d.items.length)||d.note||d.cust||d.appr))}
function shelfFill(c,s){var n=0;for(var r=1;r<=RW(c);r++)for(var d=1;d<=DP(c);d++)if(filled(code(c,s,r,d)))n++;return n}
function sortKeys(a){return a.sort(function(x,y){return x.localeCompare(y,'tr',{numeric:true})})}
function toast(t){var el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('on')},2400)}
function saveUi(){try{localStorage.setItem(LSU,JSON.stringify({c:ui.c,cur:ui.cur,view:ui.view,hl:ui.hl}))}catch(e){}}
function fmtDate(s){if(!s)return '';var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return m?m[3]+'.'+m[2]+'.'+m[1]:s}
function describe(p){return 'Dolap '+p.c+' ('+esc(cab(p.c).name)+' · '+esc(cab(p.c).desc)+')'+(p.s?' · Raf '+pad(p.s):'')+(p.r?' · Satır '+pad(p.r):'')+(p.d?' · Sıra '+pad(p.d)+' ('+siraName(p.d,p.c)+')':'')}

/* ---------- Supabase ---------- */
var TB='kardex_kutular',TS='kardex_stok',TH='kardex_hareketler',TD='kardex_dosyalar',BK='kardex-dosyalar';
function fmtN(n){return Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:2})}
function itemTxt(i){return i.u+' — '+fmtN(i.n)+' '+(i.b||'ad')}
function parseNum(v){v=String(v==null?'':v).trim().replace(/\s/g,'');if(!v)return NaN;if(v.indexOf(',')>=0&&v.indexOf('.')>=0)v=v.replace(/\./g,'').replace(',','.');else v=v.replace(',','.');return Number(v)}
function errMsg(e){return (e&&(e.message||e.details||e.hint))||String(e)}
function cacheSave(){try{localStorage.setItem(CACHE,JSON.stringify(S))}catch(e){}}
function track(q){busy++;renderStat();return Promise.resolve(q).then(function(r){busy--;if(r&&r.error)throw r.error;online=true;renderStat();renderBanner();return r},function(e){busy--;renderStat();throw e})}
function fail(e){lastErr=errMsg(e);toast('Hata: '+lastErr);renderStat();renderBanner();refreshData()}
function logH(adres,islem,detay,urun){if(!sb)return;var o={adres:adres,islem:islem,detay:detay||null,kullanici:user&&user.email};if(urun)o.urun=urun;sb.from(TH).insert(o).then(function(){},function(){})}
function rpc(fn,args){return track(sb.rpc(fn,args)).then(function(r){return r.data})}
function infoRow(k,o){var x=k.split('-');return {adres:k,dolap:x[0],raf:+x[1],satir:+x[2],sira:+x[3],musteri:o.cust||null,onay_tarihi:o.appr||null,notlar:o.note||null,guncelleyen:user&&user.email,guncelleme:new Date().toISOString()}}
function fetchData(){
  return Promise.all([
    sb.from(TB).select('adres,musteri,onay_tarihi,notlar,guncelleyen,guncelleme').limit(10000),
    sb.from(TS).select('*').limit(20000),
    sb.from('kardex_ayarlar').select('ayar').eq('id',1).maybeSingle(),
    sb.from(TD).select('*').limit(10000)
  ]).then(function(r){
    var dm={};if(r[3]&&!r[3].error&&r[3].data)r[3].data.forEach(function(x){(dm[x.urun]=dm[x.urun]||[]).push(x)});
    Object.keys(dm).forEach(function(u){dm[u].sort(function(a,b){return a.zaman<b.zaman?1:-1})});S.docs=dm;
    if(r[0].error)throw r[0].error;if(r[1].error)throw r[1].error;
    var b={};
    r[0].data.forEach(function(x){var o={items:[]};if(x.musteri)o.cust=x.musteri;if(x.onay_tarihi)o.appr=x.onay_tarihi;if(x.notlar)o.note=x.notlar;if(x.guncelleyen)o.by=x.guncelleyen;if(x.guncelleme)o.at=x.guncelleme;b[x.adres]=o});
    r[1].data.forEach(function(x){var o=b[x.adres]||(b[x.adres]={items:[]});o.items.push({u:x.urun,n:+x.adet,b:x.birim||'ad',by:x.guncelleyen,at:x.guncelleme})});
    Object.keys(b).forEach(function(k){b[k].items.sort(function(p,q){return p.u.localeCompare(q.u,'tr')})});
    S.boxes=b;if(r[2]&&r[2].data&&r[2].data.ayar)S.cfg=normCfg(r[2].data.ayar);
    online=true;loaded=true;lastErr='';cacheSave();clampCur();
  });
}
function offline(e){online=false;lastErr=errMsg(e);renderStat();renderBanner()}
function loadAll(){return fetchData().then(function(){closeModal();shell();renderAll()}).catch(offline)}
function refreshData(){return fetchData().then(redraw).catch(offline)}
function redraw(){renderStat();renderBanner();if(!anim){if(ui.view==='l')renderList();else{renderCar(0);renderOpen()}}if(ui.box)renderBoxParts()}
var rtTimer=null;
function refreshSoon(){clearTimeout(rtTimer);rtTimer=setTimeout(refreshData,250)}
function subscribe(){
  sb.channel('kardex-depo')
    .on('postgres_changes',{event:'*',schema:'public',table:TB},refreshSoon)
    .on('postgres_changes',{event:'*',schema:'public',table:TS},refreshSoon)
    .on('postgres_changes',{event:'*',schema:'public',table:TD},refreshSoon)
    .on('postgres_changes',{event:'*',schema:'public',table:'kardex_ayarlar'},function(p){if(p.new&&p.new.ayar){S.cfg=normCfg(p.new.ayar);clampCur();if(!ui.box){shell();renderAll()}}})
    .subscribe(function(st){rt=st;renderStat()});
}
function clampCur(){ui.cur={A:Math.min(ui.cur.A||1,N()),B:Math.min(ui.cur.B||1,N())}}

/* ---------- arama ---------- */
function search(q){
  var out=[],p=parseAddr(q);
  function its(k){return ((S.boxes[k]&&S.boxes[k].items)||[]).map(itemTxt)}
  if(p){
    if(p.full)out.push({k:p.code,p:p,hits:its(p.code),exact:true});
    else{out.push({p:p,partial:true});
      sortKeys(Object.keys(S.boxes)).forEach(function(k){var x=parseCode(k);if(!x||!filled(k))return;
        if(x.c===p.c&&(!p.s||x.s===p.s)&&(!p.r||x.r===p.r))out.push({k:k,p:x,hits:its(k)})});
      return out.slice(0,40);}
  }
  var toks=norm(q).split(' ').filter(Boolean);
  if(toks.length){
    sortKeys(Object.keys(S.boxes)).forEach(function(k){
      var x=parseCode(k);if(!x||(p&&k===p.code))return;
      var d=S.boxes[k],items=d.items||[];
      var hay=norm(items.map(function(i){return i.u}).join(' ')+' '+(d.note||'')+' '+(d.cust||'')+' '+k+' '+k.replace(/-/g,''));
      if(toks.every(function(t){return hay.indexOf(t)>=0})){
        var hits=items.filter(function(i){var n=norm(i.u);return toks.some(function(t){return n.indexOf(t)>=0})});
        out.push({k:k,p:x,hits:(hits.length?hits:items).map(itemTxt),items:hits});
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
  var tot={},tc=0;r.forEach(function(x){(x.items||[]).forEach(function(i){var key=i.u+'|'+i.b;if(!tot[key])tot[key]={u:i.u,b:i.b,n:0,c:0};tot[key].n+=i.n;tot[key].c++;tc++})});
  var tk=Object.keys(tot),head=(tk.length&&tk.length<=3)?'<div class="rtot">'+tk.map(function(key){var t=tot[key];return '<b>'+esc(t.u)+'</b>: toplam <b class="qn">'+fmtN(t.n)+' '+esc(t.b)+'</b> · '+t.c+' kutuda'}).join('<br>')+'</div>':'';
  el.innerHTML=head+r.map(function(x){
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
  '<input type="file" id="file" accept=".csv,text/csv" hidden></div><div id="modal"></div><div id="scanner"></div><div id="toast"></div>'+
  '<button class="fab" data-act="scan" aria-label="QR okut"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="8" y="8" width="3" height="3"/><rect x="13" y="8" width="3" height="3"/><rect x="8" y="13" width="3" height="3"/><path d="M13 13h3v3"/></svg><span>QR Okut</span></button>';
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
  var x=S.boxes[k]||{items:[]},it=x.items||[],f=filled(k),cls='box '+(cab(ui.c).kind||'kasa')+(f?'':' empty')+(ui.hl===k?' hl':'')+(ui.col===r&&ui.hl!==k?' col':'');
  var lbl=it.length?it.slice(0,3).map(function(i){return esc(i.u)+' <b class="qn'+(i.n<=0?' z':'')+'">'+fmtN(i.n)+'</b>'}).join('<br>')+(it.length>3?'<br><em>+'+(it.length-3)+' ürün daha</em>':''):(x.note?esc(x.note):'BOŞ');
  return '<button class="'+cls+'" data-act="edit" data-k="'+k+'"><span class="bn">'+pad(r)+'-'+pad(d)+'</span>'+(DP(ui.c)>1?'<span class="bc">'+siraName(d)+'</span>':'')+'<span class="bi">'+lbl+'</span>'+
    (ui.c==='B'&&f?'<span class="bk">ONAYLI</span>':'')+
    (x.cust?'<span class="bm">'+esc(x.cust)+'</span>':'')+
    (it.length>1?'<span class="bq">'+it.length+' ürün</span>':'')+'</button>';
}
function renderOpen(){
  var el=$('#open');if(!el)return;
  var c=ui.c,s=ui.cur[c],C=S.cfg,p=ui.hl&&parseCode(ui.hl);
  if(p&&(p.c!==c||p.s!==s))p=null;
  var col=p?p.r:(ui.col||null);
  var h='<div class="ohd"><div><div class="olbl">Açıklıktaki raf</div><div class="oname">Raf '+c+'-'+pad(s)+'<span class="cabtag '+c+'">'+esc(cab(c).desc)+'</span></div></div><div class="nav"><button data-act="step" data-d="-1" aria-label="Önceki raf">▲</button><button data-act="step" data-d="1" aria-label="Sonraki raf">▼</button></div></div>';
  if(anim)h+='<div class="moving">⟳ Raf dönüyor '+(anim.dir>0?'▲':'▼')+' — '+anim.left+' adım kaldı</div>';
  var fp=ui.find&&parseCode(ui.find);
  if(fp&&fp.c===c&&fp.s===s&&!anim)h+='<div class="find"><span style="flex:1;min-width:170px">🔎 Aranan: <b>'+ui.find+'</b><br>Doğru kutuyu aldığınızı QR ile doğrulayın</span><span class="fb"><button class="pri" data-act="scan">QR okut</button><button class="ghost" data-act="findx" aria-label="Kapat">✕</button></span></div>';
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
function histHtml(rows,addr){
  if(!rows||!rows.length)return '<p class="sub">Henüz hareket yok.</p>';
  return rows.map(function(x){var m=x.miktar!=null?+x.miktar:null,ok=parseCode(x.adres);
    return '<div class="hrow">'+(addr?(ok?'<button class="code '+(x.adres[0]==='B'?'B':'')+'" data-act="res" data-k="'+esc(x.adres)+'">'+esc(x.adres)+'</button>':'<span class="code">'+esc(x.adres)+'</span>'):'')+
      '<span class="ht"><b>'+esc(x.urun||x.islem)+'</b>'+(m!=null?(m===0?' <span class="hm pos">✓ '+fmtN(x.bakiye)+'</span>':' <span class="hm '+(m<0?'neg':'pos')+'">'+(m>0?'+':'−')+fmtN(Math.abs(m))+'</span>'+(x.bakiye!=null?' <span class="hb">→ kalan '+fmtN(x.bakiye)+'</span>':'')):(x.detay?' '+esc(x.detay):''))+
      '<small>'+esc(x.islem)+(m!=null&&x.detay?' · '+esc(x.detay):'')+' · <b>'+esc((x.kullanici||'').split('@')[0])+'</b> · '+new Date(x.zaman).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</small></span></div>'}).join('');
}
function renderList(){
  var keys=sortKeys(Object.keys(S.boxes).filter(function(k){return filled(k)&&parseCode(k)}));
  var h='<div class="tools"><button class="ghost" data-act="export">⬇ Stok (CSV)</button><button class="ghost" data-act="exporth">⬇ Hareketler (CSV)</button><button class="ghost" data-act="import">⬆ İçe aktar / sayım</button><button class="ghost" data-act="labels">▦ QR etiketleri</button></div>';
  if(!keys.length)h+='<p class="sub">Henüz dolu alan yok. Bir KARDEX sekmesinde kutuya dokunarak ürün ekleyin.</p>';
  var tot={};keys.forEach(function(k){(S.boxes[k].items||[]).forEach(function(i){var key=i.u+'|'+i.b;if(!tot[key])tot[key]={u:i.u,b:i.b,n:0,c:0};tot[key].n+=i.n;tot[key].c++})});
  var tk=Object.keys(tot).sort(function(a,b){return a.localeCompare(b,'tr')});
  if(tk.length)h+='<details class="sec2"><summary>Ürün toplamları ('+tk.length+' ürün)</summary><table class="tot">'+tk.map(function(key){var t=tot[key];return '<tr><td>'+esc(t.u)+'</td><td class="n">'+fmtN(t.n)+' '+esc(t.b)+'</td><td class="sub">'+t.c+' kutu</td></tr>'}).join('')+'</table></details>';
  var g='';keys.forEach(function(k){var p=parseCode(k),gg='Kardex '+p.c+' · '+cab(p.c).desc+' · Raf '+p.c+'-'+pad(p.s);
    if(gg!==g){h+='<div class="grp">'+esc(gg)+'</div>';g=gg}
    var d=S.boxes[k],sub=[d.cust&&('Müşteri: '+d.cust),d.appr&&('Onay: '+fmtDate(d.appr)),d.note].filter(Boolean).join(' · ');
    h+='<button class="li" data-act="res" data-k="'+k+'"><span class="code '+p.c+'">'+k+'</span><span class="t">'+((d.items||[]).map(function(i){return esc(i.u)+' <b class="qn'+(i.n<=0?' z':'')+'">'+fmtN(i.n)+' '+esc(i.b)+'</b>'}).join(' · ')||'<i>—</i>')+(sub?'<small>'+esc(sub)+'</small>':'')+'</span></button>'});
  h+='<div class="grp">Son hareketler</div><div id="hist" class="sub">Yükleniyor…</div>';
  $('#list').innerHTML=h;
  sb.from(TH).select('*').order('zaman',{ascending:false}).limit(40).then(function(r){var el=$('#hist');if(!el)return;el.innerHTML=r.error?'Hareketler okunamadı.':histHtml(r.data,true)});
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
function closeModal(){var m=$('#modal');if(m)m.innerHTML='';ui.box=null;ui.selU=null;ui.ren=null;ui.docU=null}
function openEdit(k){
  var p=parseCode(k),d=S.boxes[k]||{items:[]},B=p.c==='B';ui.box=k;ui.selU=null;
  modal('<div class="mh"><h3><span class="code '+p.c+'">'+k+'</span> '+(B?'Onaylı ürün kolisi':'Malzeme kasası')+'</h3><button class="x" data-act="close" aria-label="Kapat">✕</button></div><div class="sub">'+describe(p)+'</div>'+
  '<div class="qa"><button class="ghost" data-act="qrlabel" data-k="'+k+'">▦ QR etiketi</button><button class="ghost" data-act="sayim">✓ Sayım yap</button></div><div id="bm-count" hidden></div>'+
  '<div class="sec">İçerik ve güncel stok</div><div id="bm-items"></div><div id="bm-ren" hidden></div><div id="bm-docs" hidden></div>'+
  '<div class="sec">Stok hareketi</div><div class="mv">'+
    '<label>Ürün<select id="h-urun"></select></label>'+
    '<div id="h-newf" class="two" hidden><label>Yeni ürün adı<input id="h-yeni" placeholder="örn. RULMAN 6204" autocapitalize="characters"></label><label>Birim<input id="h-birim" value="ad" list="birimler"></label></div>'+
    '<div class="two"><label>Miktar<input id="h-mik" type="text" inputmode="decimal" placeholder="0" autocomplete="off"></label><label>Açıklama <small>(isteğe bağlı)</small><input id="h-acik" placeholder="İş emri, kime verildi…"></label></div>'+
    '<div class="btns"><button class="ghost bout" data-act="mv" data-d="-1">− Çıkar (al)</button><button class="pri bin" data-act="mv" data-d="1">+ Ekle (koy)</button></div></div>'+
  '<datalist id="birimler"><option value="ad"><option value="kg"><option value="m"><option value="paket"><option value="takım"><option value="kutu"></datalist>'+
  '<details class="sec2"><summary>Kutu bilgisi · taşı · boşalt</summary>'+
    (B?'<div class="two"><label>Müşteri<input id="e-cust" value="'+esc(d.cust||'')+'" placeholder="Müşteri adı"></label><label>Onay tarihi<input id="e-appr" type="date" value="'+esc(d.appr||'')+'"></label></div>':'')+
    '<label>Not<input id="e-note" value="'+esc(d.note||'')+'" placeholder="'+(B?'Kalıp no, revizyon, numune bilgisi…':'Ölçü, tedarikçi, stok kodu…')+'"></label>'+
    '<div class="btns"><span style="flex:1"></span><button class="ghost" data-act="saveinfo">Bilgileri kaydet</button></div>'+
    '<div class="two" style="align-items:end"><label>Tüm kutuyu taşı → yeni adres<input id="e-move" placeholder="örn. '+p.c+'-02-03-01" autocapitalize="characters"></label><button class="ghost" data-act="tasi" style="height:44px">Taşı</button></div>'+
    '<div class="btns"><button class="ghost danger" data-act="bosalt">Kutuyu boşalt</button></div>'+
  '</details>'+
  '<div class="sec">Hareket geçmişi</div><div id="bm-hist" class="sub">Yükleniyor…</div>');
  $('#h-urun').addEventListener('change',onUrunSel);
  $('#h-mik').addEventListener('keydown',function(e){if(e.key==='Enter')e.preventDefault()});
  renderBoxParts();
  if(!(d.items||[]).length)setTimeout(function(){var t=$('#h-yeni');if(t)t.focus()},80);
}
function onUrunSel(){var s=$('#h-urun');if(!s)return;$('#h-newf').hidden=s.value!=='__new';
  var it=(S.boxes[ui.box]||{items:[]}).items.find(function(i){return i.u===s.value});$('.bout').disabled=!it||it.n<=0}
function renderBoxParts(){
  var k=ui.box;if(!k||!$('#bm-items')){ui.box=null;return}
  var d=S.boxes[k]||{items:[]},it=d.items||[];
  $('#bm-items').innerHTML=it.length?it.map(function(i,ix){var nd=(S.docs[i.u]||[]).length;return '<div class="irow"><div class="iu"><button class="iun" data-act="ren" data-i="'+ix+'" title="Adı / birimi düzelt">'+esc(i.u)+' <span class="pen">✎</span></button>'+(i.by?'<small>'+esc(i.by.split('@')[0])+' · '+new Date(i.at).toLocaleDateString('tr-TR')+'</small>':'')+'<button class="dchip'+(nd?' has':'')+'" data-act="docs" data-i="'+ix+'">📎 '+(nd?nd+' doküman':'Doküman ekle')+'</button></div><span class="iq'+(i.n<=0?' z':'')+'">'+fmtN(i.n)+' <small>'+esc(i.b)+'</small></span>'+
    '<button class="sq" data-act="pick" data-i="'+ix+'" data-d="-1" aria-label="Çıkar"'+(i.n<=0?' disabled':'')+'>−</button><button class="sq p" data-act="pick" data-i="'+ix+'" data-d="1" aria-label="Ekle">+</button>'+
    (i.n<=0?'<button class="sq" data-act="rmurun" data-i="'+ix+'" title="Ürünü kutudan kaldır" aria-label="Kaldır">🗑</button>':'')+'</div>'}).join('')
    :'<p class="sub">Bu kutuda henüz ürün yok. Aşağıda yeni ürün adını ve miktarını yazıp <b>+ Ekle</b>’ye basın.</p>';
  var sel=$('#h-urun'),cur=ui.selU||sel.value;
  sel.innerHTML=it.map(function(i){return '<option value="'+esc(i.u)+'">'+esc(i.u)+' ('+fmtN(i.n)+' '+esc(i.b)+')</option>'}).join('')+'<option value="__new">＋ Yeni ürün…</option>';
  sel.value=(cur&&it.some(function(i){return i.u===cur}))?cur:(cur==='__new'||!it.length?'__new':it[0].u);
  ui.selU=null;onUrunSel();if(!ui.upl)renderDocs();
  sb.from(TH).select('*').eq('adres',k).order('zaman',{ascending:false}).limit(60).then(function(r){var el=$('#bm-hist');if(el&&ui.box===k)el.innerHTML=r.error?'Geçmiş okunamadı.':histHtml(r.data,false)});
}
function boxItem(ix){var d=S.boxes[ui.box]||{items:[]};return d.items[+ix]}
function doMove(dir,btn){
  var k=ui.box,sel=$('#h-urun').value,u,b=null,isNew=sel==='__new';
  if(isNew){u=$('#h-yeni').value.trim().toLocaleUpperCase('tr');b=$('#h-birim').value.trim()||'ad';if(!u){toast('Ürün adını yazın');$('#h-yeni').focus();return}}else u=sel;
  var m=parseNum($('#h-mik').value);if(!(m>0)){toast('Miktarı girin');$('#h-mik').focus();return}
  var it=(S.boxes[k]||{items:[]}).items.find(function(i){return i.u===u});
  if(dir<0&&(!it||m>it.n)){toast('Yetersiz stok: kutuda '+(it?fmtN(it.n)+' '+it.b:'bu ürün yok'));return}
  var acik=$('#h-acik').value.trim();
  btn.disabled=true;
  rpc('stok_hareket',{p_adres:k,p_urun:u,p_miktar:dir*m,p_aciklama:acik||null,p_birim:b}).then(function(bal){
    toast((dir>0?'+':'−')+fmtN(m)+' '+u+' · kalan '+fmtN(bal));
    $('#h-mik').value='';$('#h-acik').value='';if(isNew)$('#h-yeni').value='';
    var d=S.boxes[k]||(S.boxes[k]={items:[]});if(it)it.n=+bal;else{d.items.push({u:u,n:+bal,b:b||'ad'});d.items.sort(function(p,q){return p.u.localeCompare(q.u,'tr')})}
    ui.selU=u;redraw();refreshData();
  }).catch(function(e){toast(errMsg(e))}).then(function(){btn.disabled=false;onUrunSel()});
}
function saveInfo(){
  var k=ui.box,d=S.boxes[k]||(S.boxes[k]={items:[]});
  d.note=$('#e-note').value.trim();if($('#e-cust')){d.cust=$('#e-cust').value.trim();d.appr=$('#e-appr').value}
  track(sb.from(TB).upsert(infoRow(k,d))).then(function(){toast('Bilgiler kaydedildi');logH(k,'bilgi',[d.cust&&('Müşteri: '+d.cust),d.appr&&('Onay: '+fmtDate(d.appr)),d.note].filter(Boolean).join(' · '));redraw()}).catch(fail);
}
function doTasi(){
  var k=ui.box,v=$('#e-move').value.trim(),p=parseCode(v);
  if(!p){toast('Geçersiz adres: '+v+' (örn. B-01-05-01)');return}
  if(p.code===k)return;
  if(S.boxes[p.code]&&S.boxes[p.code].items.length){toast(p.code+' dolu — önce boşaltın.');return}
  rpc('kutu_tasi',{p_kaynak:k,p_hedef:p.code}).then(function(){toast(k+' → '+p.code+' taşındı');closeModal();refreshData().then(function(){goTo(p.c,p.s,p.code)})}).catch(function(e){toast(errMsg(e))});
}
function doBosalt(){
  var k=ui.box,d=S.boxes[k]||{items:[]};
  if(!window.confirm(k+' kutusu boşaltılacak.\n'+(d.items.length?d.items.length+' ürünün tamamı çıkış olarak kaydedilecek.\n':'')+'Emin misiniz?'))return;
  rpc('kutu_bosalt',{p_adres:k,p_aciklama:'Kutu boşaltıldı'}).then(function(){toast(k+' boşaltıldı');closeModal();refreshData()}).catch(function(e){toast(errMsg(e))});
}
function openSettings(){
  var C=S.cfg,A=cab('A'),B=cab('B');
  modal('<h3>Ayarlar</h3><div class="sub">Raf yapısı kodlamayı belirler. Mevcut kayıtlar silinmez; aralık dışına düşen adresler gizlenir.</div>'+
  '<div class="two"><label>Dolap A konumu<input id="s-an" value="'+esc(A.name)+'"></label><label>Dolap A içeriği<input id="s-ad" value="'+esc(A.desc)+'"></label></div>'+
  '<div class="two"><label>Dolap B konumu<input id="s-bn" value="'+esc(B.name)+'"></label><label>Dolap B içeriği<input id="s-bd" value="'+esc(B.desc)+'"></label></div>'+
  '<label>Raf sayısı (her iki dolap)<input id="s-sh" type="number" min="4" max="99" value="'+C.shelves+'"></label>'+
  '<div class="two"><label>A · raf başına satır (koli)<input id="s-arw" type="number" min="1" max="20" value="'+RW('A')+'"></label><label>A · satır başına sıra<input id="s-adp" type="number" min="1" max="6" value="'+DP('A')+'"></label></div>'+
  '<div class="two"><label>B · raf başına satır<input id="s-brw" type="number" min="1" max="20" value="'+RW('B')+'"></label><label>B · satır başına sıra<input id="s-bdp" type="number" min="1" max="6" value="'+DP('B')+'"></label></div>'+
  '<div class="btns"><button class="ghost" data-act="export">⬇ CSV yedek</button><button class="ghost" data-act="labels">▦ QR etiketleri</button><span style="flex:1"></span><button class="ghost" data-act="close">Vazgeç</button><button class="pri" data-act="savecfg">Kaydet</button></div>'+
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
function csvLine(r){return r.map(function(v){v=String(v==null?'':v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(';')}
function toCSV(){
  var rows=[['Adres','Dolap','Raf','Satır','Sıra','Ürün','Adet','Birim','Müşteri','Onay tarihi','Not']];
  sortKeys(Object.keys(S.boxes)).forEach(function(k){if(!filled(k))return;var d=S.boxes[k],x=k.split('-');
    var its=d.items.length?d.items:[{u:'',n:'',b:''}];
    its.forEach(function(i){rows.push([k,x[0],x[1],x[2],x[3],i.u,i.n===''?'':String(i.n).replace('.',','),i.b,d.cust||'',fmtDate(d.appr),d.note||''])})});
  return rows.map(csvLine).join('\r\n');
}
function download(csv,fn){
  try{var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));a.download=fn;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},800);toast('CSV indirildi')}catch(e){showCSV(csv)}
}
function today(){return new Date().toISOString().slice(0,10)}
function exportCSV(){download(toCSV(),'kardex-stok-'+today()+'.csv')}
function exportHist(){
  track(sb.from(TH).select('*').order('zaman',{ascending:false}).limit(20000)).then(function(r){
    var rows=[['Tarih','Adres','Ürün','İşlem','Miktar','Kalan','Açıklama','Kullanıcı']];
    r.data.forEach(function(x){rows.push([new Date(x.zaman).toLocaleString('tr-TR'),x.adres,x.urun||'',x.islem,x.miktar==null?'':String(x.miktar).replace('.',','),x.bakiye==null?'':String(x.bakiye).replace('.',','),x.detay||'',x.kullanici||''])});
    download(rows.map(csvLine).join('\r\n'),'kardex-hareketler-'+today()+'.csv');
  }).catch(fail);
}
function showCSV(csv){
  modal('<h3>CSV verisi</h3><div class="sub">Kopyalayıp Excel’e yapıştırabilir ya da .csv olarak kaydedebilirsiniz.</div><textarea id="csvbox" rows="10" style="text-transform:none" readonly>'+esc(csv)+'</textarea><div class="btns"><span style="flex:1"></span><button class="ghost" data-act="close">Kapat</button><button class="pri" data-act="copycsv">Kopyala</button></div>');
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
  var file=e.target.files[0];if(!file)return;var rd=new FileReader();
  rd.onload=function(){
    var rows=parseCSV(String(rd.result));if(rows.length<2){toast('Dosya boş');return}
    var h=rows[0].map(norm);function ix(){for(var i=0;i<arguments.length;i++){var j=h.indexOf(arguments[i]);if(j>=0)return j}return -1}
    var ia=ix('ADRES'),iu=ix('URUN','ICERIK','PARCA'),iq=ix('ADET','MIKTAR'),ib=ix('BIRIM'),ic=ix('MUSTERI'),id=ix('ONAY TARIHI','ONAY'),inn=ix('NOT');
    if(ia<0||iu<0||iq<0){toast('Başlıklarda Adres, Ürün ve Adet sütunları olmalı');return}
    rows.shift();
    var jobs=[],info={},bad=0;
    rows.forEach(function(rw){if(!rw.join('').trim())return;var p=parseCode(rw[ia]);if(!p){bad++;return}
      var u=String(rw[iu]||'').trim().toLocaleUpperCase('tr'),n=parseNum(rw[iq]);
      if(u){if(!(n>=0)){bad++;return}jobs.push({p_adres:p.code,p_urun:u,p_adet:n,p_aciklama:'CSV sayım',p_birim:ib>=0&&rw[ib]?rw[ib].trim():null})}
      var o={note:inn>=0?(rw[inn]||'').trim():'',cust:ic>=0?(rw[ic]||'').trim():'',appr:id>=0&&rw[id]?isoDate(rw[id]):''};
      if(o.note||o.cust||o.appr)info[p.code]=o});
    var ik=Object.keys(info);
    if(!jobs.length&&!ik.length){toast('İçe aktarılacak satır yok');return}
    if(!window.confirm(jobs.length+' ürün satırı işlenecek. Adetler dosyadaki değere ayarlanacak ve farklar “sayım” hareketi olarak kaydedilecek.'+(bad?'\n'+bad+' hatalı satır atlanacak.':'')+'\nDevam edilsin mi?'))return;
    var done=0,errs=0,i=0;
    function next(){if(i>=jobs.length)return Promise.resolve();var j=jobs[i++];return sb.rpc('stok_ayarla',j).then(function(r){if(r.error)errs++;done++;if(done%10===0)toast('İşleniyor… '+done+'/'+jobs.length);return next()})}
    busy++;renderStat();
    Promise.all([next(),next(),next(),next()]).then(function(){
      return ik.length?sb.from(TB).upsert(ik.map(function(k){return infoRow(k,info[k])})):null;
    }).then(function(){busy--;toast(done-errs+' satır işlendi'+(errs?', '+errs+' hata':'')+(bad?', '+bad+' satır atlandı':''));logH('-','içe aktarma',(done-errs)+' satır');refreshData()},function(e){busy--;fail(e)});
  };rd.readAsText(file,'utf-8');e.target.value='';
}

/* ---------- QR ---------- */
function appUrl(k){return location.origin+location.pathname.replace(/index\.html$/,'')+'#k='+k}
/* Gömülü QR üretici (bayt modu, hata düzeltme M) — harici kütüphane gerekmez */
var QRX=(function(){
  var ECC=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28];
  var NB=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49];
  function raw(v){var r=(16*v+128)*v+64;if(v>=2){var n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r}
  function dataCw(v){return Math.floor(raw(v)/8)-ECC[v]*NB[v]}
  function mul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z}
  function divisor(d){var r=[],i,j;for(i=0;i<d-1;i++)r.push(0);r.push(1);var root=1;for(i=0;i<d;i++){for(j=0;j<r.length;j++){r[j]=mul(r[j],root);if(j+1<r.length)r[j]^=r[j+1]}root=mul(root,2)}return r}
  function rem(data,div){var r=div.map(function(){return 0});data.forEach(function(b){var f=b^r.shift();r.push(0);div.forEach(function(c,i){r[i]^=mul(c,f)})});return r}
  function utf8(s){var b=[],e=unescape(encodeURIComponent(s));for(var i=0;i<e.length;i++)b.push(e.charCodeAt(i));return b}
  function bit(x,i){return ((x>>>i)&1)!==0}
  function alignPos(v){if(v===1)return [];var num=Math.floor(v/7)+2,step=(v===32)?26:Math.ceil((v*4+4)/(num*2-2))*2,r=[6];for(var p=v*4+10;r.length<num;p-=step)r.splice(1,0,p);return r}
  function encode(text){
    var data=utf8(text),v,bits=[],i,j;
    for(v=1;v<=40;v++)if(4+(v<=9?8:16)+data.length*8<=dataCw(v)*8)break;
    if(v>40)throw new Error('QR verisi çok uzun');
    function app(val,len){for(var k=len-1;k>=0;k--)bits.push((val>>>k)&1)}
    app(4,4);app(data.length,v<=9?8:16);data.forEach(function(b){app(b,8)});
    var cap=dataCw(v)*8;app(0,Math.min(4,cap-bits.length));app(0,(8-bits.length%8)%8);
    for(var pd=0xEC;bits.length<cap;pd^=0xEC^0x11)app(pd,8);
    var dc=[];for(i=0;i<bits.length;i+=8){var by=0;for(j=0;j<8;j++)by=(by<<1)|bits[i+j];dc.push(by)}
    var nb=NB[v],ecl=ECC[v],rc=Math.floor(raw(v)/8),ns=nb-rc%nb,sl=Math.floor(rc/nb),dv=divisor(ecl),blocks=[],k=0;
    for(i=0;i<nb;i++){var d=dc.slice(k,k+sl-ecl+(i<ns?0:1));k+=d.length;var e=rem(d,dv);if(i<ns)d.push(0);blocks.push(d.concat(e))}
    var cw=[];for(i=0;i<blocks[0].length;i++)for(j=0;j<blocks.length;j++)if(i!==sl-ecl||j>=ns)cw.push(blocks[j][i]);
    /* matris */
    var n=v*4+17,M=[],F=[];for(i=0;i<n;i++){M.push([]);F.push([]);for(j=0;j<n;j++){M[i].push(false);F[i].push(false)}}
    function set(x,y,dk){M[y][x]=dk;F[y][x]=true}
    for(i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
    function finder(x,y){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var dist=Math.max(Math.abs(dx),Math.abs(dy)),xx=x+dx,yy=y+dy;if(xx>=0&&xx<n&&yy>=0&&yy<n)set(xx,yy,dist!==2&&dist!==4)}}
    finder(3,3);finder(n-4,3);finder(3,n-4);
    var al=alignPos(v),na=al.length;
    for(i=0;i<na;i++)for(j=0;j<na;j++){if((i===0&&j===0)||(i===0&&j===na-1)||(i===na-1&&j===0))continue;for(var ay=-2;ay<=2;ay++)for(var ax=-2;ax<=2;ax++)set(al[i]+ax,al[j]+ay,Math.max(Math.abs(ax),Math.abs(ay))!==1)}
    function fmt(mask){
      var dd=(0<<3)|mask,r=dd;for(var q=0;q<10;q++)r=(r<<1)^((r>>>9)*0x537);
      var b=((dd<<10)|r)^0x5412,t;
      for(t=0;t<=5;t++)set(8,t,bit(b,t));
      set(8,7,bit(b,6));set(8,8,bit(b,7));set(7,8,bit(b,8));
      for(t=9;t<15;t++)set(14-t,8,bit(b,t));
      for(t=0;t<8;t++)set(n-1-t,8,bit(b,t));
      for(t=8;t<15;t++)set(8,n-15+t,bit(b,t));
      set(8,n-8,true);
    }
    fmt(0);
    if(v>=7){var vr=v;for(i=0;i<12;i++)vr=(vr<<1)^((vr>>>11)*0x1F25);var vb=(v<<12)|vr;for(i=0;i<18;i++){var c=bit(vb,i),a=n-11+i%3,bb=Math.floor(i/3);set(a,bb,c);set(bb,a,c)}}
    var bi=0;
    for(var right=n-1;right>=1;right-=2){if(right===6)right=5;
      for(var vert=0;vert<n;vert++)for(j=0;j<2;j++){var x=right-j,up=((right+1)&2)===0,y=up?n-1-vert:vert;
        if(!F[y][x]&&bi<cw.length*8){M[y][x]=bit(cw[bi>>>3],7-(bi&7));bi++}}}
    function applyMask(m){for(var y=0;y<n;y++)for(var x=0;x<n;x++){var inv;switch(m){
      case 0:inv=(x+y)%2===0;break;case 1:inv=y%2===0;break;case 2:inv=x%3===0;break;case 3:inv=(x+y)%3===0;break;
      case 4:inv=(Math.floor(x/3)+Math.floor(y/2))%2===0;break;case 5:inv=x*y%2+x*y%3===0;break;
      case 6:inv=(x*y%2+x*y%3)%2===0;break;default:inv=((x+y)%2+x*y%3)%2===0}
      if(!F[y][x]&&inv)M[y][x]=!M[y][x]}}
    function penalty(){var p=0,x,y,run,dark=0;
      for(y=0;y<n;y++){run=1;for(x=1;x<n;x++){if(M[y][x]===M[y][x-1]){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}}
      for(x=0;x<n;x++){run=1;for(y=1;y<n;y++){if(M[y][x]===M[y-1][x]){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}}
      for(y=0;y<n-1;y++)for(x=0;x<n-1;x++){var cc=M[y][x];if(cc===M[y][x+1]&&cc===M[y+1][x]&&cc===M[y+1][x+1])p+=3}
      for(y=0;y<n;y++)for(x=0;x<n;x++)if(M[y][x])dark++;
      p+=Math.floor(Math.abs(dark*20-n*n*10)/(n*n))*10;return p}
    var best=0,bp=1e9;
    for(var m=0;m<8;m++){applyMask(m);fmt(m);var pp=penalty();if(pp<bp){bp=pp;best=m}applyMask(m)}
    applyMask(best);fmt(best);
    return {size:n,version:v,mask:best,isDark:function(r,c){return M[r][c]}};
  }
  return {encode:encode};
})();
function qrSvg(text,cls){
  var q;try{q=QRX.encode(text)}catch(e){return '<div class="noqr">QR oluşturulamadı: '+esc(errMsg(e))+'</div>'}
  var n=q.size,m=3,d='';
  for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q.isDark(r,c))d+='M'+(c+m)+' '+(r+m)+'h1v1h-1z';
  var z=n+2*m;return '<svg class="'+(cls||'qr')+'" viewBox="0 0 '+z+' '+z+'" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="'+z+'" height="'+z+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';
}
function codeFromText(t){var m=/([ABab])[-_\s]?(\d{2})[-_\s]?(\d{2})[-_\s]?(\d{2})(?!\d)/.exec(String(t||''));return m?parseCode(m[1].toUpperCase()+'-'+m[2]+'-'+m[3]+'-'+m[4]):null}
function checkHash(){var m=/^#k=([^&]+)/.exec(location.hash);if(!m)return;var p=codeFromText(decodeURIComponent(m[1]));try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}if(p)openBox(p.code)}
function openBox(k,note){
  var p=parseCode(k);if(!p)return;
  if(timer){clearTimeout(timer);timer=null;anim=null}
  ui.view='k';ui.c=p.c;ui.cur[p.c]=p.s;ui.hl=k;ui.col=null;saveUi();renderMain();
  openEdit(k);if(note){var d=$('.dlg');if(d)d.insertAdjacentHTML('afterbegin',note)}
}
/* tarayıcı */
var scan={on:false,stream:null,raf:0,det:null,cv:null,last:0};
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=function(){rej(new Error('QR okuyucu yüklenemedi'))};document.head.appendChild(s)})}
function openScanner(){
  closeModal();
  var tgt=ui.find;
  $('#scanner').innerHTML='<div class="scn"><video id="scv" playsinline muted autoplay></video><div class="scf"><i></i></div>'+
    '<div class="sct" id="sct">'+(tgt?'Doğrulanacak kutu: <b>'+tgt+'</b><br>':'')+'Kutu etiketindeki QR kodu çerçeveye getirin</div>'+
    '<button class="scx" data-act="scanclose">✕ Kapat</button>'+
    '<form class="scm" id="scm"><input id="scin" placeholder="veya kodu yazın: A-01-05-01" autocapitalize="characters" autocomplete="off"><button class="pri">Aç</button></form></div>';
  $('#scm').addEventListener('submit',function(e){e.preventDefault();var p=codeFromText($('#scin').value);if(p)onScan(p.code);else toast('Geçersiz kod (örn. A-01-05-01)')});
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){$('#sct').innerHTML='Bu tarayıcı kamerayı desteklemiyor. Kodu aşağıya yazabilirsiniz.';return}
  scan.on=true;scan.det=null;
  var detP=('BarcodeDetector' in window)?Promise.resolve(BarcodeDetector.getSupportedFormats()).then(function(f){if(f.indexOf('qr_code')>=0)scan.det=new BarcodeDetector({formats:['qr_code']})}).catch(function(){}):Promise.resolve();
  detP.then(function(){return (scan.det||window.jsQR)?null:loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js')})
    .then(function(){return navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false})})
    .then(function(st){if(!scan.on){st.getTracks().forEach(function(t){t.stop()});return}scan.stream=st;var v=$('#scv');v.srcObject=st;return v.play()})
    .then(function(){if(scan.on)tick()})
    .catch(function(e){var el=$('#sct');if(el)el.innerHTML='Kamera açılamadı: '+esc(e&&e.name==='NotAllowedError'?'kamera izni verilmedi (tarayıcı ayarlarından izin verin)':errMsg(e))+'<br>Kodu aşağıya yazabilirsiniz.'});
}
function tick(){
  if(!scan.on)return;
  var v=$('#scv'),now=Date.now();
  if(v&&v.readyState>=2&&now-scan.last>160){scan.last=now;
    if(scan.det){scan.det.detect(v).then(function(r){if(scan.on&&r&&r[0])hit(r[0].rawValue)}).catch(function(){})}
    else if(window.jsQR&&v.videoWidth){var w=Math.min(720,v.videoWidth),h=Math.round(v.videoHeight*w/v.videoWidth);
      scan.cv=scan.cv||document.createElement('canvas');scan.cv.width=w;scan.cv.height=h;
      var cx=scan.cv.getContext('2d',{willReadFrequently:true});cx.drawImage(v,0,0,w,h);
      var r=jsQR(cx.getImageData(0,0,w,h).data,w,h,{inversionAttempts:'dontInvert'});if(r&&r.data)hit(r.data)}
  }
  scan.raf=requestAnimationFrame(tick);
}
function hit(txt){var p=codeFromText(txt);if(!p){var el=$('#sct');if(el)el.textContent='Bu QR bir KARDEX kutusuna ait değil';return}onScan(p.code)}
function stopScanner(){scan.on=false;cancelAnimationFrame(scan.raf);if(scan.stream)scan.stream.getTracks().forEach(function(t){t.stop()});scan.stream=null;var s=$('#scanner');if(s)s.innerHTML=''}
function buzz(p){try{if(navigator.vibrate)navigator.vibrate(p)}catch(e){}}
function onScan(k){
  stopScanner();
  var p=parseCode(k),tgt=ui.find;
  if(tgt){
    if(k===tgt){ui.find=null;buzz(80);openBox(k,'<div class="vok">✓ Doğru kutu</div>')}
    else{buzz([120,80,120]);modal('<div class="vbad"><b>✗ Yanlış kutu!</b><div>Okutulan: <span class="code '+p.c+'">'+k+'</span></div><div>Aranan: <span class="code '+tgt[0]+'">'+tgt+'</span></div></div><div class="btns"><button class="ghost" data-act="scan">Tekrar okut</button><span style="flex:1"></span><button class="ghost" data-act="openk" data-k="'+k+'">Okutulanı aç</button></div>')}
    return;
  }
  buzz(80);openBox(k);
}
/* etiketler */
var FMT={a4_24:{ad:'A4 · 24’lü (70×37 mm)',page:'A4',cols:3,rows:8,w:70,h:37},a4_14:{ad:'A4 · 14’lü (105×42,3 mm)',page:'A4',cols:2,rows:7,w:105,h:42.3},a4_40:{ad:'A4 · 40’lı (52,5×29,7 mm)',page:'A4',cols:4,rows:10,w:52.5,h:29.7},t50:{ad:'Termal etiket 50×30 mm',page:'50mm 30mm',cols:1,rows:1,w:50,h:30},t100:{ad:'Termal etiket 100×50 mm',page:'100mm 50mm',cols:1,rows:1,w:100,h:50}};
function getFmt(){try{return localStorage.getItem('kardex-etiket')||'a4_24'}catch(e){return 'a4_24'}}
function fmtOptions(){var cur=getFmt();return Object.keys(FMT).map(function(k){return '<option value="'+k+'"'+(k===cur?' selected':'')+'>'+FMT[k].ad+'</option>'}).join('')}
function lblHtml(k,f,withC){
  var p=parseCode(k),d=S.boxes[k]||{items:[]},q=f.h-4,tw=f.w-q-6,fs=Math.min(f.h*0.17,tw/6.4);
  return '<div class="lbl"><div class="lqw" style="width:'+q+'mm;height:'+q+'mm">'+qrSvg(appUrl(k),'lq')+'</div><div class="lt">'+
    '<div class="lc" style="font-size:'+fs.toFixed(2)+'mm">'+k+'</div>'+
    '<div class="ld" style="font-size:'+(Math.max(2,fs*0.42)).toFixed(2)+'mm"><b>KARDEX '+p.c+'</b> · '+esc(cab(p.c).desc)+'<br>Raf '+pad(p.s)+' · Satır '+pad(p.r)+' · Sıra '+pad(p.d)+' ('+siraName(p.d,p.c)+')</div>'+
    (withC&&d.items.length?'<div class="li2" style="font-size:'+(Math.max(1.9,fs*0.38)).toFixed(2)+'mm">'+d.items.slice(0,3).map(function(i){return esc(i.u)}).join(' · ')+(d.items.length>3?' …':'')+'</div>':'')+
    '</div></div>';
}
function printLabels(codes,fk,withC){
  if(!codes.length){toast('Yazdırılacak etiket yok');return}
  var f=FMT[fk]||FMT.a4_24,A4=f.page==='A4',per=f.cols*f.rows,html='';
  try{localStorage.setItem('kardex-etiket',fk)}catch(e){}
  var pad2=A4?((297-f.rows*f.h)/2).toFixed(2)+'mm '+((210-f.cols*f.w)/2).toFixed(2)+'mm':'0';
  for(var i=0;i<codes.length;i+=per)html+='<div class="sheet" style="width:'+(A4?210:f.w)+'mm;height:'+(A4?297:f.h)+'mm;padding:'+pad2+';grid-template-columns:repeat('+f.cols+','+f.w+'mm);grid-auto-rows:'+f.h+'mm">'+codes.slice(i,i+per).map(function(k){return lblHtml(k,f,withC)}).join('')+'</div>';
  $('#print').innerHTML=html;$('#pagecss').textContent='@page{size:'+f.page+';margin:0}';
  closeModal();document.body.classList.add('printing');
  setTimeout(function(){window.print();setTimeout(function(){document.body.classList.remove('printing')},800)},250);
}
window.addEventListener('afterprint',function(){document.body.classList.remove('printing')});
function openQr(k){
  var p=parseCode(k);
  modal('<div class="mh"><h3><span class="code '+p.c+'">'+k+'</span> QR etiketi</h3><button class="x" data-act="close" aria-label="Kapat">✕</button></div>'+
  '<div class="qrbig">'+qrSvg(appUrl(k))+'<div><div class="code big '+p.c+'">'+k+'</div><div class="sub">'+describe(p)+'</div></div></div>'+
  '<div class="sub">Bu QR, uygulamadaki “QR Okut” ile ya da telefonun kendi kamerasıyla okutulduğunda bu kutuyu doğrudan açar.</div>'+
  '<label>Etiket formatı<select id="lf-fmt">'+fmtOptions()+'</select></label><label class="chk"><input type="checkbox" id="lf-ic"> İçerikteki ürün adlarını etikete yaz</label>'+
  '<div class="btns"><button class="ghost" data-act="openk" data-k="'+k+'">← Kutuya dön</button><span style="flex:1"></span><button class="pri" data-act="printone" data-k="'+k+'">Yazdır</button></div>');
}
function openLabels(){
  modal('<div class="mh"><h3>QR etiketleri yazdır</h3><button class="x" data-act="close" aria-label="Kapat">✕</button></div>'+
  '<div class="two"><label>Dolap<select id="lb-c"><option value="A">KARDEX A</option><option value="B">KARDEX B</option><option value="AB">A ve B</option></select></label><label>Etiket formatı<select id="lb-f">'+fmtOptions()+'</select></label></div>'+
  '<div class="two"><label>Raf (başlangıç)<input id="lb-s1" type="number" min="1" max="'+N()+'" value="1"></label><label>Raf (bitiş)<input id="lb-s2" type="number" min="1" max="'+N()+'" value="'+N()+'"></label></div>'+
  '<label class="chk"><input type="checkbox" id="lb-dolu"> Sadece dolu kutular</label><label class="chk"><input type="checkbox" id="lb-ic"> İçerikteki ürün adlarını etikete yaz</label>'+
  '<div class="find" id="lb-n" style="margin-top:12px"></div><div class="sub">Yazdırma penceresinde ölçek <b>%100 / Gerçek boyut</b> seçili olmalı, kenar boşluğu <b>Yok</b>.</div>'+
  '<div class="btns"><span style="flex:1"></span><button class="ghost" data-act="close">Vazgeç</button><button class="pri" data-act="printlabels">Yazdır</button></div>');
  ['#lb-c','#lb-s1','#lb-s2','#lb-dolu','#lb-f'].forEach(function(x){$(x).addEventListener('change',lbCount);$(x).addEventListener('input',lbCount)});lbCount();
}
function lbCodes(){var cs=$('#lb-c').value.split(''),s1=Math.max(1,+$('#lb-s1').value||1),s2=Math.min(N(),+$('#lb-s2').value||N()),only=$('#lb-dolu').checked,out=[];
  cs.forEach(function(c){for(var s=s1;s<=s2;s++)for(var r=1;r<=RW(c);r++)for(var d=1;d<=DP(c);d++){var k=code(c,s,r,d);if(!only||filled(k))out.push(k)}});return out}
function lbCount(){var n=lbCodes().length,f=FMT[$('#lb-f').value],per=f.cols*f.rows;$('#lb-n').innerHTML='<b>'+n+'</b> etiket'+(per>1?' · '+Math.ceil(n/per)+' sayfa':'')}
/* sayım */
function openCount(){
  var k=ui.box,it=(S.boxes[k]||{items:[]}).items,el=$('#bm-count');
  if(!it.length){toast('Kutuda sayılacak ürün yok');return}
  el.hidden=!el.hidden;if(el.hidden)return;
  el.innerHTML='<div class="cnt"><div class="sec" style="border:0;margin-top:4px;padding-top:0">Sayım — rafta saydığınız miktarı girin</div>'+it.map(function(i,ix){return '<div class="crow"><span class="iu">'+esc(i.u)+'<small>Sistemde: '+fmtN(i.n)+' '+esc(i.b)+'</small></span><input class="cin" data-u="'+esc(i.u)+'" data-n="'+i.n+'" data-ix="'+ix+'" inputmode="decimal" autocomplete="off" placeholder="Sayılan"><span class="cdiff" id="cd'+ix+'"></span></div>'}).join('')+
    '<div class="sub">Boş bırakılan ürün sayılmamış sayılır. Sistemle aynıysa “doğrulandı”, farklıysa fark “sayım” hareketi olarak kaydedilir.</div>'+
    '<div class="btns"><button class="ghost" data-act="sayimall">Hepsi doğru</button><span style="flex:1"></span><button class="pri" data-act="sayimsave">Sayımı kaydet</button></div></div>';
  el.querySelectorAll('.cin').forEach(function(inp){inp.addEventListener('input',function(){cdiff(inp)})});
  el.scrollIntoView({block:'nearest',behavior:'smooth'});el.querySelector('.cin').focus();
}
function cdiff(inp){var v=parseNum(inp.value),n=+inp.dataset.n,d=$('#cd'+inp.dataset.ix);if(!d)return;if(inp.value.trim()===''||isNaN(v)){d.textContent='';d.className='cdiff';return}var df=v-n;d.textContent=df===0?'✓':(df>0?'+':'−')+fmtN(Math.abs(df));d.className='cdiff '+(df===0?'ok':'bad')}
function saveCount(btn){
  var k=ui.box,jobs=[];
  document.querySelectorAll('#bm-count .cin').forEach(function(inp){var v=parseNum(inp.value);if(inp.value.trim()===''||isNaN(v)||v<0)return;jobs.push({j:{p_adres:k,p_urun:inp.dataset.u,p_adet:v,p_aciklama:'Sayım'},eq:v===+inp.dataset.n})});
  if(!jobs.length){toast('Sayılan miktar girilmedi');return}
  btn.disabled=true;var ok=0,fix=0,err=0;
  jobs.reduce(function(pr,x){return pr.then(function(){return rpc('stok_ayarla',x.j).then(function(){if(x.eq)ok++;else fix++},function(){err++})})},Promise.resolve())
    .then(function(){toast('Sayım kaydedildi: '+ok+' doğrulandı'+(fix?', '+fix+' fark düzeltildi':'')+(err?', '+err+' hata':''));var el=$('#bm-count');if(el)el.hidden=true;btn.disabled=false;refreshData()});
}

/* ürün adı düzeltme */
function openRename(ix){
  var k=ui.box,it=boxItem(ix),el=$('#bm-ren');if(!it||!el)return;
  var n=Object.keys(S.boxes).filter(function(x){return (S.boxes[x].items||[]).some(function(i){return i.u===it.u})}).length;
  ui.ren=it.u;el.hidden=false;
  el.innerHTML='<div class="cnt ren"><div class="sec" style="border:0;margin-top:4px;padding-top:0">Ürünü düzelt</div>'+
    '<label>Ürün adı<input id="r-ad" value="'+esc(it.u)+'" autocapitalize="characters" autocomplete="off"></label>'+
    '<div class="two"><label>Birim<input id="r-bi" value="'+esc(it.b)+'" list="birimler"></label><span></span></div>'+
    (n>1?'<label class="chk"><input type="checkbox" id="r-all"> Bu adı <b>&nbsp;'+n+' kutunun&nbsp;</b> hepsinde değiştir</label>':'')+
    '<div class="sub">Bu kutuda yeni adla başka bir ürün varsa adetler birleştirilir. Düzeltme geçmişe kaydedilir.</div>'+
    '<div class="btns"><button class="ghost" data-act="renx">Vazgeç</button><span style="flex:1"></span><button class="pri" data-act="rensave">Kaydet</button></div></div>';
  el.scrollIntoView({block:'nearest',behavior:'smooth'});var a=$('#r-ad');a.focus();a.select();
}
function closeRename(){var el=$('#bm-ren');if(el){el.hidden=true;el.innerHTML=''}ui.ren=null}
function saveRename(btn){
  var k=ui.box,old=ui.ren,nu=$('#r-ad').value.trim().toLocaleUpperCase('tr'),bi=$('#r-bi').value.trim(),all=!!($('#r-all')&&$('#r-all').checked);
  var it=(S.boxes[k]||{items:[]}).items.find(function(i){return i.u===old});
  if(!it){toast('Ürün bulunamadı');closeRename();return}
  if(!nu){toast('Ürün adı boş olamaz');return}
  if(nu===old&&(!bi||bi===it.b)){closeRename();return}
  var dup=nu!==old&&(S.boxes[k].items||[]).find(function(i){return i.u===nu});
  if(dup&&!window.confirm('Bu kutuda zaten “'+nu+'” var ('+fmtN(dup.n)+' '+dup.b+').\nİki ürün birleştirilecek: toplam '+fmtN(dup.n+it.n)+'.\nDevam edilsin mi?'))return;
  btn.disabled=true;
  rpc('urun_ad_degistir',{p_adres:k,p_eski:old,p_yeni:nu,p_birim:bi||null,p_tumu:all}).then(function(n){
    toast('Düzeltildi'+(n>1?' ('+n+' kutuda)':'')+': '+nu);closeRename();ui.selU=nu;refreshData();
  }).catch(function(e){btn.disabled=false;toast(errMsg(e))});
}
/* ürün dokümanları */
var DEXT=/\.(jpe?g|png|webp|heic|heif|gif|pdf|xlsx?|xlsm|csv|docx?|txt)$/i;
function docKind(d){var n=(d.ad||'').toLowerCase();if(/\.(jpe?g|png|webp|gif|heic|heif)$/.test(n)||/^image\//.test(d.tur||''))return 'img';if(/\.pdf$/.test(n))return 'pdf';if(/\.(xlsx?|xlsm|csv)$/.test(n))return 'xls';if(/\.docx?$/.test(n))return 'doc';return 'file'}
var DICON={pdf:'📕',xls:'📊',doc:'📄',file:'📎',img:'🖼'};
function fmtSize(b){b=+b||0;return b>=1048576?(b/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(b/1024))+' KB'}
function slugTxt(t,max){return (norm(t).replace(/ /g,'_')||'X').slice(0,max||60)}
function safeName(n){var m=/\.([a-z0-9]+)$/i.exec(n);return slugTxt(n.replace(/\.[^.]+$/,''),60)+'.'+(m?m[1].toLowerCase():'bin')}
function guessType(n){var e=(/\.([a-z0-9]+)$/i.exec(n)||[])[1];e=(e||'').toLowerCase();return {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',pdf:'application/pdf',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xlsm:'application/vnd.ms-excel.sheet.macroEnabled.12',csv:'text/csv',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain'}[e]||'application/octet-stream'}
function findDoc(id){var r=null;Object.keys(S.docs).forEach(function(u){S.docs[u].forEach(function(d){if(String(d.id)===String(id))r=d})});return r}
function openDocs(ix){var it=boxItem(ix);if(!it)return;closeRename();ui.docU=it.u;var el=$('#bm-docs');el.hidden=false;renderDocs();el.scrollIntoView({block:'nearest',behavior:'smooth'})}
function closeDocs(){var el=$('#bm-docs');if(el){el.hidden=true;el.innerHTML=''}ui.docU=null}
function renderDocs(){
  var el=$('#bm-docs');if(!el||el.hidden||!ui.docU)return;
  var u=ui.docU,ds=S.docs[u]||[],nb=Object.keys(S.boxes).filter(function(x){return (S.boxes[x].items||[]).some(function(i){return i.u===u})}).length;
  el.innerHTML='<div class="cnt docs"><div class="mh"><div class="sec" style="flex:1;border:0;margin:4px 0 6px;padding:0">📎 Dokümanlar · '+esc(u)+'</div><button class="x" data-act="docsx" aria-label="Kapat">✕</button></div>'+
    '<div id="dlist">'+(ds.length?ds.map(function(d){var k=docKind(d);return '<div class="drow"><a class="dth" data-yol="'+esc(d.yol)+'" target="_blank" rel="noopener">'+(k==='img'?'<span class="ph">🖼</span>':'<span class="ph">'+DICON[k]+'</span>')+'</a><div class="dmeta"><a class="dname" data-yol="'+esc(d.yol)+'" target="_blank" rel="noopener">'+esc(d.ad)+'</a><small>'+fmtSize(d.boyut)+' · '+esc((d.yukleyen||'').split('@')[0])+' · '+new Date(d.zaman).toLocaleDateString('tr-TR')+(d.adres?' · '+esc(d.adres):'')+'</small></div><button class="sq" data-act="docdel" data-id="'+d.id+'" aria-label="Sil">🗑</button></div>'}).join(''):'<p class="sub">Bu ürüne henüz doküman eklenmedi.</p>')+'</div>'+
    '<div class="btns"><label class="ghost upl">📷 Fotoğraf çek<input type="file" accept="image/*" capture="environment" id="d-cam" hidden></label><label class="ghost upl">📁 Dosya seç<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.pdf,.xls,.xlsx,.xlsm,.csv,.doc,.docx,.txt,image/*" id="d-file" hidden></label></div>'+
    '<div id="d-prog" class="sub"></div><div class="sub">JPG, PNG, PDF, Excel, Word · dosya başına en fazla 20 MB. Doküman ürüne bağlıdır'+(nb>1?'; bu ürünün bulunduğu <b>'+nb+' kutuda</b> da görünür':'')+'.</div></div>';
  ['#d-cam','#d-file'].forEach(function(x){$(x).addEventListener('change',function(e){uploadDocs(e.target.files);e.target.value=''})});
  if(!ds.length)return;
  sb.storage.from(BK).createSignedUrls(ds.map(function(d){return d.yol}),3600).then(function(r){
    if(r.error||!r.data)return;var map={};r.data.forEach(function(x){if(x.signedUrl)map[x.path]=x.signedUrl});
    el.querySelectorAll('[data-yol]').forEach(function(a){var url=map[a.dataset.yol];if(!url)return;a.href=url;
      if(a.classList.contains('dth')){var d=ds.find(function(x){return x.yol===a.dataset.yol});if(d&&docKind(d)==='img'&&!/\.hei[cf]$/i.test(d.ad))a.innerHTML='<img src="'+url+'" alt="" loading="lazy">'}});
  });
}
function shrink(f){
  if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size<700*1024)return Promise.resolve(null);
  return new Promise(function(res){var img=new Image(),url=URL.createObjectURL(f);
    img.onload=function(){var sc=Math.min(1,2000/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);
      var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);
      cv.toBlob(function(b){res(b&&b.size<f.size?b:null)},'image/jpeg',0.85)};
    img.onerror=function(){URL.revokeObjectURL(url);res(null)};img.src=url});
}
function uploadDocs(list){
  var u=ui.docU,k=ui.box,files=[].slice.call(list||[]);if(!files.length||!u)return;
  var bad=files.filter(function(f){return !DEXT.test(f.name)||f.size>20*1024*1024});
  if(bad.length)toast(bad.map(function(f){return f.name}).join(', ')+': desteklenmeyen tür ya da 20 MB üstü');
  files=files.filter(function(f){return bad.indexOf(f)<0});if(!files.length)return;
  ui.upl=true;var done=0,i=0;function prog(t){var p=$('#d-prog');if(p)p.innerHTML=t}
  files.reduce(function(chain,f){return chain.then(function(){i++;prog('⏳ Yükleniyor '+i+'/'+files.length+': <b>'+esc(f.name)+'</b>');
    return shrink(f).then(function(sm){
      var blob=sm||f,nm=sm?f.name.replace(/\.[^.]+$/,'')+'.jpg':f.name,typ=sm?'image/jpeg':(f.type||guessType(f.name));
      var yol=slugTxt(u,50)+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,6)+'-'+safeName(nm);
      return track(sb.storage.from(BK).upload(yol,blob,{contentType:typ,upsert:false}))
        .then(function(){return track(sb.from(TD).insert({urun:u,adres:k,yol:yol,ad:nm,tur:typ,boyut:blob.size,yukleyen:user&&user.email}))})
        .then(function(){done++;logH(k,'doküman eklendi',nm,u)});
    }).catch(function(e){toast(f.name+': '+errMsg(e))});
  })},Promise.resolve()).then(function(){ui.upl=false;prog('');if(done)toast('✓ '+done+' doküman yüklendi');refreshData()});
}
function delDoc(id){
  var d=findDoc(id);if(!d)return;
  if(!window.confirm('“'+d.ad+'” dokümanı silinsin mi?'))return;
  track(sb.from(TD).delete().eq('id',d.id))
    .then(function(){return sb.from(TD).select('id').eq('yol',d.yol).limit(1)})
    .then(function(r){if(r&&!r.error&&r.data&&!r.data.length)return sb.storage.from(BK).remove([d.yol])})
    .then(function(){toast('Doküman silindi');logH(ui.box||d.adres||'-','doküman silindi',d.ad,d.urun);refreshData()}).catch(fail);
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
  else if(a==='mv')doMove(+el.dataset.d,el);
  else if(a==='pick'){var it=boxItem(el.dataset.i);if(it){$('#h-urun').value=it.u;onUrunSel();var bt=$(+el.dataset.d<0?'.bout':'.bin');document.querySelectorAll('.mv .btns button').forEach(function(x){x.classList.remove('hint')});bt.classList.add('hint');var mi=$('#h-mik');mi.placeholder=(+el.dataset.d<0?'Çıkarılacak':'Eklenecek')+' miktar';mi.focus();mi.scrollIntoView({block:'center',behavior:'smooth'})}}
  else if(a==='rmurun'){var it2=boxItem(el.dataset.i);if(it2)rpc('urun_kaldir',{p_adres:ui.box,p_urun:it2.u}).then(function(){toast(it2.u+' kaldırıldı');refreshData()}).catch(function(e2){toast(errMsg(e2))})}
  else if(a==='saveinfo')saveInfo();
  else if(a==='tasi')doTasi();
  else if(a==='bosalt')doBosalt();
  else if(a==='exporth')exportHist();
  else if(a==='scan')openScanner();
  else if(a==='scanclose')stopScanner();
  else if(a==='openk'){closeModal();openBox(k)}
  else if(a==='findx'){ui.find=null;renderOpen()}
  else if(a==='qrlabel')openQr(k);
  else if(a==='printone')printLabels([k],$('#lf-fmt').value,$('#lf-ic').checked);
  else if(a==='labels')openLabels();
  else if(a==='printlabels')printLabels(lbCodes(),$('#lb-f').value,$('#lb-ic').checked);
  else if(a==='sayim')openCount();
  else if(a==='ren'){closeDocs();openRename(el.dataset.i)}
  else if(a==='docs')openDocs(el.dataset.i);
  else if(a==='docsx')closeDocs();
  else if(a==='docdel')delDoc(el.dataset.id);
  else if(a==='renx')closeRename();
  else if(a==='rensave')saveRename(el);
  else if(a==='sayimall'){document.querySelectorAll('#bm-count .cin').forEach(function(inp){inp.value=String(+inp.dataset.n).replace('.',',');cdiff(inp)})}
  else if(a==='sayimsave')saveCount(el);
  else if(a==='res'||a==='addr'){p=a==='res'?parseCode(k):parseAddr(el.dataset.a);ui.find=a==='res'?k:null;closeModal();$('#q').value='';renderResults();$('#q').blur();goAddr(p);var t=$('#tabs');if(t)t.scrollIntoView({behavior:'smooth'})}
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
document.body.insertAdjacentHTML('beforeend','<div id="print"></div><style id="pagecss"></style>');
function start(){
  if(started)return;started=true;
  try{var c=JSON.parse(localStorage.getItem(CACHE)||'null');if(c&&c.boxes){S.boxes=c.boxes;S.cfg=normCfg(c.cfg)}}catch(e){}
  clampCur();shell();renderAll();loadAll().then(checkHash);subscribe();
  window.addEventListener('hashchange',function(){if(loaded)checkHash()});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&loaded)refreshData()});
}
if(!CFG.supabaseUrl||!CFG.supabaseAnonKey||/BURAYA/.test(CFG.supabaseUrl+CFG.supabaseAnonKey)||!window.supabase){showSetup()}
else{
  sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  sb.auth.getSession().then(function(r){var ss=r.data&&r.data.session;if(ss){user=ss.user;start()}else showLogin()});
  sb.auth.onAuthStateChange(function(ev,ss){if(ev==='SIGNED_OUT'){user=null;started=false;try{localStorage.removeItem(CACHE)}catch(e){}location.reload()}else if(ss)user=ss.user});
}
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(function(){});
})();
