'use strict';
/* LocalLens app logic (vanilla JS). Data model, sources and verification rules: docs/DATA_AND_SOURCES.md
   Real listings load from data/listings.json. Demo placeholders and landmark names come from data.js. */

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{toast('Could not save in this browser.')}}
};
const SCOPES = {all:Object.keys(CATS),food:['cafe'],restaurants:['restaurant'],shopping:['shopping'],tourism:['tourism'],gems:['gem'],adventure:['adventure','activity']};
const PAGE = 24;
const stById = Object.fromEntries(STATES.map(s=>[s.code,s]));
const ctById = Object.fromEntries(CITIES.map(c=>[c.id,c]));
const hue = s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))%360;return h};

let favs = store.get('ll_favs',[]);
let reviews = store.get('ll_reviews',{});   // only reviews typed by visitors on this device
let loc = store.get('ll_loc',{state:null,city:null});
if((loc.city&&!ctById[loc.city])||(loc.state&&!stById[loc.state]))loc={state:null,city:null};
const state = {};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2800)}

/* ---------- photos (Unsplash registry in data.js; failed loads fall back to the gradient) ---------- */
const IMGURL=(k,w)=>`https://images.unsplash.com/${IMG[k][0]}?fm=jpg&q=70&w=${w}&auto=format&fit=crop`;
const imgTag=(k,w=700)=>k&&IMG[k]?`<img src="${IMGURL(k,w)}" alt="${esc(IMG[k][2])}" loading="lazy" decoding="async" onerror="this.remove()">`:'';
const ptile=o=>`<button class="ptile photo" style="--h:${o.h};--ph:${o.ph||190}px" ${o.a}>${imgTag(o.img,o.w||700)}<span class="pt"><b>${o.t}</b>${o.s?`<small>${o.s}</small>`:''}</span></button>`;

/* ---------- listing model: validation + normalisation ---------- */
const VERIF = {verified:'Verified',sourced:'Imported, not yet verified',unverified:'Details unverified',demo:'Demo listing'};
const VRANK = {verified:0,sourced:1,unverified:2,demo:3};
const safeUrl = u=>{try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:null}catch{return null}};
const inRange = (v,a,b)=>typeof v==='number'&&isFinite(v)&&v>=a&&v<=b;
function normalize(r){
  const errs=[];
  if(!r||typeof r!=='object')return {errs:['record is not an object']};
  if(!r.id||typeof r.id!=='string')errs.push('missing id');
  if(!r.name||!String(r.name).trim())errs.push('missing name');
  if(!CATS[r.category])errs.push('unknown category');
  if(!ctById[r.city])errs.push('unknown city');
  if(!VERIF[r.verification])errs.push('unknown verification status');
  if(r.verification==='verified'&&!r.lastVerified)errs.push('verified record needs lastVerified');
  if(errs.length)return {errs};
  const c=ctById[r.city], st=stById[c.state], ok=inRange(r.lat,-90,90)&&inRange(r.lon,-180,180);
  const im=r.image&&typeof r.image==='object'?r.image:null, lk=r.links||{}, ct=r.contact||{};
  const L={id:r.id,name:String(r.name).trim(),cat:r.category,sub:r.subcategory||'',city:c.id,state:c.state,
    address:r.address?.full||'',description:r.description||'',
    img:im&&im.url&&/^https:/.test(safeUrl(im.url)||'')?{url:safeUrl(im.url),credit:im.credit||'',creditUrl:safeUrl(im.creditUrl)||'',license:im.license||''}:null,
    phone:/^[+\d][\d\s()\-]{5,19}$/.test(ct.phone||'')?ct.phone:'',
    email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ct.email||'')?ct.email:'',
    links:Object.fromEntries(['website','instagram','facebook','x','youtube'].map(k=>[k,safeUrl(lk[k])]).filter(e=>e[1])),
    lat:ok?r.lat:null,lon:ok?r.lon:null,price:[1,2,3].includes(r.priceLevel)?r.priceLevel:null,
    tags:Array.isArray(r.tags)?r.tags.map(String):[],attrs:r.attributes&&typeof r.attributes==='object'?r.attributes:{},
    source:r.source&&typeof r.source==='object'?r.source:null,lastVerified:r.lastVerified||null,v:r.verification,h:hue(r.id)};
  const groups=Object.entries(GROUPS).filter(g=>g[1].includes(L.cat)).map(g=>g[0]);
  L.hay=[L.name,L.sub,CATS[L.cat],L.cat,...groups,c.name,st.name,L.address,...L.tags].join(' ').toLowerCase();
  return {listing:L};
}

/* ---------- data store: real records (data/listings.json) + landmark names + demo placeholders ---------- */
const DB = {real:[],byId:new Map(),loaded:false,error:null,invalid:[],osm:false};
const landmarkRecs = LANDMARKS.map(p=>normalize({id:p.id,name:p.name,category:p.cat,subcategory:LANDMARK_SUB[p.id]||'Landmark',city:p.city,tags:p.tags,description:p.desc,verification:'unverified',source:{name:'LocalLens seed list (name only)'}}).listing);
const landmarksIn = new Map(); landmarkRecs.forEach(p=>landmarksIn.set(p.city,[...(landmarksIn.get(p.city)||[]),p]));
const demoCache = new Map();
const demoFor = c=>{if(!demoCache.has(c.id))demoCache.set(c.id,TEMPLATES.map((t,i)=>normalize({id:c.id+'~'+i,name:t[1],category:t[0],subcategory:SUBS_T[i],city:c.id,priceLevel:t[2],tags:t[3],description:`Placeholder for ${t[4]} in ${c.name}. Replace with a verified listing.`,verification:'demo',source:{name:'LocalLens demo generator'}}).listing));return demoCache.get(c.id)};

function ingest(records){
  DB.real=[];DB.invalid=[];DB.byId=new Map();
  records.forEach((r,i)=>{
    const out=normalize(r);
    if(out.errs||DB.byId.has(r.id)){DB.invalid.push({id:r&&r.id||'#'+i,errs:out.errs||['duplicate id']});console.warn('LocalLens: skipped record',r&&r.id,out.errs||'duplicate id');return}
    DB.real.push(out.listing);DB.byId.set(r.id,out.listing);
  });
  DB.osm=DB.real.some(p=>/openstreetmap/i.test(p.source?.name||''));
}
async function loadData(){
  DB.loaded=false;DB.error=null;showBanner('');refresh();
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),8000);
  try{
    const res=await fetch('data/listings.json',{cache:'no-cache',signal:ctl.signal});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const j=await res.json();
    if(!j||!Array.isArray(j.records))throw new Error('file has no "records" list');
    ingest(j.records);
  }catch(e){
    DB.error=e.name==='AbortError'?'request timed out':(e.message||String(e));
    ingest([]);
    showBanner(`Imported listings could not be loaded (${esc(DB.error)}). Demo data still works. If you opened index.html straight from a folder, use Live Server or a web host so data/listings.json can load.`,true);
  }finally{clearTimeout(t)}
  DB.loaded=true;refresh();route();
}
function showBanner(html,retry){const b=$('#dataBanner');b.hidden=!html;b.innerHTML=html?`<span>${html}</span>${retry?'<button class="btn sm" data-retry>Try again</button>':''}`:''}

/* ---------- location-aware queries ---------- */
const locLabel = l=>l.city?`${ctById[l.city].name}, ${stById[ctById[l.city].state].name}`:l.state?stById[l.state].name:'All India';
const citiesIn = l=>l.city?[ctById[l.city]]:l.state?CITIES.filter(c=>c.state===l.state):CITIES.filter(c=>c.popular);
const inScope = (cityId,l)=>l.city?cityId===l.city:l.state?ctById[cityId].state===l.state:true;
const placesIn = l=>{const cs=citiesIn(l);return [...DB.real.filter(p=>inScope(p.city,l)),...cs.flatMap(c=>landmarksIn.get(c.id)||[]),...cs.flatMap(demoFor)]};
function findPlace(id){
  if(DB.byId.has(id))return DB.byId.get(id);
  if(id.includes('~')){const c=ctById[id.split('~')[0]];return c?demoFor(c).find(p=>p.id===id)||null:null}
  return landmarkRecs.find(p=>p.id===id)||null;
}
const where = p=>`${ctById[p.city].name}, ${stById[p.state].name}`;
function avg(id){const r=reviews[id]||[];return r.length?(r.reduce((a,x)=>a+x.stars,0)/r.length).toFixed(1):null}
const money = b=>b?'₹'.repeat(b)+'<span style="opacity:.25">'+'₹'.repeat(3-b)+'</span>':'Price not listed';

/* ---------- photos for a listing ---------- */
const photoKey = p=>LANDMARK_IMG[p.id]||(p.tags.includes('street food')&&'street')||(p.cat==='tourism'&&CITY_IMG[p.city])||CAT_IMG[p.cat];
function photoOf(p,w){
  if(p.img)return {html:`<img src="${esc(p.img.url)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.remove()">`,credit:p.img.credit,link:p.img.creditUrl,illustrative:false};
  if(p.v==='demo'||p.v==='unverified'){const k=photoKey(p);if(k&&IMG[k])return {html:imgTag(k,w),credit:IMG[k][1]+' on Unsplash',link:IMG[k][3],illustrative:!LANDMARK_IMG[p.id]}}
  return {html:'',credit:'',link:'',illustrative:false};
}
const badgeText = (p,ph)=>({verified:'✓ Verified',sourced:'Imported · unverified',unverified:'Name only · details unverified',demo:'Demo listing'}[p.v])+(ph.illustrative?' · illustrative photo':'');

function card(p){
  const a=avg(p.id), on=favs.includes(p.id), ph=photoOf(p,600);
  return `<article class="card"><div class="ph" style="--h:${p.h}">${ph.html}<span class="badge v-${p.v}">${badgeText(p,ph)}</span>
   <button class="fav" data-fav="${esc(p.id)}" aria-pressed="${on}" aria-label="${on?'Remove from':'Save to'} favourites: ${esc(p.name)}">♥</button></div>
   <div class="body"><small>${CATS[p.cat]}${p.sub?' · '+esc(p.sub):''}, ${esc(where(p))}</small><h3>${esc(p.name)}</h3><p>${p.description?esc(p.description):'No description added yet.'}</p>
   <div class="meta"><span title="Price level">${money(p.price)}</span><span>${a?'★ '+a+' (local)':'No ratings yet'}</span>
   <button class="btn sm" data-open="${esc(p.id)}">View details</button></div></div></article>`;
}
const skeleton = n=>Array.from({length:n},()=>'<div class="skel" aria-hidden="true"></div>').join('');
const fill=(el,list,msg)=>{el.innerHTML=!DB.loaded?skeleton(4):list.length?list.map(card).join(''):`<p class="empty">${msg}</p>`};

/* ---------- listing pages: search + dynamic filters ---------- */
const fresh=()=>({q:'',cat:'all',sub:'all',city:'all',b:'0',v:'all',sort:'match',fav:false,attr:[],n:PAGE});
const ATTRS = {coords:['Has map location',p=>p.lat!==null],website:['Has website',p=>!!p.links.website],phone:['Has phone',p=>!!p.phone]};
const VFILTER = {all:()=>true,real:p=>p.v==='verified'||p.v==='sourced',verified:p=>p.v==='verified',sourced:p=>p.v==='sourced',unverified:p=>p.v==='unverified',demo:p=>p.v==='demo'};
function buildListing(sec){
  const cats=SCOPES[sec.dataset.scope];
  state[sec.id]=fresh();
  sec.firstElementChild.innerHTML=`<h2 class="ptitle">${sec.dataset.title}</h2><p class="pintro">${sec.dataset.intro}</p>
  <div class="filters">
   <button class="chip locbtn" data-loc-open>📍 <span data-loc-label></span></button>
   <input type="search" data-f="q" placeholder="Search name, city, state, category…" aria-label="Search listings">
   ${cats.length>1?`<select data-f="cat" aria-label="Category"><option value="all">All categories</option>${cats.map(c=>`<option value="${c}">${CATS[c]}</option>`).join('')}</select>`:''}
   <select data-f="sub" aria-label="Subcategory"></select>
   <select data-f="city" aria-label="City" hidden></select>
   <select data-f="b" aria-label="Price range"><option value="0">Any price</option><option value="1">₹ Budget friendly</option><option value="2">₹₹ Mid range</option><option value="3">₹₹₹ Splurge</option></select>
   <select data-f="v" aria-label="Data status"><option value="all">All data</option><option value="real">Real data (verified + imported)</option><option value="verified">Verified only</option><option value="sourced">Imported only</option><option value="unverified">Name-only landmarks</option><option value="demo">Demo only</option></select>
   <select data-f="sort" aria-label="Sort"><option value="match">Best match</option><option value="name">A to Z</option><option value="price">Lowest price</option><option value="rating">Top rated (local)</option></select>
   <button class="chip" data-f="fav" aria-pressed="false">♥ Favourites only</button>
   <button class="chip" data-reset>Reset</button></div>
  <div class="attrs" aria-label="More filters"></div>
  <p class="count" aria-live="polite"></p><div class="grid"></div><div class="more"></div>`;
  sec.addEventListener('input',e=>{const f=e.target.dataset.f;if(f&&f!=='fav'){const s=state[sec.id];s[f]=e.target.value;s.n=PAGE;if(f==='cat')s.sub='all';renderListing(sec)}});
  sec.addEventListener('click',e=>{
    const s=state[sec.id];
    if(e.target.closest('[data-f="fav"]')){s.fav=!s.fav;s.n=PAGE;renderListing(sec)}
    const at=e.target.closest('[data-attr]');if(at){const k=at.dataset.attr;s.attr=s.attr.includes(k)?s.attr.filter(x=>x!==k):[...s.attr,k];s.n=PAGE;renderListing(sec)}
    if(e.target.closest('[data-reset]')){state[sec.id]=fresh();renderListing(sec)}
    if(e.target.closest('[data-more]')){s.n+=PAGE;renderListing(sec)}
  });
}
function setOpts(sel,pairs,allLabel,s,key){
  const keep=pairs.some(p=>p[0]===s[key]);if(!keep)s[key]='all';
  sel.innerHTML=`<option value="all">${allLabel}</option>`+pairs.map(p=>`<option value="${esc(p[0])}">${esc(p[1])}</option>`).join('');
  sel.value=s[key];sel.hidden=pairs.length<1;
}
function renderListing(sec){
  const grid=$('.grid',sec),cnt=$('.count',sec),s=state[sec.id];
  if(!DB.loaded){grid.innerHTML=skeleton(6);cnt.textContent='Loading listings…';$('.more',sec).innerHTML='';return}
  const cats=SCOPES[sec.dataset.scope], base=placesIn(loc).filter(p=>cats.includes(p.cat)), inCat=base.filter(p=>s.cat==='all'||p.cat===s.cat);
  setOpts($('[data-f=sub]',sec),[...new Set(inCat.map(p=>p.sub).filter(Boolean))].sort().map(x=>[x,x]),'All subcategories',s,'sub');
  const cs=[...new Set(base.map(p=>p.city))].sort((a,b)=>ctById[a].name.localeCompare(ctById[b].name));
  const citySel=$('[data-f=city]',sec);setOpts(citySel,cs.map(c=>[c,ctById[c].name]),'All cities',s,'city');citySel.hidden=!!loc.city||cs.length<2;if(citySel.hidden)s.city='all';
  const avail=Object.keys(ATTRS).filter(k=>base.some(ATTRS[k][1]));s.attr=s.attr.filter(k=>avail.includes(k));
  $('.attrs',sec).innerHTML=avail.map(k=>`<button class="chip" data-attr="${k}" aria-pressed="${s.attr.includes(k)}">${ATTRS[k][0]}</button>`).join('');
  syncFilters(sec);
  const toks=s.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list=inCat.filter(p=>(s.sub==='all'||p.sub===s.sub)&&(s.city==='all'||p.city===s.city)&&(s.b==='0'||p.price===+s.b)&&VFILTER[s.v](p)&&(!s.fav||favs.includes(p.id))&&s.attr.every(k=>ATTRS[k][1](p))&&toks.every(t=>p.hay.includes(t)));
  const score=p=>{const n=p.name.toLowerCase();return toks.length?(n.startsWith(toks[0])?0:n.includes(toks[0])?1:2):0};
  list.sort((a,b)=>s.sort==='name'?a.name.localeCompare(b.name):s.sort==='price'?(a.price||9)-(b.price||9)||a.name.localeCompare(b.name):s.sort==='rating'?(avg(b.id)||0)-(avg(a.id)||0)||a.name.localeCompare(b.name):VRANK[a.v]-VRANK[b.v]||score(a)-score(b)||a.name.localeCompare(b.name));
  const n=k=>list.filter(p=>p.v===k).length;
  cnt.textContent=`${list.length} listing${list.length===1?'':'s'} in ${locLabel(loc)} · ${n('verified')} verified · ${n('sourced')} imported · ${n('unverified')} name-only · ${n('demo')} demo`;
  fill(grid,list.slice(0,s.n),'Nothing matches. Clear the search, reset filters, or change location.');
  $('.more',sec).innerHTML=list.length>s.n?`<button class="btn dark" data-more>Show more (${list.length-s.n} left)</button>`:'';
}
function syncFilters(sec){const s=state[sec.id];$$('[data-f]',sec).forEach(el=>{const k=el.dataset.f;if(k==='fav')el.setAttribute('aria-pressed',s.fav);else if(!(el.tagName==='SELECT'&&(k==='sub'||k==='city')))el.value=s[k]})}

/* ---------- home ---------- */
function initHome(){
  $('#heroChips').innerHTML=['rooftop','family','street food','quiet'].map(t=>`<button class="chip" data-q="${t}">${t}</button>`).join('');
  $('#moods').innerHTML=MOODS.map((m,i)=>`<button class="mood" style="--h:${m[2]}" data-mood="${i}">${m[0]}</button>`).join('');
  const T=(t,img,h,a,s,ph)=>ptile({t,img,h,a,s,ph});
  $('#cats').innerHTML=[['Food & Cafes','cafe',24,'food','cafe'],['Restaurants','dining',8,'restaurants','restaurant'],['Shopping','market',300,'shopping',''],['Tourism','hawa',200,'tourism',''],['Hidden Gems','hidden',160,'gems',''],['Events','festival',330,'events',''],['Adventure','adventure',130,'adventure','adventure'],['Activities','activity',280,'adventure','activity']]
    .map(c=>T(c[0],c[1],c[2],`data-page="${c[3]}" data-cat="${c[4]}"`,'',140)).join('');
  $('#trending').innerHTML=TRENDING.map(id=>{const c=ctById[id];return T(c.name,CITY_IMG[id],hue(id),`data-city="${id}"`,stById[c.state].name,230)}).join('');
  $('#foodTiles').innerHTML=[['Street food','street',18,'restaurants','','street food'],['Cafes','cafe',24,'food','',''],['Fine dining','dining',350,'restaurants','','fine dining'],['Family restaurants','family',40,'restaurants','','family']]
    .map(c=>T(c[0],c[1],c[2],`data-page="${c[3]}" data-q="${c[5]}"`,'',260)).join('');
  $('#travelTiles').innerHTML=[['Mountains','manali',200,'data-city="manali" data-page="tourism"','Manali, Himachal Pradesh'],['Beaches','beach',190,'data-city="panaji" data-page="tourism"','Goa'],['Heritage','hawa',12,'data-page="tourism" data-q="heritage"','Forts, palaces, old cities'],['Adventure','adventure',130,'data-page="adventure" data-cat="adventure"','Treks and outdoors'],['Hidden destinations','hidden',160,'data-page="gems"','Quiet, local favourites']]
    .map(c=>T(c[0],c[1],c[2],c[3],c[4],240)).join('');
  $('#spotTiles').innerHTML=[['Shopping','market',300,'data-page="shopping"','Bazaars, malls and market lanes'],['Events','festival',330,'data-page="events"','Festivals, markets and nights out']]
    .map(c=>T(c[0],c[1],c[2],c[3],c[4],300)).join('');
  $('#cities').innerHTML=CITIES.filter(c=>c.popular).map(c=>`<button class="citycard" data-city="${c.id}"><b>${c.name}</b><small>${stById[c.state].name}</small></button>`).join('');
  $('#heroSearch').addEventListener('submit',e=>{e.preventDefault();goSearch($('#heroQ').value)});
  $('#heroChips').addEventListener('click',e=>{const c=e.target.closest('[data-q]');if(c)goSearch(c.dataset.q)});
  $('#moods').addEventListener('click',e=>{const m=e.target.closest('[data-mood]');if(m)goSearch(MOODS[m.dataset.mood][1])});
  $('#home').addEventListener('click',e=>{const t=e.target.closest('[data-page],[data-city]');if(!t)return;const d=t.dataset;
    if(d.city&&!d.page)return setLoc({state:ctById[d.city].state,city:d.city},true);
    if(d.city){loc={state:ctById[d.city].state,city:d.city};store.set('ll_loc',loc)}
    const s=state[d.page];if(s){state[d.page]=fresh();state[d.page].cat=d.cat||'all';state[d.page].q=d.q||''}
    refresh();location.hash='#'+d.page});
}
function renderHome(){
  $('#featTitle').textContent='Featured in '+locLabel(loc);
  const feat=placesIn(loc).filter(p=>['tourism','cafe','shopping','gem'].includes(p.cat)).sort((a,b)=>VRANK[a.v]-VRANK[b.v]).slice(0,4);
  fill($('#featured'),feat,'');
  fill($('#savedHome'),favs.map(findPlace).filter(Boolean),'You have not saved anything yet. Tap the heart on a card to keep it here.');
}
function renderStatus(){
  const c=k=>DB.real.filter(p=>p.v===k).length;
  $('#dataStatus').innerHTML=!DB.loaded?'Loading data status…':`<strong>Data status:</strong> ${c('verified')} verified · ${c('sourced')} imported from providers · ${landmarkRecs.length} landmark names with unverified details · demo placeholders are generated for each city and are <em>not</em> real businesses.${DB.invalid.length?` ${DB.invalid.length} invalid record${DB.invalid.length>1?'s were':' was'} skipped.`:''}${DB.error?' Imported listings could not be loaded.':''}`;
  $('#osmCredit').hidden=!DB.osm;
}
function goSearch(raw){
  const q=raw.trim().toLowerCase(), c=CITIES.find(x=>x.name.toLowerCase()===q), st=STATES.find(x=>x.name.toLowerCase()===q);
  if(c)return setLoc({state:c.state,city:c.id},true);
  if(st)return setLoc({state:st.code,city:null},true);
  state.explore=fresh();state.explore.q=raw;renderListing($('#explore'));location.hash='#explore';
}

/* ---------- events (demo only until organisers submit real events) ---------- */
function renderEvents(){
  const cs=citiesIn(loc).slice(0,8);
  $('#eventGrid').innerHTML=cs.flatMap(c=>EVENT_T.slice(0,2).map(ev=>`<article class="card"><div class="ph" style="--h:${hue(c.id+ev[0])}">${imgTag('festival',600)}<span class="badge v-demo">Demo event · illustrative photo</span></div>
   <div class="body"><small>Date to be confirmed, ${c.name}, ${stById[c.state].name}</small><h3>${ev[0]}</h3><p>Placeholder for ${ev[1]}. Not a real event.</p></div></article>`)).join('');
}

/* ---------- location picker ---------- */
let locView=null;
function openLoc(){locView=null;$('#locQ').value='';renderLoc();$('#locModal').showModal();$('#locQ').focus()}
function renderLoc(){
  const q=$('#locQ').value.trim().toLowerCase(), L=$('#locList');
  const cityBtn=c=>`<button class="chip" data-lc="${c.id}">${c.name} <small>${stById[c.state].code}</small></button>`;
  const stBtn=s=>`<button class="chip" data-lv="${s.code}">${s.name}</button>`;
  if(locView&&!q){const s=stById[locView],cs=CITIES.filter(c=>c.state===locView);
    L.innerHTML=`<button class="btnlink" data-lb>Back to all states</button><h3>${s.name} (${s.type})</h3>
     <div class="lgrid"><button class="chip" data-ls="${s.code}" aria-pressed="true">All of ${s.name}</button>${cs.map(cityBtn).join('')}</div>
     ${cs.length?'':'<p class="empty">No cities added for this region yet. Choose "All of '+s.name+'".</p>'}`;return}
  if(q){const ss=STATES.filter(s=>s.name.toLowerCase().includes(q)),cs=CITIES.filter(c=>c.name.toLowerCase().includes(q)).slice(0,40);
    L.innerHTML=ss.length||cs.length?(cs.length?`<h3>Cities</h3><div class="lgrid">${cs.map(cityBtn).join('')}</div>`:'')+(ss.length?`<h3>States and union territories</h3><div class="lgrid">${ss.map(stBtn).join('')}</div>`:''):'<p class="empty">No match yet. Check the spelling, or clear the search to browse all states.</p>';return}
  L.innerHTML=`<button class="chip" data-lall aria-pressed="${!loc.state&&!loc.city}">All India</button>
   <h3>Popular cities</h3><div class="lgrid">${CITIES.filter(c=>c.popular).map(cityBtn).join('')}</div>
   <h3>States</h3><div class="lgrid">${STATES.filter(s=>s.type==='State').map(stBtn).join('')}</div>
   <h3>Union territories</h3><div class="lgrid">${STATES.filter(s=>s.type!=='State').map(stBtn).join('')}</div>`;
}
function setLoc(l,go){
  loc=l;store.set('ll_loc',loc);if($('#locModal').open)$('#locModal').close();
  Object.values(state).forEach(s=>{s.n=PAGE;s.city='all'});refresh();toast('Showing '+locLabel(loc));
  if(go)location.hash='#explore';
}
function initLoc(){
  $('#locQ').addEventListener('input',renderLoc);
  $('#locList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if('lall' in d)setLoc({state:null,city:null});
    else if(d.lc)setLoc({state:ctById[d.lc].state,city:d.lc});
    else if(d.ls)setLoc({state:d.ls,city:null});
    else if(d.lv){locView=d.lv;$('#locQ').value='';renderLoc()}
    else if('lb' in d){locView=null;renderLoc()}});
  const fs=$('#formState');STATES.forEach(s=>fs.add(new Option(s.name,s.name)));
  $('#cityList').innerHTML=CITIES.map(c=>`<option value="${c.name}">`).join('');
}

/* ---------- listing details page (#place/<id>) ---------- */
const mapLinks = p=>{
  if(p.lat!==null){const ll=p.lat+','+p.lon;return {exact:true,html:
   `<a class="btn" href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}" target="_blank" rel="noopener">View on OpenStreetMap</a>
    <a class="btn light line" href="https://www.google.com/maps/search/?api=1&query=${ll}" target="_blank" rel="noopener">Open in Google Maps</a>
    <a class="btn dark" href="https://www.google.com/maps/dir/?api=1&destination=${ll}" target="_blank" rel="noopener">Get directions</a>`}}
  const demo=p.v==='demo', qy=encodeURIComponent(demo?CATS[p.cat]+' in '+where(p):p.name+' '+where(p));
  return {exact:false,html:`<a class="btn light line" href="https://www.google.com/maps/search/?api=1&query=${qy}" target="_blank" rel="noopener">${demo?'Search similar places in Maps':'Search in Maps (approximate)'}</a>`};
};
function renderPlace(id){
  const V=$('#placeView');
  if(!DB.loaded){V.innerHTML='<div class="skel" style="height:320px"></div>';return}
  const p=findPlace(id);
  if(!p){V.innerHTML='<p class="empty">This listing was not found. It may have been removed. <a class="link" href="#explore">Browse all places</a></p>';return}
  document.title=p.name+' | LocalLens';
  const ph=photoOf(p,1100), a=avg(p.id), rs=reviews[p.id]||[], on=favs.includes(p.id), m=mapLinks(p);
  const src=p.source?`${esc(p.source.name||'Unknown')}${p.source.url&&safeUrl(p.source.url)?` (<a href="${esc(safeUrl(p.source.url))}" target="_blank" rel="noopener">record</a>)`:''}${p.source.license?', licence '+esc(p.source.license):''}`:'Not recorded';
  const rows=[['Category',CATS[p.cat]+(p.sub?' · '+esc(p.sub):'')],['City',esc(where(p))],['Address',p.address?esc(p.address):'Not available yet'],['Price level',money(p.price)],...Object.entries(p.attrs).map(([k,v])=>[esc(k.replace(/[:_]/g,' ')),esc(v)])];
  const contacts=[p.phone&&`<li>Phone: <a href="tel:${esc(p.phone.replace(/[^\d+]/g,''))}">${esc(p.phone)}</a></li>`,p.email&&`<li>Email: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></li>`,...Object.entries(p.links).map(([k,u])=>`<li>${esc(k[0].toUpperCase()+k.slice(1))}: <a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(u.replace(/^https?:\/\/(www\.)?/,'').slice(0,50))}</a></li>`)].filter(Boolean);
  V.innerHTML=`<button class="btnlink" data-back>← Back to results</button>
  <div class="pv-hero photo" style="--h:${p.h}">${ph.html}<span class="badge v-${p.v}">${badgeText(p,ph)}</span></div>
  ${ph.credit?`<p class="credit">Photo: ${ph.link?`<a href="${esc(ph.link)}" target="_blank" rel="noopener">${esc(ph.credit)}</a>`:esc(ph.credit)}${ph.illustrative?'. Illustrative only: not a photo of this business.':''}</p>`:''}
  <div class="pv-grid"><div>
   <p class="kicker">${esc(CATS[p.cat])}${p.sub?' · '+esc(p.sub):''}</p><h1 class="pv-title">${esc(p.name)}</h1>
   <p class="pv-desc">${p.description?esc(p.description):'No description has been added yet.'}</p>
   <div class="vbox v-${p.v}"><b>${VERIF[p.v]}</b><span>Source: ${src}. Last verified: ${p.lastVerified?esc(p.lastVerified):'never'}.</span>
     ${p.v==='demo'?'<span>This is a generated placeholder, not a real business.</span>':p.v==='unverified'?'<span>Only the name is confirmed. Address, hours and prices have not been checked.</span>':p.v==='sourced'?'<span>Copied from the source above and not yet checked by LocalLens.</span>':''}</div>
   <h2>Details</h2><dl class="facts">${rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</dl>
   <h2>Contact</h2>${contacts.length?`<ul class="plain">${contacts.join('')}</ul>`:'<p class="muted">No contact details on record yet.</p>'}
   <h2>Location and directions</h2>
   ${m.exact?`<p>Coordinates: ${p.lat}, ${p.lon} <span class="muted">(from ${esc(p.source?.name||'the record')})</span></p>`:'<p class="muted">Exact coordinates are not available for this listing, so the link below is only a search.</p>'}
   <div class="btnrow">${m.html}</div>
   ${/openstreetmap/i.test(p.source?.name||'')?'<p class="muted">Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL).</p>':''}
  </div><aside class="pv-side">
   <div class="btnrow"><button class="btn" data-fav="${esc(p.id)}" aria-pressed="${on}" style="${on?'background:var(--ink)':''}">${on?'Saved ♥':'Save to favourites'}</button>
   <button class="btn light line" data-correct="${esc(p.id)}">Suggest a correction</button></div>
   <h2>Rate and review</h2><p class="muted">${a?'★ '+a+' from '+rs.length+' review'+(rs.length>1?'s':'')+' on this device':'No ratings yet'}. Reviews are saved only in this browser and are not verified.</p>
   <form id="revForm" class="form"><div class="stars" role="radiogroup" aria-label="Your rating">${[1,2,3,4,5].map(n=>`<button type="button" data-star="${n}" aria-label="${n} star${n>1?'s':''}">★</button>`).join('')}</div>
   <label>Your name<input name="who" maxlength="40" required></label><label>Your review<textarea name="txt" rows="3" maxlength="400" required></textarea></label>
   <button class="btn dark" type="submit">Post review</button></form>
   <div>${rs.length?rs.map(r=>`<div class="rev"><b>${esc(r.who)}: ${'★'.repeat(r.stars)}</b>${esc(r.txt)}</div>`).join(''):'<p class="empty">No reviews yet. Be the first to share your experience.</p>'}</div>
  </aside></div>`;
  let stars=0;
  $('#revForm').addEventListener('click',e=>{const s=e.target.closest('[data-star]');if(!s)return;stars=+s.dataset.star;$$('[data-star]',V).forEach(b=>b.classList.toggle('on',+b.dataset.star<=stars))});
  $('#revForm').addEventListener('submit',e=>{e.preventDefault();
    if(!stars)return toast('Choose a star rating first.');
    const f=new FormData(e.target);(reviews[p.id]=reviews[p.id]||[]).unshift({who:f.get('who').trim(),txt:f.get('txt').trim(),stars});
    store.set('ll_reviews',reviews);toast('Review posted on this device.');renderPlace(p.id)});
}

/* ---------- favourites, refresh, routing, forms ---------- */
function toggleFav(id){
  favs=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id];store.set('ll_favs',favs);
  toast(favs.includes(id)?'Saved to favourites.':'Removed from favourites.');refresh();
  if(location.hash.startsWith('#place/'))renderPlace(decodeURIComponent(location.hash.slice(7)));
}
function refresh(){
  $$('[data-loc-label]').forEach(el=>el.textContent=locLabel(loc));
  renderHome();renderEvents();renderStatus();$$('.page[data-scope]').forEach(renderListing);
}
function route(){
  const raw=(location.hash||'#home').slice(1), isPlace=raw.startsWith('place/');
  const page=isPlace?'place':document.getElementById(raw)?.classList.contains('page')?raw:'home';
  $$('.page').forEach(p=>p.classList.toggle('show',p.id===page));
  $$('nav a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+page));
  $('#nav').classList.remove('open');$('#burger').setAttribute('aria-expanded','false');
  document.title=page==='place'?document.title:'LocalLens | Discover India. Find your vibe.';
  if(isPlace)renderPlace(decodeURIComponent(raw.slice(6)));
  scrollTo({top:0});
}
function initForms(){
  $$('form[data-form]').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();
    const data=new FormData(form);
    const rows=store.get('ll_'+form.dataset.form,[]);rows.push({...Object.fromEntries(data),at:new Date().toISOString()});store.set('ll_'+form.dataset.form,rows);
    try{await fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()})}catch{}
    form.reset();toast(form.dataset.form==='business'?'Thanks! Your business is queued for review.':'Message sent. We will reply by email.');
  }));
}
function initVisuals(){
  $$('[data-img]').forEach(el=>el.insertAdjacentHTML('afterbegin',imgTag(el.dataset.img,900)));
  $('#credits').innerHTML=[...new Map(Object.values(IMG).map(i=>[i[3],i])).values()].map(i=>`<li>${esc(i[2])}: <a href="${i[3]}" target="_blank" rel="noopener">${esc(i[1])} on Unsplash</a></li>`).join('');
  if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -40px'});
  $$('#home .head,#home .tiles,#home .grid,#home .citygrid,#home .moods,#home .band').forEach(el=>{el.classList.add('rv');io.observe(el)});
}

document.addEventListener('DOMContentLoaded',()=>{
  $$('.page[data-scope]').forEach(buildListing);
  initHome();initLoc();initForms();initVisuals();refresh();
  document.addEventListener('click',e=>{
    const f=e.target.closest('[data-fav]');if(f){toggleFav(f.dataset.fav);return}
    const o=e.target.closest('[data-open]');if(o){location.hash='#place/'+encodeURIComponent(o.dataset.open);return}
    if(e.target.closest('[data-back]')){history.length>1?history.back():(location.hash='#explore');return}
    const cr=e.target.closest('[data-correct]');if(cr){const p=findPlace(cr.dataset.correct);$('[data-form=contact] [name=message]').value=`Correction for "${p?p.name:''}" (${cr.dataset.correct}): `;location.hash='#contact';return}
    if(e.target.closest('[data-retry]'))loadData();
    if(e.target.closest('[data-loc-open]'))openLoc();
    if(e.target.closest('[data-lclose]')||e.target===$('#locModal'))$('#locModal').close();
  });
  $('#burger').addEventListener('click',()=>{const o=$('#nav').classList.toggle('open');$('#burger').setAttribute('aria-expanded',o)});
  addEventListener('hashchange',route);route();loadData();
});
