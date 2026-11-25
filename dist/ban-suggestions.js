(() => {
  'use strict';

  const {champions, lanes} = window.DRAFT_DATA;
  const byId = new Map(champions.map(champion => [champion.id, champion]));
  const collator = new Intl.Collator('pt-BR');
  const number = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1});
  const laneNames = {Top: 'topo', Jungle: 'selva', Mid: 'meio', ADC: 'atirador', Support: 'suporte'};

  function explain(proposal, pickingSide, banningSide) {
    const {champion, lane, openLanes, average, result} = proposal;
    const sign = pickingSide === 'ally' ? 1 : -1;
    const reasons = [];
    const duel = result.lanes.find(row => row.lane === lane);
    if (duel && duel.points * sign > 0) {
      const opposing = byId.get(duel[banningSide]);
      reasons.push('Evita o confronto favorável de ' + champion.name + ' contra ' + opposing.name + '.');
    }
    for (const pair of result.synergies) {
      if (pair.side !== pickingSide || (pair.a !== champion.id && pair.b !== champion.id)) continue;
      const partner = byId.get(pair.a === champion.id ? pair.b : pair.a);
      reasons.push('Impede a dupla com ' + partner.name + ' · ' + pair.title + '.');
    }
    const tier = result.metaPicks.find(row => row.id === champion.id && row.side === pickingSide)?.tier;
    if (tier === 'S' || tier === 'A') reasons.push('Tier ' + tier + ' no meta deste draft.');

    const crossTotals = new Map();
    for (const row of result.cross) {
      if (row[pickingSide] !== champion.id) continue;
      const id = row[banningSide];
      crossTotals.set(id, (crossTotals.get(id) || 0) + sign * row.points);
    }
    for (const [id, advantage] of crossTotals) {
      if (advantage > 0) reasons.push('Nega um counter de ' + byId.get(id).name + ' entre rotas.');
    }
    if (!reasons.length && result.complete) {
      const strongest = result.scenarios.reduce((best, row) =>
        !best || row.points * sign > best.points * sign ? row : best, null);
      if (strongest?.points * sign > 0) {
        reasons.push('Com esse pick, a composição teria vantagem em ' + strongest.label.toLocaleLowerCase('pt-BR') + '.');
      }
    }
    if (openLanes.length > 1) {
      reasons.push('Cobre ' + openLanes.length + ' rotas ainda livres (' + openLanes.map(l => laneNames[l]).join(', ') + ').');
    }
    if (reasons.length < 2) {
      reasons.push('A força média no início, meio e fim de jogo é de ' + number.format(average) + '/100.');
    }
    return reasons.slice(0, 3);
  }

  function rank(setup, banningSide) {
    if (!setup || !['ally','enemy'].includes(banningSide)) return [];
    const pickingSide = banningSide === 'ally' ? 'enemy' : 'ally';
    const picks = setup[pickingSide] || {};
    const open = lanes.filter(lane => !picks[lane]);
    if (!open.length) return [];
    const unavailable = new Set([
      ...Object.values(setup.ally || {}), ...Object.values(setup.enemy || {}), ...(setup.bans || [])
    ]);
    const sign = pickingSide === 'ally' ? 1 : -1;
    const proposals = [];

    for (const champion of champions) {
      if (unavailable.has(champion.id)) continue;
      // The game's preferred lane comes first; on equal scores keep that placement.
      const openLanes = champion.lanes.filter(lane => open.includes(lane));
      let best;
      for (const lane of openLanes) {
        const result = window.DRAFT_ANALYZER.analyze({
          ally: setup.ally, enemy: setup.enemy, [pickingSide]: {...picks, [lane]: champion.id},
          meta: setup.meta || null
        });
        const score = sign * result.score || 0;
        if (!best || score > best.score) best = {lane, score, result};
      }
      if (!best) continue;
      const {early, mid, late} = champion.profile;
      proposals.push({...best, champion, openLanes, average: (early + mid + late) / 3});
    }
    return proposals.sort((a, b) => b.score - a.score || b.openLanes.length - a.openLanes.length
      || b.average - a.average || collator.compare(a.champion.name, b.champion.name))
      .slice(0, 3)
      .map(proposal => ({
        champion: proposal.champion, lane: proposal.lane, score: proposal.score,
        openLanes: proposal.openLanes, reasons: explain(proposal, pickingSide, banningSide)
      }));
  }

  window.BAN_SUGGESTIONS = Object.freeze({rank});
})();
