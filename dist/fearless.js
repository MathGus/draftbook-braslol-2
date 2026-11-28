(() => {
  'use strict';

  const { champions, lanes } = window.DRAFT_DATA;
  const championIds = new Set(champions.map((champion) => champion.id));
  const sides = ['ally', 'enemy'];

  function empty(bestOf = 1) {
    return { bestOf: bestOf === 3 || bestOf === 5 ? bestOf : 1, history: [] };
  }

  function wins(series) {
    const score = { ally: 0, enemy: 0 };
    for (const game of series.history) score[game.winner]++;
    return score;
  }

  function finished(series) {
    if (series.bestOf === 1) return false;
    const score = wins(series);
    const target = (series.bestOf + 1) / 2;
    return score.ally >= target || score.enemy >= target;
  }

  function locks(series) {
    const result = new Map();
    // O jogo decisivo continua visível depois que a série termina.
    const previousGames = finished(series) ? series.history.slice(0, -1) : series.history;
    previousGames.forEach((game, index) => {
      for (const side of sides) {
        for (const lane of lanes) result.set(game.picks[side][lane], index + 1);
      }
    });
    return result;
  }

  function record(series, board, winner) {
    if (series.bestOf === 1 || finished(series) || !sides.includes(winner)) return null;

    const used = new Set(locks(series).keys());
    const picks = { ally: {}, enemy: {} };
    const bans = { ally: Array(5).fill(null), enemy: Array(5).fill(null) };
    for (const side of sides) {
      for (const lane of lanes) {
        const id = board?.picks?.[side]?.[lane];
        if (!championIds.has(id) || used.has(id)) return null;
        picks[side][lane] = id;
        used.add(id);
      }

      const teamBans = board?.bans?.[side] ?? [];
      if (!Array.isArray(teamBans) || teamBans.length > 5) return null;
      for (let index = 0; index < teamBans.length; index++) {
        const id = teamBans[index];
        if (id == null) continue;
        if (!championIds.has(id) || used.has(id)) return null;
        bans[side][index] = id;
        used.add(id);
      }
    }

    return { bestOf: series.bestOf, history: [...series.history, { picks, bans, winner }] };
  }

  function restore(raw, readBoard) {
    let series = empty(raw?.bestOf);
    if (series.bestOf === 1 || !Array.isArray(raw?.history)) return series;
    for (const game of raw.history) {
      if (finished(series) || !sides.includes(game?.winner)) break;
      const board = readBoard(game, new Set(locks(series).keys()));
      const next = record(series, board, game.winner);
      if (!next) break;
      series = next;
    }
    return series;
  }

  function undo(series) {
    if (!series.history.length) return null;
    return { bestOf: series.bestOf, history: series.history.slice(0, -1) };
  }

  window.FEARLESS = Object.freeze({ empty, restore, wins, finished, locks, record, undo });
})();
