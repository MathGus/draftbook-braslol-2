(() => {
  'use strict';

  const { lanes, champions } = window.DRAFT_DATA;
  const byId = new Map(champions.map(champion => [champion.id, champion]));
  const globalUlt = new Set(['Shen', 'TwistedFate', 'Karthus', 'Ezreal', 'Ashe', 'Draven',
    'Gangplank', 'Jinx', 'Senna', 'Soraka', 'Nocturne', 'Pantheon']);
  const laneNames = { Top: 'topo', Jungle: 'selva', Mid: 'meio', ADC: 'atirador', Support: 'suporte' };
  const sideNames = { ally: 'Aliados', enemy: 'Adversários' };
  const tierPoints = { S: 1.2, A: 0.6, B: 0, F: -1.2 };
  const scenarioWeights = [
    ['tf', 'Luta em equipe', 14], ['ea', 'Early game', 9], ['pk', 'Pickoff', 6],
    ['sp', 'Rotas laterais', 5], ['lt', 'Late game', 9], ['sg', 'Poke', 4]
  ];
  const limit = number => Math.min(100, Math.max(0, number));
  const tenth = number => Math.round(number * 10) / 10 || 0;
  const sum = (array, valueOf) => array.reduce((total, item) => total + valueOf(item), 0);
  const defaultCounters = c => c.matchups[c.lanes[0]].weak;

  function teamFrom(picks) {
    return lanes.flatMap(lane => {
      const champion = byId.get(picks?.[lane]);
      return champion ? [{ lane, champion }] : [];
    });
  }

  // dMuRel consults both champions' lane sheets. A contradiction cancels the
  // explicit lane relation; dxDuel then tries the default-lane counter lists.
  function duel(lane, a, b) {
    const result = { lane, ally: a?.id ?? null, enemy: b?.id ?? null, points: 0, reason: '' };
    if (!a || !b) return result;
    const aSheet = a.matchups[lane];
    const bSheet = b.matchups[lane];
    const favorsAlly = aSheet?.strong.includes(b.id) || bSheet?.weak.includes(a.id);
    const favorsEnemy = aSheet?.weak.includes(b.id) || bSheet?.strong.includes(a.id);
    let points = (Number(Boolean(favorsAlly)) - Number(Boolean(favorsEnemy))) * 3;
    if (!points) {
      points = (Number(defaultCounters(b).includes(a.id)) - Number(defaultCounters(a).includes(b.id))) * 2;
    }
    result.points = points;
    if (points) {
      const [winner, loser] = points > 0 ? [a, b] : [b, a];
      result.reason = Math.abs(points) === 3
        ? winner.name + ' tem vantagem sobre ' + loser.name + ' na rota.'
        : winner.name + ' é counter de ' + loser.name + ' pela ficha da rota principal.';
    }
    return result;
  }

  function crossCounters(ally, enemy) {
    const rows = [];
    for (const a of ally) for (const b of enemy) {
      if (a.lane === b.lane) continue;
      const add = (winner, loser, points) => rows.push({
        ally: a.champion.id, enemy: b.champion.id, allyLane: a.lane, enemyLane: b.lane, points,
        reason: winner.champion.name + ' (' + laneNames[winner.lane] + ') é counter de '
          + loser.champion.name + ' (' + laneNames[loser.lane] + ').'
      });
      if (defaultCounters(a.champion).includes(b.champion.id)) add(b, a, -1);
      if (defaultCounters(b.champion).includes(a.champion.id)) add(a, b, 1);
    }
    return rows;
  }

  function duos(team, side) {
    const rows = [];
    for (const {lane, champion} of team) for (const pair of champion.synergies) {
      // Each pair is present on both champion sheets; emit only its first board slot.
      if (pair.lane !== lane || lanes.indexOf(pair.allyLane) <= lanes.indexOf(lane)) continue;
      if (!team.some(pick => pick.lane === pair.allyLane && pick.champion.id === pair.ally)) continue;
      rows.push({side, a: champion.id, b: pair.ally, laneA: lane, laneB: pair.allyLane,
        title: pair.title, description: pair.description, points: side === 'ally' ? 2 : -2});
    }
    return rows;
  }

  function metaRows(ally, enemy, meta) {
    if (!meta?.lanes) return [];
    // mtsTiers combines all lane tables by champion; a later lane wins for flex picks.
    const globalTiers = new Map();
    for (const lane of lanes) for (const tier of ['S', 'A', 'F']) {
      for (const id of meta.lanes[lane]?.[tier] ?? []) globalTiers.set(id, tier);
    }
    const rows = (team, side, sign) => team.map(({champion, lane}) => {
      const tier = globalTiers.get(champion.id) || 'B';
      return {side, id: champion.id, lane, tier, points: sign * tierPoints[tier] || 0};
    });
    return rows(ally, 'ally', 1).concat(rows(enemy, 'enemy', -1));
  }

  // dxStruct and dxScen are only compared when all five slots on both sides
  // are filled. That prevents a pending slot from being treated as a missing
  // front line, jungler or source of damage in the guide's live draft.
  function composition(team, side) {
    const profiles = team.map(pick => pick.champion.profile);
    const [top, jungle, mid, adc, support] = profiles;
    const count = role => profiles.filter(p => p.roles.includes(role)).length;
    const total = attribute => sum(profiles, p => p[attribute]);
    const average = attribute => total(attribute) / profiles.length;
    const tanks = count('tank'), bruisers = count('bruiser'), engage = count('engage');
    const peel = count('peel'), carries = count('carry'), control = count('control');
    const frontline = tanks + bruisers * 0.5;
    const crowdControl = total('cc');
    const adShare = sum(profiles, p => p.damage === 'AD' ? 1 : p.damage === 'AP' ? 0 : 0.5) / profiles.length;
    const damageType = adShare >= 0.5 ? 'físico' : 'mágico';
    const structure = [];
    const note = (points, reason) => structure.push({side, points: side === 'ally' ? points : -points, reason});
    if (adShare >= 0.85 || adShare <= 0.15) note(-3, 'Dano quase todo ' + damageType + '.');
    else if (adShare >= 0.75 || adShare <= 0.25) note(-1, 'Dano concentrado em ' + damageType + '.');
    else if (adShare >= 0.35 && adShare <= 0.65) note(1, 'Dano físico e mágico equilibrados.');
    if (frontline < 1) note(-2, 'Falta uma linha de frente.');
    else if (frontline < 1.5) note(-0.5, 'Linha de frente frágil.');
    if (!engage) note(-2, 'Falta iniciação de luta.');
    else if (engage >= 2) note(1, 'Há mais de uma opção para iniciar lutas.');
    if (profiles.filter(p => p.range >= 2.5).length <= 1) note(-2, 'Poucos campeões com alcance.');
    if (carries >= 2 && !peel && !tanks) note(-2, 'Os carries têm pouca proteção.');
    if (!profiles.some(p => p.wave >= 3.5)) note(-2, 'Falta limpeza de ondas.');
    if (crowdControl < 9) note(-1.5, 'Pouco controle de grupo.');
    else if (crowdControl >= 16) note(1.5, 'Muito controle de grupo.');
    for (const {lane, champion} of team) {
      if (!champion.lanes.includes(lane)) note(-2.5, champion.name + ' fora de posição em ' + laneNames[lane] + '.');
    }

    const sidePower = profiles.map(p => (p.roles.includes('split') ? 45 : 0)
      + (p.roles.includes('bruiser') || p.roles.includes('assassin') ? 15 : 0)
      + p.escape * 7 + p.wave * 5).sort((a, b) => b - a);
    const earlyWeighted = jungle.early * 2 + adc.early * 1.5 + support.early * 1.5 + top.early + mid.early;
    const jungleTempo = jungle.early * 0.6 + jungle.objectivePressure * 0.4;
    const globals = team.filter(pick => globalUlt.has(pick.champion.id)).length;
    const values = {
      tf: 0.22 * limit(crowdControl / 20 * 100) + 0.22 * limit(engage * 34)
        + 0.18 * limit(tanks * 45 + bruisers * 18) + 0.16 * limit(carries * 38 + control * 22)
        + 0.1 * limit(peel * 45 + tanks * 10) + 0.12 * average('mid'),
      ea: 0.4 * (earlyWeighted / 7) + 0.25 * limit(average('earlyObjective') * 20)
        + 0.25 * jungleTempo + 0.1 * limit(average('wave') * 20),
      pk: 0.3 * limit(count('assassin') * 38) + 0.25 * limit(globals * 55)
        + 0.25 * limit(crowdControl / 20 * 100) + 0.2 * limit(total('escape') / 15 * 100),
      sp: ((sidePower[0] + 0.5 * sidePower[1]) / 1.5) / 0.9,
      lt: 0.5 * average('late') + 0.3 * (mid.late + adc.late) / 2
        + 0.2 * limit(peel * 50 + tanks * 15),
      sg: 0.35 * limit(average('range') / 4 * 100) + 0.3 * limit(count('poke') * 45 + control * 15)
        + 0.2 * limit(average('wave') * 20) + 0.15 * limit(average('objective') * 20)
    };
    return {structure, values};
  }

  function analyze({ally: allyPicks = {}, enemy: enemyPicks = {}, meta = null} = {}) {
    const ally = teamFrom(allyPicks), enemy = teamFrom(enemyPicks);
    const picked = {ally: ally.length, enemy: enemy.length};
    const complete = picked.ally === lanes.length && picked.enemy === lanes.length;
    const laneResults = lanes.map(lane => duel(lane, byId.get(allyPicks?.[lane]), byId.get(enemyPicks?.[lane])));
    const cross = crossCounters(ally, enemy);
    const synergies = duos(ally, 'ally').concat(duos(enemy, 'enemy'));
    const metaPicks = metaRows(ally, enemy, meta);
    let structure = [], scenarios = [];
    if (complete) {
      const a = composition(ally, 'ally'), b = composition(enemy, 'enemy');
      structure = a.structure.concat(b.structure);
      scenarios = scenarioWeights.map(([id, label, weight]) => {
        const left = limit(a.values[id]), right = limit(b.values[id]);
        return {id, label, ally: left, enemy: right, points: tenth((left - right) / 100 * weight)};
      });
    }
    const reasons = [];
    const reason = (type, points, text) => {
      if (points) reasons.push({type, points, text});
    };
    for (const row of laneResults) reason('lanes', row.points, row.reason);
    for (const row of cross) reason('cross', row.points, row.reason);
    for (const row of synergies) reason('synergies', row.points,
      sideNames[row.side] + ' · ' + byId.get(row.a).name + ' + ' + byId.get(row.b).name + ' · ' + row.title);
    for (const row of metaPicks) reason('meta', row.points,
      sideNames[row.side] + ' · ' + byId.get(row.id).name + ' · tier ' + row.tier);
    for (const row of structure) reason('structure', row.points, sideNames[row.side] + ' · ' + row.reason);
    for (const row of scenarios) reason('scenarios', row.points,
      row.label + ' · ' + Math.round(row.ally) + ' × ' + Math.round(row.enemy));
    const breakdown = Object.fromEntries(['lanes', 'cross', 'synergies', 'meta', 'structure', 'scenarios']
      .map(type => [type, tenth(sum(reasons.filter(row => row.type === type), row => row.points))]));
    const score = tenth(sum(Object.values(breakdown), value => value));
    reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    return {score, complete, picked, metaUsed: Boolean(meta?.lanes), breakdown, lanes: laneResults,
      cross, synergies, metaPicks, structure, scenarios, reasons};
  }

  window.DRAFT_ANALYZER = Object.freeze({analyze});
})();
