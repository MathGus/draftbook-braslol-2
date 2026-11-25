(() => {
  'use strict';

  const byId = new Map(window.DRAFT_DATA.champions.map((champion) => [champion.id, champion]));
  const laneNames = {
    Top: 'Topo',
    Jungle: 'Selva',
    Mid: 'Meio',
    ADC: 'Atirador',
    Support: 'Suporte',
  };
  const selector = '[data-matchup-id]';
  const card = element('aside', 'matchup-preview');
  card.id = 'matchup-preview';
  card.setAttribute('role', 'tooltip');
  const hasPopover = typeof card.showPopover === 'function';
  if (hasPopover) card.setAttribute('popover', 'manual');
  card.hidden = true;
  let anchor = null;
  let pinned = false;
  let leaveTimer;
  let previousTitle = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function wrapSlot(button, id, lane) {
    const wrapper = element('div', 'matchup-slot');
    const info = element('button', 'matchup-info', 'Ficha');
    info.type = 'button';
    info.setAttribute('aria-label', 'Ver confrontos de ' + byId.get(id).name);
    info.setAttribute('aria-expanded', 'false');
    for (const target of [button, info]) {
      target.dataset.matchupId = id;
      if (lane) target.dataset.matchupLane = lane;
    }
    wrapper.append(button, info);
    return wrapper;
  }

  function opponents(label, ids, className) {
    const group = element('div', className);
    const list = element('ul');
    for (const id of ids) list.append(element('li', '', byId.get(id).name));
    group.append(
      element('strong', '', label),
      ids.length ? list : element('span', '', 'Nenhum cadastrado'),
    );
    return group;
  }

  function content(champion, lane) {
    const heading = element('header', 'matchup-heading');
    const image = element('img');
    image.src = 'assets/champions/' + encodeURIComponent(champion.id) + '.webp';
    image.alt = '';
    heading.append(image, element('strong', '', champion.name));
    card.replaceChildren(heading);
    const offRole = lane && !champion.matchups[lane];
    if (offRole) {
      card.append(
        element(
          'p',
          'matchup-unlisted',
          'Sem ficha de confrontos na posição escolhida (' + laneNames[lane] + ').',
        ),
      );
    }
    const positions = offRole ? [champion.lanes[0]] : lane ? [lane] : champion.lanes;
    for (const position of positions) {
      const sheet = champion.matchups[position];
      const section = element('section', 'matchup-route');
      section.append(element('h3', '', laneNames[position] + (offRole ? ' · rota principal' : '')));
      const columns = element('div', 'matchup-columns');
      columns.append(
        opponents('Forte contra', sheet.strong, 'matchup-strong'),
        opponents('Fraco contra', sheet.weak, 'matchup-weak'),
      );
      section.append(columns);
      card.append(section);
    }
  }

  function place() {
    const box = anchor.getBoundingClientRect();
    const margin = 8;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const above = box.top - margin * 2;
    const below = height - box.bottom - margin * 2;
    const dialog = anchor.closest('dialog')?.getBoundingClientRect();
    const beside = dialog && width - dialog.right >= card.offsetWidth + margin * 2;
    card.style.maxHeight =
      Math.max(0, beside ? height - margin * 2 : Math.max(above, below)) + 'px';
    const left = beside ? dialog.right + margin : box.left + (box.width - card.offsetWidth) / 2;
    const top = beside
      ? box.top
      : below >= card.offsetHeight || below >= above
        ? box.bottom + margin
        : box.top - margin - card.offsetHeight;
    card.style.left = Math.max(margin, Math.min(left, width - card.offsetWidth - margin)) + 'px';
    card.style.top = Math.max(margin, Math.min(top, height - card.offsetHeight - margin)) + 'px';
  }

  function close() {
    clearTimeout(leaveTimer);
    if (!anchor) return;
    anchor.removeAttribute('aria-describedby');
    if (previousTitle !== null) anchor.setAttribute('title', previousTitle);
    if (anchor.matches('.matchup-info')) anchor.setAttribute('aria-expanded', 'false');
    if (hasPopover && card.matches(':popover-open')) card.hidePopover();
    card.hidden = true;
    card.remove();
    anchor = null;
    pinned = false;
  }

  function open(target, pin = false) {
    clearTimeout(leaveTimer);
    if (target === anchor) {
      if (pin) pinned = true;
      return;
    }
    close();
    const champion = byId.get(target.dataset.matchupId);
    if (!champion) return;
    anchor = target;
    pinned = pin;
    previousTitle = anchor.getAttribute('title');
    // Avoid a second browser-generated tooltip covering the matchups.
    anchor.removeAttribute('title');
    if (anchor.matches('.matchup-info')) anchor.setAttribute('aria-expanded', 'true');
    content(champion, target.dataset.matchupLane);
    (target.closest('dialog') || document.body).append(card);
    card.hidden = false;
    if (hasPopover) card.showPopover();
    card.scrollTop = 0;
    place();
    target.setAttribute('aria-describedby', card.id);
  }

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    if (card.contains(event.target)) {
      clearTimeout(leaveTimer);
      return;
    }
    const target = event.target.closest(selector);
    if (target) open(target);
  });
  document.addEventListener('pointerout', (event) => {
    if (!anchor || pinned || event.pointerType === 'touch') return;
    if (!anchor.contains(event.target) && !card.contains(event.target)) return;
    const next = event.relatedTarget;
    if (next && (anchor.contains(next) || card.contains(next))) return;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(close, 160);
  });
  document.addEventListener('focusin', (event) => {
    const target = event.target.closest(selector);
    if (target?.matches(':focus-visible')) open(target);
    else if (target !== anchor) close();
  });
  document.addEventListener('focusout', (event) => {
    if (event.target === anchor && !pinned) close();
  });
  document.addEventListener(
    'click',
    (event) => {
      const info = event.target.closest('.matchup-info');
      if (info) {
        if (anchor === info && pinned) close();
        else open(info, true);
      } else if (!card.contains(event.target)) {
        close();
      }
    },
    true,
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && anchor) {
      close();
      event.preventDefault();
    }
  });
  document.addEventListener(
    'scroll',
    (event) => {
      if (anchor && !card.contains(event.target)) close();
    },
    true,
  );
  document.addEventListener('close', close, true);
  window.addEventListener('resize', close);
  window.MATCHUP_PREVIEW = Object.freeze({ wrapSlot, close });
})();
