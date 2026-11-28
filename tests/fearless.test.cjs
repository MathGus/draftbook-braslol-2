const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
for (const name of [
  'draft-data',
  'fearless',
  'draft-analyzer',
  'pick-suggestions',
  'ban-suggestions',
]) {
  const filename = join(__dirname, '..', 'dist', `${name}.js`);
  vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
}

const { FEARLESS, DRAFT_DATA, PICK_SUGGESTIONS, BAN_SUGGESTIONS } = context.window;
const ids = DRAFT_DATA.champions.map((champion) => champion.id);

function board(game, pool = ids) {
  const offset = (game - 1) * 10;
  const team = (start) =>
    Object.fromEntries(DRAFT_DATA.lanes.map((lane, i) => [lane, pool[start + i]]));
  return { picks: { ally: team(offset), enemy: team(offset + 5) }, bans: { ally: [], enemy: [] } };
}

test('picks dos dois times ficam bloqueados e bans voltam no jogo seguinte', () => {
  const first = board(1);
  const next = board(2);
  first.bans.enemy.push(next.picks.ally.Top);
  const series = FEARLESS.record(FEARLESS.empty(3), first, 'ally');
  assert.equal(FEARLESS.locks(series).size, 10);
  assert.ok(FEARLESS.record(series, next, 'enemy'));

  next.picks.enemy.Mid = first.picks.ally.Top;
  assert.equal(FEARLESS.record(series, next, 'enemy'), null);
  const invalidBan = board(2);
  invalidBan.bans.ally.push(first.picks.enemy.Top);
  assert.equal(FEARLESS.record(series, invalidBan, 'enemy'), null);
});

test('MD3 encerra em 2–0, preserva o último draft na recarga e permite reabri-lo', () => {
  const first = FEARLESS.record(FEARLESS.empty(3), board(1), 'enemy');
  const closed = FEARLESS.record(first, board(2), 'enemy');
  const saved = JSON.parse(JSON.stringify(closed));
  const restored = FEARLESS.restore(saved, (game) => game);
  assert.deepEqual(restored, closed);
  assert.ok(FEARLESS.finished(restored));
  assert.equal(FEARLESS.record(restored, board(3), 'ally'), null);
  assert.equal(FEARLESS.locks(restored).has(board(2).picks.ally.Top), false);

  const reopened = FEARLESS.undo(restored);
  assert.deepEqual(reopened, first);
  assert.equal(FEARLESS.finished(reopened), false);
  const tied = FEARLESS.record(reopened, restored.history.at(-1), 'ally');
  assert.deepEqual({ ...FEARLESS.wins(tied) }, { ally: 1, enemy: 1 });

  saved.history[1].picks.enemy.Mid = saved.history[0].picks.ally.Top;
  assert.deepEqual(
    FEARLESS.restore(saved, (game) => game),
    first,
  );
});

test('o quinto jogo da MD5 mantém 40 picks bloqueados, inclusive após o resultado', () => {
  let series = FEARLESS.empty(5);
  for (const [index, winner] of ['ally', 'enemy', 'ally', 'enemy'].entries()) {
    series = FEARLESS.record(series, board(index + 1), winner);
  }
  const locks = FEARLESS.locks(series);
  assert.equal(locks.size, 40);
  assert.equal(locks.get(board(4).picks.enemy.Support), 4);
  const closed = FEARLESS.record(series, board(5), 'ally');
  assert.ok(FEARLESS.finished(closed));
  assert.deepEqual(FEARLESS.locks(closed), locks);
});

test('os rankings de picks e bans substituem campeões já usados na série', () => {
  const setup = { ally: {}, enemy: {}, bans: [] };
  const picks = () => PICK_SUGGESTIONS.rank(setup, 'ally', 'Jungle');
  const bans = () => BAN_SUGGESTIONS.rank(setup, 'enemy');
  const leaders = [...picks(), ...bans()].map(({ champion }) => champion.id);
  const pool = [...new Set([...leaders, ...ids])];
  const series = FEARLESS.record(FEARLESS.empty(3), board(1, pool), 'ally');
  setup.seriesLocks = FEARLESS.locks(series);

  for (const ranked of [picks(), bans()]) {
    assert.equal(ranked.length, 3);
    for (const { champion } of ranked) assert.equal(setup.seriesLocks.has(champion.id), false);
  }
});
