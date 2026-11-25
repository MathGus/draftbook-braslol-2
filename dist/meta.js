(() => {
  'use strict';

  const { champions, lanes } = window.DRAFT_DATA;
  const byId = new Map(champions.map(champion => [champion.id, champion]));
  const firstYear = 2027;
  const day = 86400000;
  const stages = [
    { id: 'S1', name: 'Split 1' }, { id: 'MSI', name: 'MSI' },
    { id: 'S2', name: 'Split 2' }, { id: 'WORLDS', name: 'Worlds' }
  ];
  const tiers = ['S', 'A', 'F'];
  const fail = message => { throw new Error(message); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      fail('O arquivo não contém um JSON válido.');
    }
  }

  function payloadHash(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      hash = Math.imul(hash ^ (code & 255), 16777619);
      hash = Math.imul(hash ^ (code >>> 8), 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function laneHash(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
  }

  // mtPick uses the integer mixing sequence in mtRng, distinct from lgRand.
  function randomSequence(seed) {
    return () => {
      seed = (seed + 1831565813) >>> 0;
      let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lanePool(lane) {
    const primary = champions.filter(champion => champion.lanes[0] === lane).sort(compareId);
    if (primary.length >= 8) return primary;
    const secondary = champions.filter(champion => champion.lanes[0] !== lane && champion.lanes.includes(lane));
    return primary.concat(secondary.sort(compareId));
  }

  function patchFor(date) {
    const year = new Date(date).getUTCFullYear();
    const first = year === firstYear;
    const start = Date.UTC(year, 0, first ? 6 : 1);
    const minor = (first ? 20 : 0) + Math.floor(Math.max(0, date - start) / (14 * day));
    return (26 + year - firstYear) + '.' + minor;
  }

  function applyCoachPick(lists, pick, lane, seed) {
    if (pick == null) return;
    const champion = byId.get(pick.c);
    if (!champion || !integer(pick.pt, 0, 99)) fail('O pick alternativo do técnico é inválido.');
    // The game's save importer remaps older picks whose champion lost that lane.
    const pool = lanePool(lane);
    const id = champion.lanes.includes(lane) ? pick.c : pool[seed % pool.length].id;
    const promoted = pick.pt >= 14 ? 'S' : pick.pt >= 6 ? 'A' : null;
    if (!promoted || lists[promoted].includes(id)) return;
    const oldTier = tiers.find(tier => lists[tier].includes(id));
    const target = lists[promoted];
    const replaced = target[target.length - 1];
    target[target.length - 1] = id;
    if (oldTier) lists[oldTier][lists[oldTier].indexOf(id)] = replaced;
  }

  function laneTiers(seed, year, stage, lane, pick) {
    const pool = lanePool(lane).map(champion => champion.id);
    const next = randomSequence((seed ^ laneHash(year + '|' + stage + '|' + lane)) >>> 0);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const lists = { S: pool.slice(0, 2), A: pool.slice(2, 5), F: pool.slice(5, 8) };
    applyCoachPick(lists, pick, lane, seed);
    return lists;
  }

  function readStats(meta, year) {
    const stats = Object.create(null);
    if (meta == null || meta.y !== year) return { games: 0, stats };
    const games = meta.n;
    if (!integer(games, 0, 1000000) || !Array.isArray(meta.c) || meta.c.length > champions.length) {
      fail('As estatísticas de meta do save são inválidas.');
    }
    for (const row of meta.c) {
      if (!Array.isArray(row) || row.length !== 4) fail('Há uma estatística de campeão incompleta.');
      const [id, picks, bans, wins] = row;
      if (!byId.has(id) || Object.hasOwn(stats, id) || !integer(picks, 0, games)
        || !integer(bans, 0, games) || !integer(wins, 0, picks)) {
        fail('Há uma estatística de campeão inválida no save.');
      }
      stats[id] = { picks, bans, wins };
    }
    return { games, stats };
  }

  function parse(text) {
    if (typeof text !== 'string') fail('Selecione um arquivo JSON do BRASLOL 2.');
    const outer = parseJson(text.replace(/^\uFEFF/, ''));
    if (!object(outer)) fail('Este arquivo não é um save do BRASLOL 2.');
    let data = outer;
    if (Object.hasOwn(outer, 'v') || Object.hasOwn(outer, 'd')) {
      if (outer.v !== 1 && outer.v !== 2) fail('Versão de save não reconhecida.');
      if (typeof outer.d !== 'string' || outer.c !== payloadHash(outer.d)) {
        fail('O conteúdo não confere com o código de integridade do save. Exporte o arquivo novamente no jogo.');
      }
      data = parseJson(outer.d);
    }
    const sections = data?.s;
    const career = sections?.carreira;
    if (!object(career)) fail('A seção de carreira do BRASLOL 2 não foi encontrada.');
    const { seed, year, date } = career;
    // Version 1 preceded the introduction of MSI between Split 1 and Split 2.
    const stageIndex = outer.v === 1 && career.stage >= 1 ? career.stage + 1 : career.stage;
    if (!integer(seed, 0, 4294967295) || !integer(year, firstYear, firstYear + 60)
      || !integer(stageIndex, 0, stages.length - 1)
      || !integer(date, Date.UTC(firstYear, 0, 1), Date.UTC(firstYear + 61, 0, 1))) {
      fail('A carreira não tem semente, temporada, etapa ou data válidas.');
    }
    const stage = stages[stageIndex];
    const coach = sections.coachbtn?.cb;
    const picks = coach?.seed === seed ? coach.pick : null;
    const rankings = Object.fromEntries(lanes.map(lane => [
      lane, laneTiers(seed, year, stage.id, lane, picks?.[lane])
    ]));
    return {
      year, stage: stage.id, stageLabel: stage.name, patch: patchFor(date),
      lanes: rankings, ...readStats(sections.metastats?.m, year)
    };
  }

  function tierFor(meta, lane, id) {
    if (!meta?.lanes?.[lane] || !byId.get(id)?.lanes.includes(lane)) return null;
    return tiers.find(tier => meta.lanes[lane][tier].includes(id)) || 'B';
  }

  function ratesFor(meta, id) {
    if (!meta?.games || !byId.has(id)) return { win: null, pick: null, ban: null };
    const { picks, wins, bans } = meta.stats[id] || { picks: 0, wins: 0, bans: 0 };
    return {
      win: picks ? wins / picks * 100 : 0,
      pick: picks / meta.games * 100, ban: bans / meta.games * 100
    };
  }

  window.CAREER_META = Object.freeze({ parse, tierFor, ratesFor });
})();
