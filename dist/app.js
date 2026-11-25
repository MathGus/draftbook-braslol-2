(() => {
  'use strict';
  const data = window.DRAFT_DATA;
  const meta = window.CHAMPION_META || {};
  const byId = new Map(data.champions.map(champion => [champion.id, champion]));
  const laneNames = {Top:'Topo', Jungle:'Selva', Mid:'Meio', ADC:'Atirador', Support:'Suporte'};
  const classNames = {Fighter:'Lutador', Assassin:'Assassino', Mage:'Mago', Marksman:'Atirador', Tank:'Tanque', Support:'Suporte'};
  const paths = {
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.2"/>',
    search:'<circle cx="10.7" cy="10.7" r="6.4"/><path d="m16 16 4.5 4.5"/>',
    filter:'<path d="M3 7h18M3 17h18"/><rect x="7" y="4" width="3.6" height="6" rx="1" fill="currentColor"/><rect x="14" y="14" width="3.6" height="6" rx="1" fill="currentColor"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    position:'<path d="m12 2 8 7-8 13L4 9z"/><path d="m8 9 4 3 4-3"/>',
    strength:'<path d="m4 16 6-6 4 4 6-8m-6 0h6v6"/>',
    weakness:'<path d="m4 7 6 6 4-4 6 9m-6 0h6v-6"/>',
    synergy:'<path d="m10 13 4-4m-6 2-2 2a3.5 3.5 0 0 0 5 5l3-3m-4-6 3-3a3.5 3.5 0 1 1 5 5l-2 2"/>',
    chart:'<path d="M4 19h16M6 15v-3m5 3V6m5 9V9"/>'
  };
  const $ = id => document.getElementById(id);
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  document.querySelectorAll('[data-icon]').forEach(slot => {
    slot.setAttribute('aria-hidden','true');
    slot.innerHTML = '<svg class="icon" viewBox="0 0 24 24">'+paths[slot.dataset.icon]+'</svg>';
  });
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const sorted = [...data.champions].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  const searchNames = new Map(sorted.map(c => [c.id, [c.name,c.id].map(normalize)]));
  const address = (id,lane) => '#'+encodeURIComponent(id)+'/'+encodeURIComponent(lane);
  function resolveAddress() {
    let id, lane;
    try { [id,lane] = location.hash.slice(1).split('/').map(decodeURIComponent); } catch {}
    const champion = byId.get(id) || byId.get('Vi') || sorted[0];
    return {champion, lane:champion.lanes.includes(lane) ? lane : champion.lanes[0]};
  }
  function thumbnail(champion, className, lazy) {
    const img = el('img',className);
    img.src = 'assets/champions/'+encodeURIComponent(champion.id)+'.webp';
    img.alt = '';
    img.decoding = 'async';
    if (lazy) img.loading='lazy';
    return img;
  }
  function titleFor(id) {
    const title = meta[id]?.title || '';
    return title.charAt(0).toLocaleUpperCase('pt-BR') + title.slice(1);
  }
  const search = $('search'), laneFilter = $('lane-filter'), routeSelect = $('matchup-lane');
  data.lanes.forEach(lane => laneFilter.add(new Option(laneNames[lane],lane)));
  let selectedId;
  function showCareerTier(champion,lane) {
    const badge=$('career-tier'), address='meta.html#'+lane;
    badge.hidden=true;
    $('meta-nav').href=address;
    try {
      const saved=localStorage.getItem('draftbook.career-meta.v1');
      if(!saved || !window.CAREER_META) return;
      const meta=JSON.parse(saved);
      if(!meta?.lanes?.[lane] || !Array.isArray(meta.lanes[lane].S)) return;
      const tier=window.CAREER_META.tierFor(meta,lane,champion.id);
      if(!['S','A','B','F'].includes(tier)) return;
      badge.textContent='Tier '+tier+' no seu meta';
      badge.dataset.tier=tier;badge.href=address;badge.hidden=false;
    } catch { /* Storage can be unavailable in private or file browsing. */ }
  }
  function renderLibrary() {
    const term=normalize(search.value), lane=laneFilter.value;
    const visible=sorted.filter(c=>(!lane || c.lanes.includes(lane)) && (!term || searchNames.get(c.id).some(key=>key.includes(term))));
    const fragment=document.createDocumentFragment();
    for(const champion of visible) {
      const link=el('a','champion-tile');
      link.href=address(champion.id,lane || champion.lanes[0]);
      link.setAttribute('aria-label',champion.name+' · '+champion.lanes.map(r=>laneNames[r]).join(', '));
      if(champion.id===selectedId) link.setAttribute('aria-current','true');
      link.title=champion.name;
      const art=el('span','tile-art');
      art.append(thumbnail(champion,'',true));
      link.append(art,el('span','tile-label',champion.name));
      fragment.append(link);
    }
    $('champion-grid').replaceChildren(fragment);
    $('champion-count').textContent=String(visible.length);
    $('empty-search').hidden=Boolean(visible.length);
    $('champion-scroll').scrollTop=0;
  }
  function renderMatchup(container, ids, lane) {
    const fragment = document.createDocumentFragment();
    if(!ids.length) fragment.append(el('li','empty','Nenhum confronto cadastrado nesta rota.'));
    for(const id of ids) {
      const champion=byId.get(id);
      const li=el('li'), link=el('a','relation'), label=el('span','row-text');
      link.href=address(id,lane);
      label.append(el('strong','',champion.name),el('small','',titleFor(id)));
      link.append(thumbnail(champion,'row-art'),label);
      li.append(link);fragment.append(li);
    }
    container.replaceChildren(fragment);
  }
  function renderDuos(champion,lane) {
    const fragment=document.createDocumentFragment();
    const duos=champion.synergies.filter(pair=>pair.lane===lane);
    if(!duos.length) fragment.append(el('p','empty','O jogo não lista uma dupla especial para '+champion.name+' nesta rota.'));
    for(const duo of duos) {
      const ally=byId.get(duo.ally);
      const block=el('div','duo'),link=el('a','duo-link'),label=el('span','row-text');
      link.href=address(ally.id,duo.allyLane);
      label.append(el('strong','',ally.name),el('span','duo-lane',laneNames[duo.allyLane]));
      link.append(thumbnail(ally,'row-art'),label);
      block.append(link,el('h4','',duo.title),el('p','',duo.description));
      fragment.append(block);
    }
    $('synergy-list').replaceChildren(fragment);
  }
  function renderPhases(profile) {
    const target=$('phase-bars');target.replaceChildren();
    for(const [key,name] of [['early','Início'],['mid','Meio'],['late','Fim']]){
      const val=profile[key],row=el('div','phase-row'),track=el('span','track'),fill=el('span','fill');
      fill.style.width=val+'%';track.setAttribute('aria-hidden','true');
      track.append(fill);
      row.append(el('span','',name),track,el('b','',String(val)));
      target.append(row);
    }
  }
  function renderSheet() {
    const {champion,lane}=resolveAddress(), id=champion.id;
    selectedId=id;
    const info=meta[id] || {};
    $('classes').textContent=(info.tags || []).map(tag=>classNames[tag] || tag).join(' · ');
    $('champion-name').textContent=champion.name;
    $('champion-name').classList.toggle('long-name',champion.name.length>12);
    $('champion-title').textContent=titleFor(id);
    const art='assets/splash/'+encodeURIComponent(id)+'.webp';
    if($('splash').getAttribute('src')!==art) $('splash').src=art;
    $('hero-lanes').textContent=champion.lanes.map(r=>laneNames[r]).join(' / ');
    showCareerTier(champion,lane);
    routeSelect.replaceChildren(...champion.lanes.map(r=>new Option(laneNames[r],r,false,lane===r)));
    const matchup=champion.matchups[lane];
    renderMatchup($('strong-list'),matchup.strong,lane);
    renderMatchup($('weak-list'),matchup.weak,lane);
    renderDuos(champion,lane);renderPhases(champion.profile);
    document.title=champion.name+' · '+laneNames[lane]+' | Draftbook';
    document.querySelectorAll('.champion-tile').forEach(link=>{
      if(link.hash.split('/')[0] === '#'+encodeURIComponent(id)) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    });
  }
  function openLibrary() {
    $('library').classList.add('is-open');$('scrim').hidden=false;$('library-open').setAttribute('aria-expanded','true');
    $('ficha').inert=true;document.querySelector('.masthead').inert=true;$('library-open').inert=true;
    document.body.style.overflow='hidden';search.focus();
  }
  function closeLibrary(returnFocus=true) {
    const isOpen=$('library').classList.contains('is-open');
    $('library').classList.remove('is-open');$('scrim').hidden=true;$('library-open').setAttribute('aria-expanded','false');
    $('ficha').inert=false;document.querySelector('.masthead').inert=false;$('library-open').inert=false;
    document.body.style.overflow='';
    if(isOpen && returnFocus) $('library-open').focus();
  }
  const narrow=matchMedia('(max-width:760px)');
  narrow.addEventListener('change',()=>{if(!narrow.matches) closeLibrary(false);});
  $('library-open').addEventListener('click',openLibrary);
  $('library-close').addEventListener('click',()=>closeLibrary());
  $('scrim').addEventListener('click',()=>closeLibrary());
  $('champion-grid').addEventListener('click',e=>{
    if(e.target.closest('a') && narrow.matches) {closeLibrary(false);$('ficha').focus({preventScroll:true});window.scrollTo(0,0);}
  });
  $('ficha').addEventListener('click',e=>{
    if(e.target.closest('.relation,.duo-link')) window.scrollTo(0,0);
  });
  routeSelect.addEventListener('change',()=>{location.hash=address(selectedId,routeSelect.value);});
  search.addEventListener('input',renderLibrary);laneFilter.addEventListener('change',renderLibrary);
  window.addEventListener('hashchange',renderSheet);
  window.addEventListener('pageshow',renderSheet);
  window.addEventListener('storage',event=>{
    if(event.key===null || event.key==='draftbook.career-meta.v1') renderSheet();
  });
  const dialog=$('about');
  $('about-open').addEventListener('click',()=>dialog.showModal());
  $('about-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog && !e.target.matches(':hover'))dialog.close();});
  document.addEventListener('keydown',e=>{
    if(dialog.open) return;
    if(e.key==='/' && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();if(narrow.matches) openLibrary();else search.focus();
    }
    if(e.key==='Escape' && $('library').classList.contains('is-open')) {closeLibrary();return;}
    if(e.key==='Escape' && document.activeElement===search && search.value){search.value='';renderLibrary();}
  });
  const localizedDate=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(data.updated+'T12:00:00Z'));
  const lanesCount=sorted.reduce((n,c)=>n+c.lanes.length,0);
  const duoCount=sorted.reduce((n,c)=>n+c.synergies.length,0)/2;
  $('coverage').textContent=sorted.length+' campeões, '+lanesCount+' fichas por rota e '+duoCount+' duplas especiais. Dados consultados em '+localizedDate+'.';
  for(const [name,url] of [['Jogo','https://braslol2.pages.dev/'],['Confrontos',data.sources.matchups],['Sinergias',data.sources.synergies],['Perfis',data.sources.profiles]]){
    const a=el('a','',name);a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('sources').append(a);
  }
  renderSheet();renderLibrary();
})();
