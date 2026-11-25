(() => {
  'use strict';
  const {champions, lanes} = window.DRAFT_DATA;
  const byId = new Map(champions.map(champion => [champion.id, champion]));
  const byName = [...champions].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  const laneNames = {Top:'Topo', Jungle:'Selva', Mid:'Meio', ADC:'Atirador', Support:'Suporte'};
  const sides = ['ally','enemy'];
  const sideNames = {ally:'Seu time', enemy:'Adversário'};
  const groupNames = {lanes:'Confrontos de rota',cross:'Counters entre rotas',synergies:'Sinergias',meta:'Meta',structure:'Estrutura da composição',scenarios:'Cenários de jogo'};
  const draftKey = 'draftbook.simulator.v1';
  const metaKey = 'draftbook.career-meta.v1';
  const numbers = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1, signDisplay:'exceptZero'});
  const textKey = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const searchKeys = new Map(champions.map(c => [c.id,[c.name,c.id].map(textKey)]));
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const signedClass = score => score > 0 ? 'sim-positive' : score < 0 ? 'sim-negative' : 'sim-neutral';
  const blankTeam = () => Object.fromEntries(lanes.map(lane => [lane,null]));
  const blankDraft = () => ({picks:{ally:blankTeam(),enemy:blankTeam()},bans:{ally:Array(5).fill(null),enemy:Array(5).fill(null)},useMeta:true});
  function getJson(name) {
    try { return JSON.parse(localStorage.getItem(name)); } catch { return null; }
  }
  function restoreDraft() {
    const next = blankDraft(), saved = getJson(draftKey);
    if (!saved) return next;
    next.useMeta = saved.useMeta !== false;
    const used = new Set();
    for (const side of sides) {
      for (const lane of lanes) {
        const id = saved.picks?.[side]?.[lane];
        if (!used.has(id) && byId.has(id)) { next.picks[side][lane] = id; used.add(id); }
      }
      for (let i=0; i<5; i++) {
        const id = saved.bans?.[side]?.[i];
        if (!used.has(id) && byId.has(id)) { next.bans[side][i] = id; used.add(id); }
      }
    }
    return next;
  }
  let state = restoreDraft(), meta = null, editing = null;
  const picker = $('sim-picker');
  const input = $('sim-search');
  function readMeta() {
    const value = getJson(metaKey);
    meta = value && lanes.every(lane => ['S','A','F'].every(t => Array.isArray(value.lanes?.[lane]?.[t]))) ? value : null;
  }
  function saveDraft() {
    try { localStorage.setItem(draftKey,JSON.stringify(state)); } catch {}
  }
  function allUsed() {
    const used = new Map();
    for (const side of sides) {
      for (const lane of lanes) if (state.picks[side][lane]) used.set(state.picks[side][lane], sideNames[side] + ' · ' + laneNames[lane]);
      for (const id of state.bans[side]) if (id) used.set(id, 'Ban · ' + sideNames[side]);
    }
    return used;
  }
  const current = slot => slot.kind === 'pick' ? state.picks[slot.side][slot.slot] : state.bans[slot.side][slot.slot];
  function change(slot, id) {
    if (!slot || !sides.includes(slot.side)) return false;
    const isPick = slot.kind === 'pick';
    if (isPick ? !lanes.includes(slot.slot) : slot.kind !== 'ban' || !/^[0-4]$/.test(String(slot.slot))) return false;
    if (id !== null && !byId.has(id)) return false;
    if (current(slot) === id) return true;
    if (id && allUsed().has(id)) return false;
    (isPick ? state.picks : state.bans)[slot.side][slot.slot] = id;
    saveDraft();
    render();
    return true;
  }
  function image(id) {
    const img = el('img');
    img.alt = ''; img.decoding = 'async';
    img.src = 'assets/champions/' + encodeURIComponent(id) + '.webp';
    return img;
  }
  function slotButton(side, kind, slot) {
    const item = {side, kind, slot}, id = current(item), champ = byId.get(id);
    const label = kind === 'pick' ? laneNames[slot] : 'Ban ' + (Number(slot)+1);
    const button = el('button','sim-slot');
    button.type = 'button';
    Object.assign(button.dataset,{side,kind,slot,filled:String(Boolean(id))});
    const accessibleName = sideNames[side] + ' · ' + label + ' · ' + (champ ? champ.name : 'Selecionar campeão');
    button.setAttribute('aria-label',accessibleName); button.title = accessibleName;
    button.setAttribute('aria-haspopup','dialog');
    if (kind === 'pick') button.append(el('span','slot-route',label));
    const frame = el('span','slot-portrait');
    frame.append(champ ? image(id) : el('span','slot-plus','+'));
    button.append(frame);
    if (kind === 'pick') button.append(el('span','slot-name',champ?.name || ''));
    return button;
  }

  function renderTeams() {
    for (const side of sides) {
      $('sim-picks-'+side).replaceChildren(...lanes.map(lane => slotButton(side,'pick',lane)));
      $('sim-bans-'+side).replaceChildren(...state.bans[side].map((_,i) => slotButton(side,'ban',i)));
      $('sim-counter-'+side).textContent = Object.values(state.picks[side]).filter(Boolean).length + '/5 picks';
    }
  }
  function showPicker(slot) {
    editing = slot;
    if (slot.kind === 'pick') window.PICK_SUGGESTIONS?.focusSlot?.(slot.side,slot.slot);
    else window.PICK_SUGGESTIONS?.focusBan?.(slot.side,Number(slot.slot));
    const position = slot.kind === 'pick' ? laneNames[slot.slot] : 'Ban ' + (Number(slot.slot)+1);
    $('sim-picker-context').textContent = sideNames[slot.side] + ' · ' + position;
    $('sim-picker-title').textContent = slot.kind === 'pick' ? 'Escolher campeão' : 'Banir campeão';
    $('sim-remove').hidden = !current(slot);
    $('sim-remove').textContent = slot.kind === 'pick' ? 'Remover escolha' : 'Remover banimento';
    $('sim-flex-control').hidden = slot.kind === 'ban';
    $('sim-allow-flex').checked = slot.kind === 'pick' && Boolean(current(slot)) && !byId.get(current(slot)).lanes.includes(slot.slot);
    input.value = '';
    renderPool();
    picker.showModal();
    input.focus();
  }
  function renderPool() {
    if (!editing) return;
    const term = textKey(input.value);
    const used = allUsed(), selected = current(editing);
    const isBan = editing.kind === 'ban';
    let suggestions = [];
    if (!input.value.trim()) {
      const board = suggestionState();
      suggestions = isBan
        ? window.BAN_SUGGESTIONS?.rank(board,editing.side) || []
        : window.PICK_SUGGESTIONS?.rank(board,editing.side,editing.slot) || [];
    }
    $('picker-suggest').hidden = !suggestions.length;
    $('picker-suggest').dataset.kind = editing.kind;
    $('picker-suggest-title').textContent = isBan ? 'Banimentos sugeridos' : 'Sugeridos para este pick';
    $('picker-suggest-list').replaceChildren(...suggestions.map(({champion,lane,reasons}) => {
      const button = el('button',isBan ? 'quick-pick quick-ban' : 'quick-pick');
      button.type = 'button';button.dataset.id = champion.id;
      const reason = isBan ? (reasons || []).join(' ') : '';
      const label = (isBan ? 'Banir ' : 'Escolher ') + champion.name;
      button.title = [label,laneNames[lane],reason].filter(Boolean).join(' · ');
      button.setAttribute('aria-label',button.title);
      button.append(image(champion.id),el('span','',champion.name));
      if (isBan && reasons?.[0]) button.append(el('small','quick-reason',reasons[0]));
      return button;
    }));
    const flex = $('sim-allow-flex').checked;
    const pool = byName.filter(c => (editing.kind === 'ban' || flex || c.lanes.includes(editing.slot)) && searchKeys.get(c.id).some(key => key.includes(term)));
    const output = document.createDocumentFragment();
    for (const champion of pool) {
      const button = el('button','sim-choice');
      button.type = 'button';button.dataset.id = champion.id;
      const taken = used.get(champion.id);
      button.disabled = Boolean(taken && champion.id !== selected);
      button.title = champion.name + (taken ? ' · '+taken : '');
      button.setAttribute('aria-label', button.title);
      const art = image(champion.id);art.loading='lazy';
      button.append(art,el('span','choice-name',champion.name));
      if (taken) button.append(el('span','choice-state',champion.id === selected ? 'Atual' : taken));
      output.append(button);
    }
    $('sim-pool').replaceChildren(output);
    $('sim-pool-count').textContent = pool.length + (pool.length === 1 ? ' campeão' : ' campeões');
    $('sim-pool-empty').hidden = Boolean(pool.length);
  }
  function closePicker() {
    if (!picker.open) return;
    picker.close();
  }
  const points = score => el('b','sim-points '+signedClass(score),numbers.format(score));
  function breakdownLine(label, score, subtext) {
    const li = el('li'), line = el('div','sim-line');
    line.append(el('span','',label),points(score)); li.append(line);
    if (subtext) li.append(el('span','minor',subtext));
    return li;
  }
  function panel(title, rows, empty) {
    const block = el('section','sim-panel'); block.append(el('h3','',title));
    if (!rows.length) block.append(el('p','empty-detail',empty));
    else {const list = el('ul');list.append(...rows);block.append(list);}
    return block;
  }
  const name = id => byId.get(id)?.name || '';
  function detailsBlock(result, expanded) {
    const fold = el('details','sim-panel analysis-fold'); fold.open = expanded;
    fold.append(el('summary','','Detalhes da composição e do meta'));
    const sub = el('div','fold-body');
    sub.append(panel('Counters entre rotas',result.cross.map(row => breakdownLine(row.reason,row.points)),'Nenhum counter entre rotas neste draft.'));
    sub.append(panel('Influência do meta',result.metaPicks.map(row => breakdownLine(name(row.id)+' · Tier '+row.tier,row.points,sideNames[row.side]+' · '+laneNames[row.lane])),'Ative o meta de uma carreira e selecione campeões para ver seus tiers.'));
    sub.append(panel('Estrutura',result.structure.map(row => breakdownLine(row.reason,row.points,sideNames[row.side])),'As duas composições precisam estar completas para comparar a estrutura.'));
    sub.append(panel('Cenários de jogo',result.scenarios.map(row => breakdownLine(row.label,row.points,Math.round(row.ally)+' × '+Math.round(row.enemy)+' de força')),'Os cenários são calculados quando os dois times completam seus picks.'));
    fold.append(sub);
    return fold;
  }
  function renderAnalysis(result) {
    const count = result.picked.ally + result.picked.enemy;
    const bans = sides.reduce((sum,side) => sum + state.bans[side].filter(Boolean).length,0);
    $('sim-progress').textContent = count + ' de 10 picks · ' + bans + ' de 10 bans';
    $('sim-score').textContent = numbers.format(result.score); $('sim-score').className = signedClass(result.score);
    $('sim-verdict').textContent = !count ? 'Aguardando picks' : result.score > 0 ? 'Vantagem do seu time' : result.score < 0 ? 'Vantagem do adversário' : 'Draft equilibrado';
    $('sim-analysis-state').textContent = result.complete ? '5 × 5 completo' : 'Draft parcial';
    $('sim-analysis-hint').textContent = 'Pontos positivos favorecem seu time. '+(result.complete ? 'O saldo inclui estrutura e cenários dos dois times.' : 'Estrutura e cenários entram no cálculo quando os dez picks estão definidos.');
    $('sim-reset').disabled = count + bans === 0;
    const include = $('sim-use-meta');
    include.disabled = !meta; include.checked = Boolean(meta && state.useMeta);
    const context = $('sim-meta-context');
    const link = el('a','',meta ? 'Ver meta' : 'Carregar meu save');link.href = 'meta.html';
    context.replaceChildren();
    if (meta) {
      const alternative = result.metaUsed ? result.score - result.breakdown.meta : window.DRAFT_ANALYZER.analyze({...state.picks,meta}).score;
      context.append((result.metaUsed ? 'Sem meta: ' : 'Com meta: ') + numbers.format(Math.round(alternative*10)/10) + ' · ', link);
    } else context.append('Draft sem meta. ',link);
    const analysis = $('sim-analysis');
    const expanded = Boolean(analysis.querySelector('details[open]'));
    const lanesRows = result.lanes.filter(row => row.ally && row.enemy).map(row => breakdownLine(name(row.ally) + ' × ' + name(row.enemy),row.points,laneNames[row.lane]+' · '+(row.reason || 'Confronto neutro.')));
    const pairs = result.synergies.map(row => breakdownLine(name(row.a)+' + '+name(row.b),row.points,sideNames[row.side]+' · '+row.title));
    analysis.replaceChildren(
      panel('Confrontos de rota',lanesRows,'Escolha os campeões dos dois lados na mesma rota para comparar o confronto.'),
      panel('Sinergias ativas',pairs,'As duplas cadastradas aparecem quando seus dois campeões ocupam as posições certas.'),
      panel('O que mais pesa',result.reasons.slice(0,4).map(row => breakdownLine(row.text,row.points)),'Ainda não há fatores pontuando neste draft.'),
      panel('Composição do saldo',Object.entries(result.breakdown).map(([key,value]) => breakdownLine(groupNames[key],value))),
      detailsBlock(result,expanded)
    );
  }
  function suggestionState() {
    return {
      ...state.picks, bans:[...state.bans.ally,...state.bans.enemy].filter(Boolean),banSlots:state.bans,meta:state.useMeta ? meta : null,
      onPick:(side,lane,id) => change({side,kind:'pick',slot:lane},id),
      onBan:(side,slot,id) => change({side,kind:'ban',slot},id)
    };
  }
  function render() {
    const setup = suggestionState();
    renderTeams();renderAnalysis(window.DRAFT_ANALYZER.analyze(setup));
    window.PICK_SUGGESTIONS?.render(setup);
  }

  $('sim-board').addEventListener('click', event => {
    const button = event.target.closest('.sim-slot');
    if (button) { const {side,kind,slot} = button.dataset; showPicker({side,kind,slot}); }
  });
  input.addEventListener('input',renderPool);
  $('sim-allow-flex').addEventListener('change',renderPool);
  $('picker-suggest-list').addEventListener('click',event => {
    const button = event.target.closest('.quick-pick');
    if (button && change(editing,button.dataset.id)) closePicker();
  });
  $('sim-pool').addEventListener('click', event => {
    const button=event.target.closest('.sim-choice');
    if (button && !button.disabled && change(editing,button.dataset.id)) closePicker();
  });
  $('sim-remove').addEventListener('click', () => { if (change(editing,null)) closePicker(); });
  $('picker-close').addEventListener('click',closePicker);
  picker.addEventListener('close', () => {
    if (!editing) return;
    const {side,kind,slot}=editing;editing=null;
    document.querySelector('.sim-slot[data-side="'+side+'"][data-kind="'+kind+'"][data-slot="'+slot+'"]')?.focus({preventScroll:true});
  });
  for (const dlg of [picker,$('sim-reset-dialog')]) dlg.addEventListener('click', event => {
    if (event.target !== dlg) return;
    const box=dlg.getBoundingClientRect();
    if (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) dlg.close();
  });
  $('sim-use-meta').addEventListener('change',event => {
    state.useMeta = event.target.checked;
    saveDraft();render();
  });
  $('sim-reset').addEventListener('click', () => { $('sim-reset-dialog').showModal(); $('reset-cancel').focus(); });
  $('reset-cancel').addEventListener('click', () => $('sim-reset-dialog').close());
  $('reset-confirm').addEventListener('click', () => {
    const preference=state.useMeta;state=blankDraft();state.useMeta=preference;
    saveDraft();$('sim-reset-dialog').close();render();
    $('sim-picks-ally').firstElementChild.focus({preventScroll:true});
  });
  window.addEventListener('pageshow', () => { readMeta();render(); });
  window.addEventListener('storage', event => {
    if (event.key === metaKey || event.key === null) readMeta();
    if (event.key === draftKey || event.key === null) state=restoreDraft();
    render();
    if (picker.open) renderPool();
  });
  readMeta();render();
})();
