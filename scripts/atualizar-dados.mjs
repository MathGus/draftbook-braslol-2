import assert from 'node:assert/strict';
import { writeFile, rename, rm } from 'node:fs/promises';

const root = 'https://braslol2.pages.dev/';
const lanes = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const files = {
  champions: ['js/data/champions.js', 'CHAMPIONS'],
  matchups: ['js/draft/champ-matchups.js', 'CHAMP_MATCHUPS'],
  synergies: ['js/draft/champ-synergies.js', 'CHAMP_SYN'],
  profiles: ['js/draft/champ-profiles.js', 'CHAMP_PROFILES'],
  utility: ['js/draft/champ-utility.js', 'CHAMP_UTIL'],
};

// Read only the first frozen data literal. No remote JavaScript is executed.
function readTable(source, variable) {
  const declaration = new RegExp('\\bconst\\s+' + variable + '\\s*=\\s*Object\\.freeze\\(');
  const start = declaration.exec(source);
  assert.ok(start, 'Declaração ausente: ' + variable);
  const token = /\s+|"(?:\\.|[^"\\])*"|Object\.freeze\(|[A-Za-z_$][A-Za-z0-9_$]*|-?\d+(?:\.\d+)?|-?\.\d+|[\])}:,[{]/y;
  token.lastIndex = start.index + start[0].length;
  let freezes = 1;
  let json = '';
  while (freezes > 0) {
    const offset = token.lastIndex;
    const match = token.exec(source);
    assert.ok(match, 'Sintaxe de dados inesperada em ' + variable + ', posição ' + offset);
    const part = match[0];
    if (!part.trim()) continue;
    if (part === 'Object.freeze(') freezes++;
    else if (part === ')') freezes--;
    else if (part.startsWith('"')) json += part.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1');
    else if (/^[A-Za-z_$]/.test(part)) json += JSON.stringify(part);
    else if (part.startsWith('.')) json += '0' + part;
    else if (part.startsWith('-.')) json += '-0' + part.slice(1);
    else json += part;
  }
  return JSON.parse(json);
}

async function fetchTable([path, variable]) {
  const response = await fetch(new URL(path, root), {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
  return readTable(await response.text(), variable);
}

// Brief descriptions of the interactions documented in CHAMP_SYN.
const comboNotes = {
  'Renekton/Sejuani': 'O controle de Sejuani dá tempo para Renekton bater de perto, especialmente nos duelos de dupla do início.',
  'Jayce/Maokai': 'Maokai imobiliza o adversário e facilita o poke de Jayce a distância.',
  'Rumble/JarvanIV': 'Jarvan IV fecha a arena e mantém os adversários na zona de dano da ultimate de Rumble.',
  'Olaf/Ivern': 'Ivern protege Olaf enquanto ele avança de ultimate até o alvo.',
  'Aurora/Nocturne': 'A mobilidade dos dois ajuda a perseguir um inimigo isolado até o abate.',
  'Ahri/Vi': 'Vi alcança o alvo com a ultimate. Ahri prolonga o controle com o charme.',
  'Yone/Ivern': 'O escudo de Ivern protege a entrada de Yone. A raiz do Q ajuda a manter o alvo ao alcance.',
  'Orianna/JarvanIV': 'A arena de Jarvan IV agrupa os alvos para a Onda de Choque de Orianna.',
  'Annie/XinZhao': 'O escudo de Annie devolve dano a quem ataca Xin Zhao quando ele entra na luta.',
  'Orianna/Nocturne': 'Nocturne pode levar a esfera de Orianna consigo na entrada de ultimate e posicionar a Onda de Choque.',
  'Aurora/Ahri': 'Depois de um abate, a mobilidade das duas facilita continuar a perseguição.',
  'Camille/Galio': 'Camille isola um inimigo na ultimate e oferece a Galio um ponto de chegada para reforçar o ataque.',
  'Malphite/Yasuo': 'Malphite lança os inimigos ao ar e habilita a ultimate de Yasuo em quem foi atingido.',
  'Yone/Yasuo': 'Os irmãos pressionam as rotas laterais. Quando se juntam, Yone pode preparar a ultimate de Yasuo.',
  'Aatrox/Azir': 'O jogo associa a dupla a lutas de equipe prolongadas.',
  'Lucian/Nami': 'As melhorias de dano, a cura e a proteção de Nami sustentam as trocas de Lucian.',
  'Lucian/Milio': 'O alcance extra e os escudos favorecem as trocas de Lucian. Milio também pode livrá-lo de controle.',
  'Kalista/Renata': 'As habilidades das duas favorecem a pressão na rota inferior e as primeiras lutas de equipe.',
  'Yunara/Lulu': 'Lulu protege Yunara com escudos, velocidade e ultimate enquanto a atiradora escala.',
  'Zeri/Lulu': 'Os escudos e a velocidade de Lulu ajudam Zeri a se manter viva e continuar causando dano.',
  'Zeri/Yuumi': 'A dupla precisa atravessar uma rota inicial fraca. Seu dano ganha força depois dos itens principais.',
  'Corki/Nami': 'Com cura e reforço de dano de Nami, Corki pode desgastar o alvo ou se comprometer com o abate.',
  'Ashe/Braum': 'O controle dos dois ajuda a proteger a rota e a travar adversários nas lutas em equipe.',
  'Ezreal/Karma': 'A dupla pressiona a distância e Karma protege Ezreal quando o adversário tenta se aproximar.',
  'Aphelios/Thresh': 'O gancho abre a oportunidade de abate para Aphelios. A lanterna oferece uma saída.',
  'Xayah/Rakan': 'As interações especiais entre os dois ajudam a dupla a jogar tanto a rota quanto as lutas posteriores.',
  'MissFortune/Amumu': 'A ultimate de Amumu segura vários inimigos dentro da área de disparo de Miss Fortune.',
  'Ashe/Seraphine': 'As ultimates podem ser encadeadas, prolongando o controle e dando sequência à iniciação da equipe.',
};

const tables = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, spec]) => [key, await fetchTable(spec)])));
const byId = new Map(tables.champions.map(champion => [champion.id, champion]));
assert.equal(byId.size, tables.champions.length, 'IDs de campeão duplicados');
assert.ok(byId.size > 0);

const champions = tables.champions.map(({id, name, lanes: championLanes}) => {
  const matchups = {};
  for (const lane of championLanes) {
    assert.ok(lanes.includes(lane));
    const raw = tables.matchups[id]?.[lane];
    assert.ok(Array.isArray(raw) && raw.length === 2, 'Confronto ausente: ' + id + '/' + lane);
    // dMatch in draft.js filters incompatible, duplicate and self references, then takes the first three.
    const relation = ids => [...new Set(ids)].filter(other => other !== id && byId.get(other)?.lanes.includes(lane)).slice(0, 3);
    matchups[lane] = {strong: relation(raw[0]), weak: relation(raw[1])};
  }
  const [early, mid, late, , objectivePressure, roles] = tables.profiles[id];
  const [cc, range, damage, escape, wave, objective, earlyObjective] = tables.utility[id];
  for (const phase of [early, mid, late]) assert.ok(Number.isFinite(phase) && phase >= 0 && phase <= 100);
  assert.ok(Array.isArray(roles) && ['AD', 'AP', 'H'].includes(damage));
  for (const value of [cc, range, escape, wave, objective, earlyObjective]) {
    assert.ok(value >= 0 && value <= 5 && Number.isInteger(value * 2));
  }
  return {id, name, lanes: championLanes, matchups, synergies: [],
    profile: {early, mid, late, roles, damage, objectivePressure, cc, range, escape, wave, objective, earlyObjective}};
});

const resultById = new Map(champions.map(champion => [champion.id, champion]));
for (const [laneIndexA, idA, laneIndexB, idB, title] of tables.synergies) {
  const a = resultById.get(idA);
  const b = resultById.get(idB);
  const laneA = lanes[laneIndexA];
  const laneB = lanes[laneIndexB];
  assert.ok(a?.lanes.includes(laneA) && b?.lanes.includes(laneB), 'Dupla fora das rotas: ' + idA + '/' + idB);
  const description = comboNotes[idA + '/' + idB] || '';
  a.synergies.push({lane: laneA, ally: idB, allyLane: laneB, title, description});
  b.synergies.push({lane: laneB, ally: idA, allyLane: laneA, title, description});
}

const sources = Object.fromEntries(Object.entries(files).map(([key, [path]]) => [key, new URL(path, root).href]));
sources.draft = new URL('js/draft/draft.js', root).href;
sources.analysis = new URL('js/draft/draft-analise.js', root).href;
const updated = new Date().toISOString().slice(0, 10);
const data = {champions, lanes, sources, updated};
const destination = new URL('../dist/draft-data.js', import.meta.url);
const temporary = new URL('../dist/.draft-data-' + process.pid + '.tmp', import.meta.url);
try {
  await writeFile(temporary, 'window.DRAFT_DATA = ' + JSON.stringify(data) + ';\n', {flag: 'wx'});
  await rename(temporary, destination);
} finally {
  await rm(temporary, {force: true});
}
console.log(champions.length + ' campeões, ' + champions.reduce((sum, c) => sum + c.lanes.length, 0) + ' fichas de rota, ' + tables.synergies.length + ' sinergias.');
