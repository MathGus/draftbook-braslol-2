(() => {
  'use strict';

  const { champions, lanes } = window.DRAFT_DATA;
  const names = new Map(champions.map(({ id, name }) => [id, name]));
  const teams = { ally: 'Seu time', enemy: 'Adversário' };
  const sides = Object.keys(teams);
  const byId = (id) => document.getElementById(id);

  function historyItem(game, index) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `Jogo ${index + 1} · Vitória ${game.winner === 'ally' ? 'do seu time' : 'do adversário'}`;
    item.append(title);
    for (const side of sides) {
      const row = document.createElement('p');
      const label = document.createElement('b');
      label.className = 'series-' + side;
      label.textContent = teams[side];
      const teamPicks = lanes.map((lane) => names.get(game.picks[side][lane]));
      row.append(label, ' · ' + teamPicks.join(', '));
      item.append(row);
    }
    return item;
  }

  function hasSelections({ picks, bans }) {
    return sides.some(
      (side) => Object.values(picks[side]).some(Boolean) || bans[side].some(Boolean),
    );
  }

  function bind({ onFormat, onResult, onUndo, onRestart }) {
    const format = byId('series-format');
    const gameHeading = byId('series-game');
    const score = byId('series-score');
    const history = byId('series-history');
    const dialog = byId('series-dialog');
    const confirmButton = byId('series-confirm');
    let state;
    let renderedHistory;
    let confirmedAction;

    function confirmChange(title, description, label, action) {
      byId('series-dialog-title').textContent = title;
      byId('series-dialog-description').textContent = description;
      confirmButton.textContent = label;
      confirmedAction = action;
      dialog.showModal();
    }

    function focusGame() {
      (state.series.bestOf === 1 ? format : gameHeading).focus({ preventScroll: true });
    }

    byId('series-cancel').addEventListener('click', () => dialog.close());
    confirmButton.addEventListener('click', () => {
      dialog.close();
      confirmedAction();
      focusGame();
    });

    format.addEventListener('change', () => {
      const bestOf = Number(format.value);
      if (!state.series.history.length) {
        onFormat(bestOf);
        return;
      }
      format.value = String(state.series.bestOf);
      confirmChange(
        'Trocar o formato?',
        'O draft atual, o placar e o histórico serão apagados ao trocar de formato.',
        'Trocar formato',
        () => onFormat(bestOf),
      );
    });

    for (const side of sides) {
      byId('series-result-' + side).addEventListener('click', () => {
        onResult(side);
        focusGame();
      });
    }

    byId('series-restart').addEventListener('click', () => {
      confirmChange(
        'Começar uma nova série?',
        'O draft atual e o histórico serão apagados. Os dois times voltam ao jogo 1 com todos os campeões disponíveis.',
        'Começar nova série',
        onRestart,
      );
    });
    byId('series-undo').addEventListener('click', () => {
      if (window.FEARLESS.finished(state.series) || !hasSelections(state)) {
        onUndo();
        focusGame();
        return;
      }
      confirmChange(
        'Reabrir o jogo anterior?',
        'As escolhas do jogo atual serão apagadas. Você poderá editar o draft anterior e registrar o resultado de novo.',
        'Reabrir jogo',
        onUndo,
      );
    });

    function render(nextState) {
      state = nextState;
      if (dialog.open) dialog.close();
      const { series } = state;
      const active = series.bestOf > 1;
      format.value = String(series.bestOf);
      byId('series-panel').hidden = !active;
      if (!active) {
        history.open = false;
        return;
      }

      const total = window.FEARLESS.wins(series);
      const done = window.FEARLESS.finished(series);
      const game = series.history.length + (done ? 0 : 1);
      const title = done
        ? `${total.ally > total.enemy ? 'Seu time venceu' : 'O adversário venceu'} a série`
        : `Jogo ${game} de ${series.bestOf}`;
      const placar = `Seu time ${total.ally} × ${total.enemy} Adversário`;
      if (gameHeading.textContent !== title) gameHeading.textContent = title;
      if (score.textContent !== placar) score.textContent = placar;

      const complete = sides.every((side) => lanes.every((lane) => state.picks[side][lane]));
      byId('series-result').hidden = done;
      byId('series-question').textContent = `Quem venceu o jogo ${game}?`;
      for (const side of sides) byId('series-result-' + side).disabled = !complete || done;
      byId('series-hint').hidden = complete;

      const hasHistory = series.history.length > 0;
      byId('series-undo').hidden = !hasHistory;
      byId('series-tools').hidden = !hasHistory && !hasSelections(state);
      history.hidden = !hasHistory;
      if (!hasHistory) history.open = false;
      if (renderedHistory !== series.history) {
        byId('series-history-list').replaceChildren(...series.history.map(historyItem));
        renderedHistory = series.history;
      }
    }

    return { render };
  }

  window.FEARLESS_VIEW = Object.freeze({ bind });
})();
