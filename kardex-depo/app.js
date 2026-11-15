(function(){
var CFG=window.KARDEX_CONFIG||{};
var LSU='kardex-depo-ui-v2',CACHE='kardex-depo-cache-v2';
var DEF={shelves:20,cab:{A:{name:'Sol',desc:'Atölye malzemeleri',rows:8,depth:2,kind:'kasa'},B:{name:'Sağ',desc:'Onaylı ürünler',rows:8,depth:2,kind:'koli'}}};
function normCfg(c){var d=JSON.parse(JSON.stringify(DEF));if(!c)return d;d.shelves=c.shelves||d.shelves;['A','B'].forEach(function(k){if(c.cab&&c.cab[k])for(var x in c.cab[k])d.cab[k][x]=c.cab[k][x]});d.cab.A.kind='kasa';d.cab.B.kind='koli';return d}
var S={cfg:normCfg(),boxes:{}};
var CABS=['A','B'];
var ui={c:'A',cur:{A:1,B:1},view:'k',hl:null,col:null,last:'',box:null,selU:null};
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
var TB='kardex_kutular',TS='kardex_stok',TH='kardex_hareketler';
function fmtN(n){return Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:2})}
function itemTxt(i){return i.u+' — '+fmtN(i.n)+' '+(i.b||'ad')}
function parseNum(v){v=String(v==null?'':v).trim().replace(/\s/g,'');if(!v)return NaN;if(v.indexOf(',')>=0&&v.indexOf('.')>=0)v=v.replace(/\./g,'').replace(',','.');else v=v.replace(',','.');return Number(v)}
function errMsg(e){return (e&&(e.message||e.details||e.hint))||String(e)}
function cacheSave(){try{localStorage.setItem(CACHE,JSON.stringify(S))}catch(e){}}
function track(q){busy++;renderStat();return Promise.resolve(q).then(function(r){busy--;if(r&&r.error)throw r.error;online=true;renderStat();renderBanner();return r},function(e){busy--;renderStat();throw e})}
function fail(e){lastErr=errMsg(e);toast('Hata: '+lastErr);renderStat();renderBanner();refreshData()}
function logH(adres,islem,detay){if(!sb)return;sb.from(TH).insert({adres:adres,islem:islem,detay:detay||null,kullanici:user&&user.email}).then(function(){},function(){})}
function rpc(fn,args){return track(sb.rpc(fn,args)).then(function(r){return r.data})}
function infoRow(k,o){var x=k.split('-');return {adres:k,dolap:x[0],raf:+x[1],satir:+x[2],sira:+x[3],musteri:o.cust||null,onay_tarihi:o.appr||null,notlar:o.note||null,guncelleyen:user&&user.email,guncelleme:new Date().toISOString()}}
function fetchData(){
  return Promise.all([
    sb.from(TB).select('adres,musteri,onay_tarihi,notlar,guncelleyen,guncelleme').limit(10000),
    sb.from(TS).select('*').limit(20000),
    sb.from('kardex_ayarlar').select('ayar').eq('id',1).maybeSingle()
  ]).then(function(r){
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
      '<span class="ht"><b>'+esc(x.urun||x.islem)+'</b>'+(m!=null?' <span class="hm '+(m<0?'neg':'pos')+'">'+(m>0?'+':'−')+fmtN(Math.abs(m))+'</span>'+(x.bakiye!=null?' <span class="hb">→ kalan '+fmtN(x.bakiye)+'</span>':''):(x.detay?' '+esc(x.detay):''))+
      '<small>'+esc(x.islem)+(m!=null&&x.detay?' · '+esc(x.detay):'')+' · <b>'+esc((x.kullanici||'').split('@')[0])+'</b> · '+new Date(x.zaman).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</small></span></div>'}).join('');
}
function renderList(){
  var keys=sortKeys(Object.keys(S.boxes).filter(function(k){return filled(k)&&parseCode(k)}));
  var h='<div class="tools"><button class="ghost" data-act="export">⬇ Stok (CSV)</button><button class="ghost" data-act="exporth">⬇ Hareketler (CSV)</button><button class="ghost" data-act="import">⬆ İçe aktar / sayım</button></div>';
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
function closeModal(){var m=$('#modal');if(m)m.innerHTML='';ui.box=null;ui.selU=null}
function openEdit(k){
  var p=parseCode(k),d=S.boxes[k]||{items:[]},B=p.c==='B';ui.box=k;ui.selU=null;
  modal('<div class="mh"><h3><span class="code '+p.c+'">'+k+'</span> '+(B?'Onaylı ürün kolisi':'Malzeme kasası')+'</h3><button class="x" data-act="close" aria-label="Kapat">✕</button></div><div class="sub">'+describe(p)+'</div>'+
  '<div class="sec">İçerik ve güncel stok</div><div id="bm-items"></div>'+
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
  $('#bm-items').innerHTML=it.length?it.map(function(i,ix){return '<div class="irow"><span class="iu">'+esc(i.u)+(i.by?'<small>'+esc(i.by.split('@')[0])+' · '+new Date(i.at).toLocaleDateString('tr-TR')+'</small>':'')+'</span><span class="iq'+(i.n<=0?' z':'')+'">'+fmtN(i.n)+' <small>'+esc(i.b)+'</small></span>'+
    '<button class="sq" data-act="pick" data-i="'+ix+'" data-d="-1" aria-label="Çıkar"'+(i.n<=0?' disabled':'')+'>−</button><button class="sq p" data-act="pick" data-i="'+ix+'" data-d="1" aria-label="Ekle">+</button>'+
    (i.n<=0?'<button class="sq" data-act="rmurun" data-i="'+ix+'" title="Ürünü kutudan kaldır" aria-label="Kaldır">🗑</button>':'')+'</div>'}).join('')
    :'<p class="sub">Bu kutuda henüz ürün yok. Aşağıda yeni ürün adını ve miktarını yazıp <b>+ Ekle</b>’ye basın.</p>';
  var sel=$('#h-urun'),cur=ui.selU||sel.value;
  sel.innerHTML=it.map(function(i){return '<option value="'+esc(i.u)+'">'+esc(i.u)+' ('+fmtN(i.n)+' '+esc(i.b)+')</option>'}).join('')+'<option value="__new">＋ Yeni ürün…</option>';
  sel.value=(cur&&it.some(function(i){return i.u===cur}))?cur:(cur==='__new'||!it.length?'__new':it[0].u);
  ui.selU=null;onUrunSel();
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
