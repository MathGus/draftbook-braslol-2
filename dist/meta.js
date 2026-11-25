(() => {
  'use strict';

  const { champions, lanes } = window.DRAFT_DATA;
  const byId = new Map(champions.map((champion) => [champion.id, champion]));
  const firstYear = 2027;
  const lastYear = firstYear + 60;
  const firstDate = Date.UTC(firstYear, 0, 1);
  const endDate = Date.UTC(lastYear + 1, 0, 1);
  const day = 86400000;
  const stages = Object.freeze(
    [
      { id: 'S1', name: 'Split 1', month: 0, date: 7 },
      { id: 'MSI', name: 'MSI', month: 4, date: 13 },
      { id: 'S2', name: 'Split 2', month: 5, date: 1 },
      { id: 'WORLDS', name: 'Worlds', month: 9, date: 2 },
    ].map(Object.freeze),
  );
  const tiers = ['S', 'A', 'F'];
  const fail = (message) => {
    throw new Error(message);
  };
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const compareId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

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
    const primary = champions.filter((champion) => champion.lanes[0] === lane).sort(compareId);
    if (primary.length >= 8) return primary;
    const secondary = champions.filter(
      (champion) => champion.lanes[0] !== lane && champion.lanes.includes(lane),
    );
    return primary.concat(secondary.sort(compareId));
  }

  function patchFor(date) {
    const year = new Date(date).getUTCFullYear();
    const first = year === firstYear;
    const start = Date.UTC(year, 0, first ? 6 : 1);
    const minor = (first ? 20 : 0) + Math.floor(Math.max(0, date - start) / (14 * day));
    return 26 + year - firstYear + '.' + minor;
  }

  function dateFromInput(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const [year, month, date] = value.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, date);
    return integer(timestamp, firstDate, endDate) &&
      new Date(timestamp).toISOString().slice(0, 10) === value
      ? timestamp
      : NaN;
  }

  // ssFirstDay schedules the first match on a Saturday. The stage opens three days earlier.
  function openingDay(year, stage, after) {
    let firstMatch = Date.UTC(year, stage.month, stage.date);
    if (after !== undefined) firstMatch = Math.max(firstMatch, after + 3 * day);
    const weekday = new Date(firstMatch).getUTCDay();
    return firstMatch + (((6 - weekday + 7) % 7) - 3) * day;
  }

  function seasonSlot(year, stageIndex) {
    return (year - firstYear) * stages.length + stageIndex;
  }

  function estimatedSlot(date, savedDate, savedSlot) {
    const year = new Date(date).getUTCFullYear();
    const index = stages.findLastIndex((stage) => date >= openingDay(year, stage));
    // The days in January before Split 1 still belong to the previous season's Worlds.
    const scheduled = Math.max(0, seasonSlot(year, index));
    if (date === savedDate) return savedSlot;
    if (date < savedDate) return Math.min(scheduled, savedSlot);
    let slot = savedSlot;
    let after = savedDate;
    while (slot < scheduled) {
      const next = slot + 1;
      const nextYear = firstYear + Math.floor(next / stages.length);
      const opening = openingDay(nextYear, stages[next % stages.length], after);
      if (date < opening) break;
      slot = next;
      // Overdue stages can share a nominal start. Give each a distinct opening
      // on the weekly calendar; their actual duration depends on match results.
      after = opening + day;
    }
    return slot;
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
    const oldTier = tiers.find((tier) => lists[tier].includes(id));
    const target = lists[promoted];
    const replaced = target[target.length - 1];
    target[target.length - 1] = id;
    if (oldTier) lists[oldTier][lists[oldTier].indexOf(id)] = replaced;
  }

  function laneTiers(seed, year, stage, lane, pick) {
    const pool = lanePool(lane).map((champion) => champion.id);
    const next = randomSequence((seed ^ laneHash(year + '|' + stage + '|' + lane)) >>> 0);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const lists = { S: pool.slice(0, 2), A: pool.slice(2, 5), F: pool.slice(5, 8) };
    applyCoachPick(lists, pick, lane, seed);
    return lists;
  }

  function rankingsFor(seed, year, stage, picks) {
    return Object.fromEntries(
      lanes.map((lane) => [lane, laneTiers(seed, year, stage, lane, picks?.[lane])]),
    );
  }

  function readStats(meta, year) {
    const stats = Object.create(null);
    if (meta == null || meta.y !== year) return { games: 0, stats };
    const games = meta.n;
    if (!integer(games, 0, 1000000) || !Array.isArray(meta.c) || meta.c.length > champions.length) {
      fail('As estatísticas de meta do save são inválidas.');
    }
    for (const row of meta.c) {
      if (!Array.isArray(row) || row.length !== 4)
        fail('Há uma estatística de campeão incompleta.');
      const [id, picks, bans, wins] = row;
      if (
        !byId.has(id) ||
        Object.hasOwn(stats, id) ||
        !integer(picks, 0, games) ||
        !integer(bans, 0, games) ||
        !integer(wins, 0, picks)
      ) {
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
        fail(
          'O conteúdo não confere com o código de integridade do save. Exporte o arquivo novamente no jogo.',
        );
      }
      data = parseJson(outer.d);
    }
    const sections = data?.s;
    const career = sections?.carreira;
    if (!object(career)) fail('A seção de carreira do BRASLOL 2 não foi encontrada.');
    const { seed, year, date } = career;
    // Version 1 preceded the introduction of MSI between Split 1 and Split 2.
    const stageIndex = outer.v === 1 && career.stage >= 1 ? career.stage + 1 : career.stage;
    if (
      !integer(seed, 0, 4294967295) ||
      !integer(year, firstYear, lastYear) ||
      !integer(stageIndex, 0, stages.length - 1) ||
      !integer(date, firstDate, endDate)
    ) {
      fail('A carreira não tem semente, temporada, etapa ou data válidas.');
    }
    const stage = stages[stageIndex];
    const coach = sections.coachbtn?.cb;
    const picks = coach?.seed === seed ? coach.pick : null;
    return {
      year,
      stage: stage.id,
      stageLabel: stage.name,
      patch: patchFor(date),
      lanes: rankingsFor(seed, year, stage.id, picks),
      ...readStats(sections.metastats?.m, year),
      source: { seed, date },
    };
  }

  function project(meta, dateMs, stageId) {
    const source = meta?.source;
    const savedIndex = stages.findIndex((stage) => stage.id === meta?.stage);
    if (
      !integer(source?.seed, 0, 4294967295) ||
      !integer(meta?.year, firstYear, lastYear) ||
      savedIndex < 0 ||
      !integer(source.date, firstDate, endDate)
    ) {
      fail('Carregue o save novamente para consultar o meta por data.');
    }
    // The importer allows midnight just after the final season as a saved instant.
    if (dateMs === endDate && source.date === endDate) {
      const savedWorlds =
        stageId === 'WORLDS_PREV' && meta.stage === 'WORLDS' && meta.year === lastYear;
      if (!stageId || stageId === 'auto' || stageId === meta.stage || savedWorlds) return meta;
      fail('No último dia aceito pelo save, consulte a etapa registrada na carreira.');
    }
    if (!integer(dateMs, firstDate, endDate - 1)) {
      fail('Escolha uma data válida entre ' + firstYear + ' e ' + lastYear + '.');
    }
    const date = Math.floor(dateMs / day) * day;
    const savedDate = Math.floor(source.date / day) * day;
    const slot = estimatedSlot(date, savedDate, seasonSlot(meta.year, savedIndex));
    const estimatedStage = stages[slot % stages.length];
    let year = firstYear + Math.floor(slot / stages.length);
    let stage = estimatedStage;
    if (stageId != null && stageId !== '' && stageId !== 'auto') {
      const selectedDate = new Date(date);
      year = selectedDate.getUTCFullYear();
      const previousWorlds = stageId === 'WORLDS_PREV';
      if (previousWorlds) {
        if (selectedDate.getUTCMonth() !== 0 || year === firstYear) {
          fail('O Worlds da temporada anterior só está disponível em janeiro a partir de 2028.');
        }
        year--;
      }
      stage = stages.find((item) => item.id === (previousWorlds ? 'WORLDS' : stageId));
      if (!stage) fail('Escolha uma etapa válida da temporada.');
    }
    if (date === savedDate && year === meta.year && stage.id === meta.stage) return meta;
    return {
      year,
      stage: stage.id,
      stageLabel: stage.name,
      patch: patchFor(date),
      lanes: rankingsFor(source.seed, year, stage.id),
      games: 0,
      stats: {},
      projection: true,
    };
  }

  function tierFor(meta, lane, id) {
    if (!meta?.lanes?.[lane] || !byId.get(id)?.lanes.includes(lane)) return null;
    return tiers.find((tier) => meta.lanes[lane][tier].includes(id)) || 'B';
  }

  function ratesFor(meta, id) {
    if (!meta?.games || !byId.has(id)) return { win: null, pick: null, ban: null };
    const { picks, wins, bans } = meta.stats[id] || { picks: 0, wins: 0, bans: 0 };
    return {
      win: picks ? (wins / picks) * 100 : 0,
      pick: (picks / meta.games) * 100,
      ban: (bans / meta.games) * 100,
    };
  }

  window.CAREER_META = Object.freeze({ parse, project, stages, dateFromInput, tierFor, ratesFor });
})();
