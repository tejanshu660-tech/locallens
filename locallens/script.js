'use strict';
/* LocalLens app logic (vanilla JS). Data lives in data.js. All listings are SAMPLE DATA. */

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{toast('Could not save in this browser.')}}
};
const SCOPES = {all:Object.keys(CATS),food:['cafe'],restaurants:['restaurant'],shopping:['shopping'],tourism:['tourism'],gems:['gem'],adventure:['adventure','activity']};
const PAGE = 24;
const stById = Object.fromEntries(STATES.map(s=>[s.code,s]));
const ctById = Object.fromEntries(CITIES.map(c=>[c.id,c]));
const hue = s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))%360;return h};
LANDMARKS.forEach(p=>p.h=hue(p.id));

/* photos: real Unsplash images from data.js; a missing key or a failed load falls back to the gradient */
const IMGURL=(k,w)=>`https://images.unsplash.com/${IMG[k][0]}?fm=jpg&q=70&w=${w}&auto=format&fit=crop`;
const imgTag=(k,w=700)=>k&&IMG[k]?`<img src="${IMGURL(k,w)}" alt="${esc(IMG[k][2])}" loading="lazy" decoding="async" onerror="this.remove()">`:'';
const placeKey=p=>LANDMARK_IMG[p.id]||(p.tags.includes('street food')&&'street')||(p.cat==='tourism'&&CITY_IMG[p.city])||CAT_IMG[p.cat];
const ptile=o=>`<button class="ptile photo" style="--h:${o.h};--ph:${o.ph||190}px" ${o.a}>${imgTag(o.img,o.w||700)}<span class="pt"><b>${o.t}</b>${o.s?`<small>${o.s}</small>`:''}</span></button>`;

let favs = store.get('ll_favs',[]);
let reviews = store.get('ll_reviews',{});   // only reviews typed by visitors on this device
let loc = store.get('ll_loc',{state:null,city:null});
if((loc.city&&!ctById[loc.city])||(loc.state&&!stById[loc.state]))loc={state:null,city:null};
const state = {};

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2800)}
const money = b=>b?'₹'.repeat(b)+'<span style="opacity:.25">'+'₹'.repeat(3-b)+'</span>':'Budget varies';
function avg(id){const r=reviews[id]||[];return r.length?(r.reduce((a,x)=>a+x.stars,0)/r.length).toFixed(1):null}

/* ---------- location-aware data access (scales: only touches cities in scope) ---------- */
const locLabel = l=>l.city?`${ctById[l.city].name}, ${stById[ctById[l.city].state].name}`:l.state?stById[l.state].name:'All India';
const citiesIn = l=>l.city?[ctById[l.city]]:l.state?CITIES.filter(c=>c.state===l.state):CITIES.filter(c=>c.popular);
const gen = c=>TEMPLATES.map((t,i)=>({id:c.id+'~'+i,name:t[1],cat:t[0],city:c.id,b:t[2],tags:t[3],h:hue(c.id+i),desc:`Placeholder for ${t[4]} in ${c.name}. Replace with a verified listing.`}));
const placesIn = l=>{const cs=citiesIn(l),ids=new Set(cs.map(c=>c.id));return [...LANDMARKS.filter(p=>ids.has(p.city)),...cs.flatMap(gen)]};
function findPlace(id){
  if(id.includes('~')){const [c,i]=id.split('~');return ctById[c]?gen(ctById[c])[+i]:null}
  return LANDMARKS.find(p=>p.id===id)||null;
}
const where = p=>{const c=ctById[p.city];return `${c.name}, ${stById[c.state].name}`};

function card(p){
  const a=avg(p.id), on=favs.includes(p.id);
  return `<article class="card"><div class="ph" style="--h:${p.h}">${imgTag(placeKey(p),600)}<span class="badge">${placeKey(p)&&IMG[placeKey(p)]&&!LANDMARK_IMG[p.id]?'Sample listing · illustrative photo':'Sample listing'}</span>
   <button class="fav" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on?'Remove from':'Save to'} favourites: ${esc(p.name)}">♥</button></div>
   <div class="body"><small>${CATS[p.cat]}, ${esc(where(p))}</small><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p>
   <div class="meta"><span title="Budget">${money(p.b)}</span><span>${a?'★ '+a+' (local)':'No ratings yet'}</span>
   <button class="btn sm" data-open="${p.id}">View details</button></div></div></article>`;
}
const fill=(el,list,msg)=>{el.innerHTML=list.length?list.map(card).join(''):`<p class="empty">${msg}</p>`};

/* ---------- listing pages ---------- */
const fresh=()=>({q:'',cat:'all',b:'0',fav:false,sort:'name',n:PAGE});
function buildListing(sec){
  const cats=SCOPES[sec.dataset.scope];
  state[sec.id]=fresh();
  sec.firstElementChild.innerHTML=`<h2 class="ptitle">${sec.dataset.title}</h2><p class="pintro">${sec.dataset.intro}</p>
  <div class="filters">
   <button class="chip locbtn" data-loc-open>📍 <span data-loc-label></span></button>
   <input type="search" data-f="q" placeholder="Search name, city, state or tag" aria-label="Search">
   ${cats.length>1?`<select data-f="cat" aria-label="Category"><option value="all">All categories</option>${cats.map(c=>`<option value="${c}">${CATS[c]}</option>`).join('')}</select>`:''}
   <select data-f="b" aria-label="Budget"><option value="0">Any budget</option><option value="1">₹ Budget friendly</option><option value="2">₹₹ Mid range</option><option value="3">₹₹₹ Splurge</option></select>
   <select data-f="sort" aria-label="Sort"><option value="name">Sort: A to Z</option><option value="budget">Sort: lowest budget</option><option value="rating">Sort: top rated (local)</option></select>
   <button class="chip" data-f="fav" aria-pressed="false">♥ Favourites only</button>
   <button class="chip" data-reset>Reset</button></div>
  <p class="count" aria-live="polite"></p><div class="grid"></div><div class="more"></div>`;
  sec.addEventListener('input',e=>{const f=e.target.dataset.f;if(f&&f!=='fav'){const s=state[sec.id];s[f]=e.target.value;s.n=PAGE;renderListing(sec)}});
  sec.addEventListener('click',e=>{
    const s=state[sec.id], f=e.target.closest('[data-f="fav"]');
    if(f){s.fav=!s.fav;s.n=PAGE;renderListing(sec);syncFilters(sec)}
    if(e.target.closest('[data-reset]')){state[sec.id]=fresh();syncFilters(sec);renderListing(sec)}
    if(e.target.closest('[data-more]')){s.n+=PAGE;renderListing(sec)}
  });
}
function syncFilters(sec){const s=state[sec.id];$$('[data-f]',sec).forEach(el=>{const k=el.dataset.f;if(k==='fav')el.setAttribute('aria-pressed',s.fav);else el.value=s[k]})}
function renderListing(sec){
  const s=state[sec.id], q=s.q.trim().toLowerCase(), cats=SCOPES[sec.dataset.scope];
  let list=placesIn(loc).filter(p=>cats.includes(p.cat)&&(s.cat==='all'||p.cat===s.cat)&&(s.b==='0'||p.b==+s.b)&&(!s.fav||favs.includes(p.id))
    &&(!q||[p.name,CATS[p.cat],where(p),...p.tags].join(' ').toLowerCase().includes(q)));
  list.sort((a,b)=>s.sort==='budget'?a.b-b.b||a.name.localeCompare(b.name):s.sort==='rating'?(avg(b.id)||0)-(avg(a.id)||0):a.name.localeCompare(b.name));
  $('.count',sec).textContent=`${list.length} sample place${list.length===1?'':'s'} in ${locLabel(loc)}`;
  fill($('.grid',sec),list.slice(0,s.n),'Nothing matches. Clear the search, reset filters, or change location.');
  $('.more',sec).innerHTML=list.length>s.n?`<button class="btn dark" data-more>Show more (${list.length-s.n} left)</button>`:'';
}

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
    refresh();if(s)syncFilters($('#'+d.page));location.hash='#'+d.page});
}
function renderHome(){
  $('#featTitle').textContent='Featured in '+locLabel(loc);
  fill($('#featured'),placesIn(loc).filter(p=>['tourism','cafe','shopping','gem'].includes(p.cat)).slice(0,4),'');
  fill($('#savedHome'),favs.map(findPlace).filter(Boolean),'You have not saved anything yet. Tap the heart on a card to keep it here.');
}
/* A search for a city or state name sets the location; anything else becomes a place search. */
function goSearch(raw){
  const q=raw.trim().toLowerCase(), c=CITIES.find(x=>x.name.toLowerCase()===q), st=STATES.find(x=>x.name.toLowerCase()===q);
  if(c)return setLoc({state:c.state,city:c.id},true);
  if(st)return setLoc({state:st.code,city:null},true);
  state.explore.q=raw;state.explore.n=PAGE;syncFilters($('#explore'));renderListing($('#explore'));location.hash='#explore';
}

/* ---------- events ---------- */
function renderEvents(){
  const cs=citiesIn(loc).slice(0,8);
  $('#eventGrid').innerHTML=cs.flatMap(c=>EVENT_T.slice(0,2).map((ev,i)=>`<article class="card"><div class="ph" style="--h:${hue(c.id+ev[0])}">${imgTag('festival',600)}<span class="badge">Sample event · illustrative photo</span></div>
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
    L.innerHTML=ss.length||cs.length?(cs.length?`<h3>Cities</h3><div class="lgrid">${cs.map(cityBtn).join('')}</div>`:'')+(ss.length?`<h3>States and union territories</h3><div class="lgrid">${ss.map(stBtn).join('')}</div>`:''):'<p class="empty">No match yet. Check the spelling, or browse the list of states below by clearing the search.</p>';return}
  L.innerHTML=`<button class="chip" data-lall aria-pressed="${!loc.state&&!loc.city}">All India</button>
   <h3>Popular cities</h3><div class="lgrid">${CITIES.filter(c=>c.popular).map(cityBtn).join('')}</div>
   <h3>States</h3><div class="lgrid">${STATES.filter(s=>s.type==='State').map(stBtn).join('')}</div>
   <h3>Union territories</h3><div class="lgrid">${STATES.filter(s=>s.type!=='State').map(stBtn).join('')}</div>`;
}
function setLoc(l,go){
  loc=l;store.set('ll_loc',loc);if($('#locModal').open)$('#locModal').close();
  Object.values(state).forEach(s=>s.n=PAGE);refresh();toast('Showing '+locLabel(loc));
  if(go)location.hash='#explore';
}
function initLoc(){
  $('#locQ').addEventListener('input',renderLoc);
  $('#locList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if('lall' in d)setLoc({state:null,city:null});
    else if(d.lc)setLoc({state:ctById[d.lc].state,city:d.lc});
    else if(d.ls)setLoc({state:d.ls,city:null});
    else if(d.lv){locView=d.lv;$('#locQ').value='';renderLoc()}
    else if('lb' in b.dataset){locView=null;renderLoc()}});
  const fs=$('#formState');STATES.forEach(s=>fs.add(new Option(s.name,s.name)));
  $('#cityList').innerHTML=CITIES.map(c=>`<option value="${c.name}">`).join('');
}

/* ---------- details modal, ratings & reviews ---------- */
function openPlace(id){
  const p=findPlace(id); if(!p)return;
  const a=avg(id), rs=reviews[id]||[], on=favs.includes(id), real=!id.includes('~');
  const c=ctById[p.city];
  const map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(real?p.name+' '+where(p):CATS[p.cat]+' in '+where(p));
  $('#mBody').innerHTML=`<div class="m-ph ph" style="--h:${p.h}">${imgTag(placeKey(p),900)}<span class="badge">Sample listing</span><button class="x" data-close>Close</button></div>
  <div class="m-in"><small>${CATS[p.cat]}, ${esc(where(p))}</small><h2 id="mTitle">${esc(p.name)}</h2>
   <p>${esc(p.desc)}</p><div class="tags">${p.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div>
   <p><strong>Budget:</strong> ${money(p.b)} &nbsp; <strong>Rating:</strong> ${a?'★ '+a+' from '+rs.length+' local review'+(rs.length>1?'s':''):'No ratings yet'}</p>
   <p style="font-size:.85rem;color:var(--mute)">Sample data. ${real?'The name is a real landmark; ':''}Hours, prices and address are not verified. Confirm before visiting.</p>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-fav="${id}" aria-pressed="${on}" style="background:${on?'var(--ink)':''}">${on?'Saved ♥':'Save to favourites'}</button>
   <a class="btn light" style="border:1.5px solid var(--ink)" href="${map}" target="_blank" rel="noopener">${real?'Open in Maps':'Search similar places in Maps'}</a></div>
   <h3>Rate and review</h3>
   <form id="revForm" class="form"><div class="stars" role="radiogroup" aria-label="Your rating">${[1,2,3,4,5].map(n=>`<button type="button" data-star="${n}" aria-label="${n} star${n>1?'s':''}">★</button>`).join('')}</div>
   <label>Your name<input name="who" maxlength="40" required></label><label>Your review<textarea name="txt" rows="3" maxlength="400" required></textarea></label>
   <button class="btn dark" type="submit">Post review</button><small style="color:var(--mute)">Reviews are saved only in this browser in this demo and are not verified.</small></form>
   <div>${rs.length?rs.map(r=>`<div class="rev"><b>${esc(r.who)}: ${'★'.repeat(r.stars)}</b>${esc(r.txt)}</div>`).join(''):'<p class="empty">No reviews yet. Be the first to share your experience.</p>'}</div></div>`;
  let stars=0; const m=$('#modal');
  $('#revForm').addEventListener('click',e=>{const s=e.target.closest('[data-star]');if(!s)return;stars=+s.dataset.star;$$('[data-star]',m).forEach(b=>b.classList.toggle('on',+b.dataset.star<=stars))});
  $('#revForm').addEventListener('submit',e=>{e.preventDefault();
    if(!stars)return toast('Choose a star rating first.');
    const f=new FormData(e.target);(reviews[id]=reviews[id]||[]).unshift({who:f.get('who').trim(),txt:f.get('txt').trim(),stars});
    store.set('ll_reviews',reviews);toast('Review posted on this device.');openPlace(id);refresh()});
  if(!m.open)m.showModal();
}

/* ---------- favourites ---------- */
function toggleFav(id){
  favs=favs.includes(id)?favs.filter(x=>x!==id):[...favs,id];store.set('ll_favs',favs);
  toast(favs.includes(id)?'Saved to favourites.':'Removed from favourites.');refresh();
  if($('#modal').open)openPlace(id);
}
function refresh(){
  $$('[data-loc-label]').forEach(el=>el.textContent=locLabel(loc));
  renderHome();renderEvents();$$('.page[data-scope]').forEach(renderListing);
}

/* ---------- routing & forms ---------- */
function route(){
  const id=(location.hash||'#home').slice(1);
  const page=document.getElementById(id)?.classList.contains('page')?id:'home';
  $$('.page').forEach(p=>p.classList.toggle('show',p.id===page));
  $$('nav a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+page));
  $('#nav').classList.remove('open');$('#burger').setAttribute('aria-expanded','false');
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

document.addEventListener('DOMContentLoaded',()=>{
  $$('.page[data-scope]').forEach(buildListing);
  initHome();initLoc();initForms();refresh();initVisuals();
  document.addEventListener('click',e=>{
    const f=e.target.closest('[data-fav]');if(f){toggleFav(f.dataset.fav);return}
    const o=e.target.closest('[data-open]');if(o)openPlace(o.dataset.open);
    if(e.target.closest('[data-loc-open]'))openLoc();
    if(e.target.closest('[data-close]')||e.target===$('#modal'))$('#modal').close();
    if(e.target.closest('[data-lclose]')||e.target===$('#locModal'))$('#locModal').close();
  });
  $('#burger').addEventListener('click',()=>{const o=$('#nav').classList.toggle('open');$('#burger').setAttribute('aria-expanded',o)});
  addEventListener('hashchange',route);route();
});

/* ---------- visuals: hero photos, photo credits, light scroll reveal ---------- */
function initVisuals(){
  $$('[data-img]').forEach(el=>el.insertAdjacentHTML('afterbegin',imgTag(el.dataset.img,900)));
  $('#credits').innerHTML=[...new Map(Object.values(IMG).map(i=>[i[3],i])).values()].map(i=>`<li>${esc(i[2])}: <a href="${i[3]}" target="_blank" rel="noopener">${esc(i[1])} on Unsplash</a></li>`).join('');
  if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -40px'});
  $$('#home .head,#home .tiles,#home .grid,#home .citygrid,#home .moods,#home .band').forEach(el=>{el.classList.add('rv');io.observe(el)});
}
