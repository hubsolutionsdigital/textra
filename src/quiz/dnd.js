// Drag and drop that works with mouse, touch and pen (HTML5 drag events don't fire on phones).
//
// Draggables call `dragProps(payload)`; drop zones carry `data-drop="<value>"`. While dragging, a
// floating copy of the element follows the pointer and the zone underneath gets `.qz-over`. A press
// without movement counts as a tap, so every drag can also be done as "tap item, then tap target".

import { useLayoutEffect, useRef } from 'react';

const THRESHOLD = 6;

export function useDrag({ onDrop, onTap, onHover } = {}) {
  const handlers = useRef({});
  handlers.current = { onDrop, onTap, onHover };

  /** `from`: a selector for the element to drag when the handle is only part of it (e.g. a row). */
  function dragProps(payload, { disabled, from } = {}) {
    if (disabled) return {};
    return {
      'data-drag': '',
      // Taps are handled on pointerup; keep the click from also reaching the drop zone around it.
      onClick: (e) => e.stopPropagation(),
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        start(e, payload, from);
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlers.current.onTap?.(payload);
        }
      },
    };
  }

  function start(e, payload, from) {
    const el = (from && e.currentTarget.closest(from)) || e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = el.getBoundingClientRect();
    let ghost = null;
    let over = null;
    let last = { x: startX, y: startY };
    let scrollRaf = 0;
    const pointerId = e.pointerId;

    // Scroll the page while the pointer rests near the top or bottom edge, so targets that are
    // off screen (common on phones) can still be reached.
    const autoScroll = () => {
      const edge = 70;
      const h = window.innerHeight;
      const dy = last.y < edge ? -(edge - last.y) / 4 : last.y > h - edge ? (last.y - (h - edge)) / 4 : 0;
      if (dy) {
        window.scrollBy(0, dy);
        position();
      }
      scrollRaf = requestAnimationFrame(autoScroll);
    };

    const zoneAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]') ?? null;

    const position = () => {
      if (!ghost) return;
      // The ghost is fixed to the viewport; the original element moves with the page as it scrolls.
      const dx = last.x - startX;
      const dy = last.y - startY;
      ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-6, Math.min(6, dx / 30))}deg) scale(1.05)`;
      const zone = zoneAt(last.x, last.y);
      if (zone !== over) {
        over?.classList.remove('qz-over');
        zone?.classList.add('qz-over');
        over = zone;
        if (zone) handlers.current.onHover?.(payload, zone.dataset.drop);
      }
    };

    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      last = { x: ev.clientX, y: ev.clientY };
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!ghost) {
        if (Math.hypot(dx, dy) < THRESHOLD) return;
        ghost = el.cloneNode(true);
        ghost.classList.add('qz-ghost');
        Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
        document.body.appendChild(ghost);
        el.classList.add('qz-dragging');
        document.body.classList.add('qz-is-dragging');
        scrollRaf = requestAnimationFrame(autoScroll);
      }
      ev.preventDefault();
      position();
    };

    const end = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(scrollRaf);
      over?.classList.remove('qz-over');
      el.classList.remove('qz-dragging');
      document.body.classList.remove('qz-is-dragging');
      if (!ghost) {
        if (ev.type === 'pointerup') handlers.current.onTap?.(payload);
        return;
      }
      ghost.remove();
      const zone = ev.type === 'pointerup' ? zoneAt(ev.clientX, ev.clientY) : null;
      if (zone) {
        const z = zone.getBoundingClientRect();
        handlers.current.onDrop?.(payload, zone.dataset.drop, {
          x: (ev.clientX - z.left) / z.width,
          y: (ev.clientY - z.top) / z.height,
        });
      }
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  return dragProps;
}

/**
 * Animates children with `data-flip="<key>"` from their old position to the new one whenever
 * `dep` changes (the FLIP technique), so reordered lists glide instead of jumping.
 */
export function useFlip(dep) {
  const ref = useRef(null);
  const last = useRef(new Map());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    // While dragging, items jump instead of gliding: animated items would sit under the pointer
    // at their old place, and hit-testing them would make the list flip back and forth.
    const animate = !document.body.classList.contains('qz-is-dragging');
    const next = new Map();
    for (const el of root.querySelectorAll('[data-flip]')) {
      const r = el.getBoundingClientRect();
      next.set(el.dataset.flip, r);
      const prev = last.current.get(el.dataset.flip);
      if (!prev || !animate) continue;
      const dx = prev.left - r.left;
      const dy = prev.top - r.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: 320,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      });
    }
    last.current = next;
  }, [dep]);
  return ref;
}
