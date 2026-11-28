(() => {
  'use strict';

  function bind(board, swap) {
    const pick = '.sim-slot[data-kind="pick"]:enabled';
    let drag = null;
    let suppressClick = false;

    function destination(event) {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      const slot = hit?.closest(pick) || hit?.closest('.matchup-slot')?.querySelector(pick);
      return slot && slot !== drag.source && slot.dataset.side === drag.source.dataset.side
        ? slot
        : null;
    }

    function cancel() {
      if (!drag) return;
      const { source, pointer, row, target, ghost } = drag;
      drag = null;
      row.classList.remove('swap-active');
      source.classList.remove('swap-source');
      target?.classList.remove('swap-target');
      ghost?.remove();
      if (source.hasPointerCapture(pointer)) source.releasePointerCapture(pointer);
    }

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (event.isPrimary && !drag?.ghost) suppressClick = false;
      },
      true,
    );
    board.addEventListener('pointerdown', (event) => {
      const source = event.target.closest(pick);
      if (!source || source.dataset.filled !== 'true' || !event.isPrimary || event.button !== 0)
        return;
      cancel();
      drag = {
        source,
        pointer: event.pointerId,
        row: source.closest('.sim-picks'),
        startX: event.clientX,
        startY: event.clientY,
        id: source.dataset.matchupId,
      };
    });
    board.addEventListener('dragstart', (event) => {
      if (event.target.closest(pick)) event.preventDefault();
    });
    board.addEventListener('pointerover', (event) => {
      if (drag?.ghost) event.stopPropagation();
    });

    document.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      if (event.buttons === 0) {
        cancel();
        return;
      }
      if (!drag.ghost) {
        const dx = event.clientX - drag.startX,
          dy = event.clientY - drag.startY;
        if (Math.hypot(dx, dy) < 8) return;
        if (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) {
          cancel();
          return;
        }
        window.MATCHUP_PREVIEW.close();
        drag.source.setPointerCapture(drag.pointer);
        drag.row.classList.add('swap-active');
        drag.source.classList.add('swap-source');
        drag.ghost = drag.source.querySelector('.slot-portrait img').cloneNode();
        drag.ghost.className = 'swap-ghost';
        drag.ghost.setAttribute('aria-hidden', 'true');
        document.body.append(drag.ghost);
        suppressClick = true;
      }
      event.preventDefault();
      drag.ghost.style.transform =
        'translate(' + (event.clientX + 12) + 'px,' + (event.clientY + 12) + 'px)';
      const next = destination(event);
      if (next !== drag.target) {
        drag.target?.classList.remove('swap-target');
        next?.classList.add('swap-target');
        drag.target = next;
      }
    });
    document.addEventListener('pointerup', (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const { source, ghost, id } = drag;
      const target = ghost && destination(event);
      cancel();
      if (target) swap(source.dataset.side, source.dataset.slot, target.dataset.slot, id);
    });
    document.addEventListener(
      'click',
      (event) => {
        if (!suppressClick || event.detail === 0) return;
        suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
    document.addEventListener('pointercancel', (event) => {
      if (drag?.pointer === event.pointerId) cancel();
    });
    board.addEventListener('lostpointercapture', (event) => {
      if (drag?.pointer === event.pointerId && event.target === drag.source) cancel();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') cancel();
    });
    window.addEventListener('blur', cancel);
    return { cancel };
  }

  window.DRAFT_SWAP = Object.freeze({ bind });
})();
