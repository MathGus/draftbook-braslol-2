(() => {
  'use strict';

  const { champions, lanes } = window.DRAFT_DATA;
  const byId = new Map(champions.map(champion => [champion.id, champion]));
  const laneNames = { Top:'Topo', Jungle:'Selva', Mid:'Meio', ADC:'Atirador', Support:'Suporte' };
  const collator = new Intl.Collator('pt-BR');
  const scoreFormat = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1,signDisplay:'exceptZero'});
  let state;
  let side = 'ally';
  let lane = 'Jungle';

  function phaseAverage(champion) {
    const { early, mid, late } = champion.profile;
    return (early + mid + late) / 3;
  }

  function rank(setup, forSide, forLane) {
    const taken = new Set([...Object.values(setup.ally), ...Object.values(setup.enemy), ...setup.bans]);
    const direction = forSide === 'ally' ? 1 : -1;
    const pool = champions.filter(champ => champ.lanes.includes(forLane) && !taken.has(champ.id));
    return pool.map(champion => {
      const proposed = {...setup[forSide], [forLane]:champion.id};
      const result = window.DRAFT_ANALYZER.analyze({
        ally:setup.ally, enemy:setup.enemy, [forSide]:proposed, meta:setup.meta || null
      });
      return {champion, result, score:direction * result.score, primary:champion.lanes[0] === forLane, average:phaseAverage(champion)};
    }).sort((a,b) => b.score-a.score || Number(b.primary)-Number(a.primary) ||
      b.average-a.average || collator.compare(a.champion.name,b.champion.name)).slice(0,3);
  }

  function explanations(proposal, forSide, forLane) {
    const {champion, result} = proposal;
    const id=champion.id, sign=forSide==='ally' ? 1 : -1, other=forSide==='ally' ? 'enemy' : 'ally';
    const good=[], tradeoffs=[];
    const duel=result.lanes.find(row=>row.lane===forLane && row[other]);
    if(duel && duel.points!==0) {
      const opponent=byId.get(duel[other]).name;
      if(sign*duel.points>0) good.push('Confronto favorável contra '+opponent+'.');
      else tradeoffs.push('Confronto difícil contra '+opponent+'.');
    }
    for(const pair of result.synergies.filter(pair=>pair.side===forSide && (pair.a===id || pair.b===id))){
      const ally=byId.get(pair.a===id ? pair.b : pair.a);
      good.push('Sinergia com '+ally.name+' · '+pair.title+'.');
    }
    const cross=result.cross.filter(row=>row[forSide]===id);
    const crossWin=cross.find(row=>row.points*sign>0);
    if(crossWin) good.push('Vantagem sobre '+byId.get(crossWin[other]).name+' em outra rota.');
    const crossLoss=cross.find(row=>row.points*sign<0);
    if(crossLoss) tradeoffs.push('Vulnerável a '+byId.get(crossLoss[other]).name+' em outra rota.');
    const meta=result.metaPicks.find(pick=>pick.side===forSide && pick.id===id);
    if(meta && ['S','A','F'].includes(meta.tier)) {
      const label='Tier '+meta.tier+' no cálculo de meta do draft.';
      (meta.tier==='F' ? tradeoffs : good).push(label);
    }
    if(result.complete) {
      const lead=result.scenarios.filter(row=>row.points*sign>0)
        .sort((a,b)=>sign*(b.points-a.points))[0];
      if(lead) good.push('Com este pick, o time fica à frente em '+lead.label.toLocaleLowerCase('pt-BR')+'.');
    }
    const reasons=good.slice(0,2);
    if(!reasons.length) {
      const phases=[['início',champion.profile.early],['meio',champion.profile.mid],['fim',champion.profile.late]];
      const [strongest]=phases.sort((a,b)=>b[1]-a[1]);
      reasons.push('Tem '+strongest[1]+'/100 de força no '+strongest[0]+' de jogo.');
    }
    if(tradeoffs.length && reasons.length<3) reasons.push(tradeoffs[0]);
    return reasons;
  }

  function make(tag, cls, text) {
    const node=document.createElement(tag);
    if(cls) node.className=cls;
    if(text!==undefined) node.textContent=text;
    return node;
  }

  function addSelect(parent, labelText, name, choices, selected, change) {
    const label=make('label','suggest-select');
    label.append(make('span','',labelText));
    const select=make('select');
    select.id='suggest-'+name;
    for(const [id,text] of choices) select.add(new Option(text,id,false,id===selected));
    select.addEventListener('change',()=>{ change(select.value); render(state);document.getElementById(select.id)?.focus({preventScroll:true}); });
    label.append(select);
    parent.append(label);
  }

  function focusSlot(forSide,forLane) {
    if(!['ally','enemy'].includes(forSide) || !lanes.includes(forLane)) return;
    side=forSide;lane=forLane;
    if(state) render(state);
  }

  function render(setup) {
    if(!setup) return;
    state=setup;
    const target=document.getElementById('pick-suggestions');
    if(!target) return;
    const header=make('div','suggest-head'),title=make('div','suggest-title');
    title.append(make('h2','','Picks sugeridos'));
    const selected=byId.get(setup[side][lane]);
    const note=selected ? 'Alternativas para substituir '+selected.name+' na rota.' : 'Opções disponíveis para a próxima escolha.';
    title.append(make('p','',note));
    const controls=make('div','suggest-controls');
    addSelect(controls,'Lado','side',[['ally','Seu time'],['enemy','Adversário']],side,value=>{side=value;});
    addSelect(controls,'Rota','lane',lanes.map(r=>[r,laneNames[r]]),lane,value=>{lane=value;});
    header.append(title,controls);
    const grid=make('div','suggest-grid');
    const best=rank(setup,side,lane);
    for(const [index,proposal] of best.entries()) {
      const champ=proposal.champion,card=make('article','suggest-card'),identity=make('div','suggest-champ');
      const img=make('img');img.src='assets/champions/'+encodeURIComponent(champ.id)+'.webp';img.alt='';img.width=42;img.height=42;
      identity.append(img,make('h3','',champ.name),make('span','suggest-rank',String(index+1)+'º'));
      const list=make('ul','suggest-reasons');
      for(const reason of explanations(proposal,side,lane)) list.append(make('li','',reason));
      const use=make('button','suggest-use',selected ? 'Trocar por '+champ.name : 'Escolher '+champ.name);
      use.type='button';use.dataset.pick=champ.id;
      use.addEventListener('click',()=>{
        const chosenSide=side, chosenLane=lane;
        const next=lanes.find(r=>r!==chosenLane && !state[chosenSide][r]);
        if(next) lane=next;
        setup.onPick(chosenSide,chosenLane,champ.id);
      });
      card.append(identity,list);
      if(setup.meta || [...Object.values(setup.ally),...Object.values(setup.enemy)].some(Boolean)) {
        const projection=make('p','suggest-projection','Saldo com este pick');
        projection.append(make('strong','',scoreFormat.format(proposal.score)+' pts'));
        card.append(projection);
      }
      card.append(use);
      grid.append(card);
    }
    if(!best.length) grid.append(make('p','suggest-none','Todos os campeões disponíveis para esta rota já foram escolhidos ou banidos.'));
    const help=make('details','suggest-help');
    help.append(make('summary','','Como as sugestões são ordenadas'),make('p','','O guia testa cada campeão disponível nessa rota e compara o saldo projetado para o lado escolhido. Com os dez picks, entram também a estrutura e os cenários da composição. Em caso de empate, prioriza a rota principal, depois a média de força no início, meio e fim da partida. O meta só entra quando está ativado.'));
    target.replaceChildren(header,grid,help);
  }

  window.PICK_SUGGESTIONS=Object.freeze({rank,render,focusSlot});
})();
