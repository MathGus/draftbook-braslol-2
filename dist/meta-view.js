(() => {
  'use strict';
  const storageKey = 'draftbook.career-meta.v1';
  const { champions, lanes } = window.DRAFT_DATA;
  const api = window.CAREER_META;
  const byId = new Map(champions.map(champion => [champion.id, champion]));
  const laneNames = {Top:'Topo', Jungle:'Selva', Mid:'Meio', ADC:'Atirador', Support:'Suporte'};
  const tierNames = {S:'Destaques', A:'Em alta', F:'Em baixa', B:'Demais campeões'};
  const formatPercent = new Intl.NumberFormat('pt-BR', {style:'percent', maximumFractionDigits:1});
  const formatDate = new Intl.DateTimeFormat('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', timeZone:'UTC'});
  const alphabetical = new Intl.Collator('pt-BR');
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const fileInput = $('meta-file');
  const dateInput = $('forecast-date');
  const lastForecastDate = dateInput.max;
  const stageSelect = $('forecast-stage');
  let meta = readSaved();
  let displayed = null;
  let lane = laneFromHash();
  let request = 0;

  function laneFromHash() {
    const hash = location.hash.slice(1);
    return lanes.includes(hash) ? hash : lanes[0];
  }

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      if (!value || !value.stats || !Number.isInteger(value.year) || !Number.isInteger(value.games)
          || typeof value.stageLabel !== 'string' || typeof value.patch !== 'string') return null;
      for (const route of lanes) {
        for (const tier of ['S','A','F']) {
          const ids = value.lanes?.[route]?.[tier];
          if (!Array.isArray(ids) || !ids.every(id => byId.has(id))) return null;
        }
      }
      return value;
    } catch { return null; }
  }

  function setError(message = '') {
    $('meta-error').textContent = message;
    $('meta-error').hidden = !message;
  }

  async function importSave(file) {
    if (!file) return;
    const thisRequest = ++request;
    setError();
    $('meta-status').textContent = 'Lendo o save.';
    try {
      const next = api.parse(await file.text());
      if (thisRequest !== request) return;
      meta = next;
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { /* A consulta continua disponível quando o navegador bloqueia o armazenamento. */ }
      render();
      $('meta-status').textContent = 'Save carregado. Meta da temporada ' + meta.year + ' disponível.';
      (dateInput.closest('[hidden]') ? $('lane-tabs').querySelector('[aria-selected="true"]') : dateInput).focus({preventScroll:true});
    } catch (error) {
      if (thisRequest !== request) return;
      setError(error instanceof Error ? error.message : 'Não foi possível ler o save.');
      $('meta-status').textContent = '';
    }
  }

  function clearMeta() {
    request++;
    meta = null;
    try { localStorage.removeItem(storageKey); } catch {}
    replacePeriodQuery();
    setError();
    render();
    $('meta-status').textContent = 'O meta da carreira foi removido deste navegador.';
    $('meta-open').focus();
  }

  function makeTabs() {
    const tabs = $('lane-tabs');
    for (const route of lanes) {
      const tab = make('button', '', laneNames[route]);
      tab.id = 'tab-' + route;
      tab.type = 'button';
      tab.dataset.lane = route;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'tier-panel');
      tabs.append(tab);
    }
    tabs.addEventListener('click', event => {
      const tab = event.target.closest('[data-lane]');
      if (tab) selectLane(tab.dataset.lane);
    });
    tabs.addEventListener('keydown', event => {
      const index = lanes.indexOf(event.target.dataset.lane);
      if (index < 0) return;
      const destinations = {ArrowRight:(index+1)%lanes.length, ArrowLeft:(index+lanes.length-1)%lanes.length, Home:0, End:lanes.length-1};
      if (!Object.hasOwn(destinations, event.key)) return;
      event.preventDefault();
      const next = lanes[destinations[event.key]];
      selectLane(next);
      $('tab-' + next).focus();
    });
  }

  function selectLane(route) {
    if (!lanes.includes(route)) return;
    lane = route;
    if (location.hash.slice(1) !== route) location.hash = route;
    if (displayed) renderTiers();
  }

  function statCell(rate, numerator, denominator) {
    const text = rate === null ? '—' : formatPercent.format(rate/100);
    const cell = make('td', '', text);
    cell.title = rate === null ? 'Sem amostra' : denominator ? numerator + ' de ' + denominator : 'Campeão sem escolhas';
    cell.setAttribute('aria-label', rate === null ? 'Sem amostra' : text + ' (' + cell.title + ')');
    return cell;
  }

  function championLink(id) {
    const champion = byId.get(id);
    const link = make('a', 'meta-pick');
    link.href = 'index.html#' + encodeURIComponent(id) + '/' + encodeURIComponent(lane);
    link.setAttribute('aria-label', 'Ver ficha de ' + champion.name + ' em ' + laneNames[lane]);
    const image = make('img');
    image.src = 'assets/champions/' + encodeURIComponent(id) + '.webp';
    image.alt = ''; image.loading = 'lazy'; image.width = 38; image.height = 38;
    link.append(image, make('span','',champion.name));
    return link;
  }

  function championTable(ids, tier) {
    const table = make('table');
    table.setAttribute('aria-label', 'Tier ' + tier + ' · ' + laneNames[lane]);
    const header = table.createTHead().insertRow();
    for (const text of ['Campeão', 'Escolha', 'Ban', 'Vitória']) {
      const th = make('th', '', text);
      th.scope = 'col'; header.append(th);
    }
    const body = table.createTBody();
    for (const id of ids) {
      const row = body.insertRow();
      row.insertCell().append(championLink(id));
      const rates = api.ratesFor(meta, id);
      const record = meta.stats[id] || {picks:0,bans:0,wins:0};
      row.append(statCell(rates.pick, record.picks, meta.games), statCell(rates.ban, record.bans, meta.games), statCell(rates.win, record.wins, record.picks));
    }
    return table;
  }

  function tierGroup(tier, ids) {
    const group = make(tier === 'B' ? 'details' : 'section', 'tier-block tier-' + tier.toLowerCase());
    const heading = make(tier === 'B' ? 'summary' : 'h3', 'tier-caption');
    const badge = make('span','tier-letter',tier);
    badge.setAttribute('aria-label','Tier ' + tier);
    heading.append(badge, make('span','',tierNames[tier]), make('span','tier-count',ids.length + (ids.length === 1 ? ' campeão' : ' campeões')));
    group.append(heading);
    if (!ids.length) {
      group.append(make('p','tier-empty','Nenhum campeão neste tier.'));
    } else if (displayed === meta) {
      group.append(championTable(ids, tier));
    } else {
      const list = make('ul', 'forecast-roster');
      for (const id of ids) {
        const item = make('li');
        item.append(championLink(id));
        list.append(item);
      }
      group.append(list);
    }
    return group;
  }

  function renderTiers() {
    for (const tab of $('lane-tabs').children) {
      const active = tab.dataset.lane === lane;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    $('tier-panel').setAttribute('aria-labelledby', 'tab-' + lane);
    const neutralIds = champions.filter(champion => api.tierFor(displayed, lane, champion.id) === 'B')
      .sort((a, b) => alphabetical.compare(a.name, b.name)).map(champion => champion.id);
    const ranking = displayed.lanes[lane];
    const grouped = { S:ranking.S, A:ranking.A, F:ranking.F, B:neutralIds };
    const output = document.createDocumentFragment();
    for (const [tier, ids] of Object.entries(grouped)) {
      output.append(tierGroup(tier, ids));
    }
    $('tier-groups').replaceChildren(output);
    $('tier-context').textContent = displayed !== meta
      ? 'A projeção mostra o meta-base da etapa. Os bônus do técnico e as taxas de partidas aparecem na consulta do save.'
      : meta.games
      ? 'As taxas incluem todas as rotas da temporada. O jogo exibe 0% de vitória para campeões sem escolhas.'
      : 'Os tiers já estão disponíveis. As taxas aparecerão quando esta temporada tiver partidas registradas em um novo save.';
  }

  function replacePeriodQuery(date, stage) {
    const url = new URL(location.href);
    if (date) url.searchParams.set('date', date);
    else url.searchParams.delete('date');
    if (date && stage) url.searchParams.set('stage', stage);
    else url.searchParams.delete('stage');
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }

  function setStageOptions(timestamp, suggested, selected) {
    stageSelect.disabled = dateInput.value > lastForecastDate;
    if (stageSelect.disabled) {
      stageSelect.replaceChildren(new Option('Etapa do save · ' + suggested.stageLabel + ' ' + suggested.year, ''));
      return;
    }
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const twoWorlds = date.getUTCMonth() === 0 && year > 2027;
    const auto = twoWorlds && suggested.stage === 'WORLDS' ? suggested.stageLabel + ' ' + suggested.year : suggested.stageLabel;
    const options = [new Option('Automática · ' + auto, '')];
    for (const stage of api.stages) {
      if (twoWorlds && stage.id === 'WORLDS') {
        options.push(new Option(stage.name + ' ' + (year - 1), 'WORLDS_PREV'), new Option(stage.name + ' ' + year, stage.id));
      } else {
        options.push(new Option(stage.name, stage.id));
      }
    }
    stageSelect.replaceChildren(...options);
    stageSelect.value = options.some(option => option.value === selected) ? selected : '';
  }

  function updatePeriod(reflectInUrl = false, requestedStage = stageSelect.value) {
    const date = api.dateFromInput(dateInput.value);
    const error = $('forecast-error');
    error.hidden = true;
    displayed = meta;
    if (!$('forecast-panel').hidden) {
      try {
        if (!Number.isFinite(date) || !dateInput.validity.valid) {
          throw new Error('Escolha uma data entre 01/01/2027 e ' + formatDate.format(api.dateFromInput(dateInput.max)) + '.');
        }
        const suggested = api.project(meta, date);
        setStageOptions(date, suggested, requestedStage);
        const result = stageSelect.value ? api.project(meta, date, stageSelect.value) : suggested;
        displayed = result.projection ? result : meta;
      } catch (failure) {
        displayed = null;
        stageSelect.disabled = true;
        stageSelect.replaceChildren(new Option('Automática', ''));
        error.textContent = failure.message;
        error.hidden = false;
      }
    }
    $('forecast-reset').disabled = displayed === meta && !stageSelect.value;
    $('meta-guide').hidden = !displayed;
    if (reflectInUrl) {
      const hasSelection = displayed && (displayed !== meta || stageSelect.value);
      replacePeriodQuery(hasSelection ? dateInput.value : '', stageSelect.value);
    }
    if (!displayed) { $('tier-groups').replaceChildren(); return; }
    const isProjection = displayed !== meta;
    const prefix = isProjection ? 'Meta projetado' : 'Meta do save';
    $('tier-period').textContent = [prefix, displayed.stageLabel + ' ' + displayed.year, 'Patch ' + displayed.patch].join(' · ');
    const period = new URLSearchParams();
    if (!$('forecast-panel').hidden) {
      period.set('date', dateInput.value);
      if (stageSelect.value) period.set('stage', stageSelect.value);
    }
    $('forecast-simulator').href = period.has('date') ? 'simulador.html?' + period : 'simulador.html';
    renderTiers();
  }

  function render() {
    $('meta-welcome').hidden = Boolean(meta);
    $('meta-summary').hidden = !meta;
    $('meta-guide').hidden = !meta;
    let supportsDates = false;
    if (meta?.source) {
      try { supportsDates = api.project(meta, meta.source.date) === meta; }
      catch { /* O snapshot continua legível se faltarem dados para a previsão. */ }
    }
    $('forecast-panel').hidden = !supportsDates;
    $('forecast-legacy').hidden = !meta || supportsDates;
    displayed = meta;
    if (!meta) { $('tier-groups').replaceChildren(); return; }
    $('career-date-label').textContent = supportsDates ? 'Data do save' : 'Temporada do save';
    $('career-date').textContent = supportsDates ? formatDate.format(meta.source.date) : meta.year;
    const otherSeason = supportsDates && new Date(meta.source.date).getUTCFullYear() !== meta.year;
    $('career-stage').textContent = otherSeason ? meta.stageLabel + ' ' + meta.year : meta.stageLabel;
    $('career-patch').textContent = meta.patch;
    $('career-games').textContent = meta.games.toLocaleString('pt-BR');
    stageSelect.value = '';
    if (supportsDates) {
      dateInput.valueAsNumber = meta.source.date;
      dateInput.max = dateInput.value > lastForecastDate ? dateInput.value : lastForecastDate;
      const linkedPeriod = new URLSearchParams(location.search);
      if (linkedPeriod.has('date')) {
        dateInput.value = linkedPeriod.get('date');
        updatePeriod(false, linkedPeriod.get('stage'));
        return;
      }
    }
    updatePeriod();
  }

  dateInput.addEventListener('change', () => updatePeriod(true));
  stageSelect.addEventListener('change', () => updatePeriod(true));
  $('forecast-reset').addEventListener('click', () => {
    dateInput.valueAsNumber = meta.source.date;
    stageSelect.value = '';
    updatePeriod(true);
    dateInput.focus();
  });
  $('meta-open').addEventListener('click', () => fileInput.click());
  $('meta-change').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    importSave(file);
  });
  $('meta-clear').addEventListener('click', clearMeta);
  for (const panel of [$('meta-welcome'),$('meta-summary')]) {
    panel.addEventListener('dragover', event => { event.preventDefault(); panel.classList.add('is-over'); });
    panel.addEventListener('dragleave', event => { if (!panel.contains(event.relatedTarget)) panel.classList.remove('is-over'); });
    panel.addEventListener('drop', event => {
      event.preventDefault();
      panel.classList.remove('is-over');
      if (event.dataTransfer.files.length > 1) {
        request++;
        setError('Selecione apenas um save por vez.');
      } else importSave(event.dataTransfer.files[0]);
    });
  }
  window.addEventListener('hashchange', () => {
    const fromUrl = laneFromHash();
    if (fromUrl !== lane) { lane = fromUrl; if (displayed) renderTiers(); }
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      request++;
      meta = readSaved();
      setError();
      render();
    }
  });
  makeTabs();
  render();
})();
