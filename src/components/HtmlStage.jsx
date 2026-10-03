import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

export const DEVICES = [
  { id: 'desktop', label: 'Desktop', icon: '🖥️', width: 1440, height: null },
  { id: 'laptop', label: 'Laptop', icon: '💻', width: 1280, height: null },
  { id: 'tablet', label: 'Tablet', icon: '📱', width: 768, height: 1024 },
  { id: 'mobile', label: 'Mobile', icon: '📱', width: 390, height: 844 },
];

export const deviceLabel = (id) => DEVICES.find((d) => d.id === id)?.label;

/**
 * Shows an uploaded HTML prototype in a sandboxed iframe at a chosen screen size.
 * Pins are drawn inside the page by the injected helper (server/public/frame.js), so they stay
 * attached to their element while the page scrolls and animates. Popovers (comment cards, the
 * composer) are rendered here, positioned from coordinates the helper reports.
 *
 * renderPopover({ kind: 'pin' | 'draft', id, left, top, flip }) returns the popover element.
 */
const HtmlStage = forwardRef(function HtmlStage(
  {
    src,
    device,
    pins,
    commentMode,
    onPageClick,
    onHiddenChange,
    onPinClick,
    activeId,
    draftAnchor,
    renderPopover,
    onDismiss,
    onPageError,
  },
  ref,
) {
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [page, setPage] = useState(null);
  const [loadCount, setLoadCount] = useState(0); // bumps on every page load inside the frame, incl. reloads
  const [hover, setHover] = useState(null); // { id, x, y } in iframe px
  const [anchorPos, setAnchorPos] = useState(null); // where the active pin / draft popover sits
  const preset = DEVICES.find((d) => d.id === device) ?? DEVICES[0];

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 24;
  const scale = size.w ? Math.min(1, (size.w - pad * 2) / preset.width) : 1;
  const frameHeight = preset.height ?? Math.max(400, (size.h - pad * 2) / scale);
  const frameLeft = Math.max(pad, (size.w - preset.width * scale) / 2);

  const post = (msg) => frameRef.current?.contentWindow?.postMessage({ __portal: true, ...msg }, '*');

  // Only pins for the page currently open inside the prototype (multi-page zips).
  const visiblePins = page === null ? [] : pins.filter((p) => (p.page ?? '') === page || (!p.page && page === ''));

  useEffect(() => {
    post({ type: 'pins', pins: visiblePins.map((p) => ({ ...p, active: p.id === activeId })) });
  });
  useEffect(() => post({ type: 'mode', mode: commentMode ? 'comment' : 'browse' }), [commentMode, loadCount]);
  useEffect(() => post({ type: 'draft', anchor: draftAnchor }), [draftAnchor, loadCount]);

  useImperativeHandle(ref, () => ({ focus: (id) => post({ type: 'focus', id }) }));

  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== frameRef.current?.contentWindow || !e.data?.__portal) return;
      const m = e.data;
      if (m.type === 'ready') {
        setPage(m.page);
        setLoadCount((n) => n + 1);
        setHover(null);
        setAnchorPos(null);
      } else if (m.type === 'click') {
        setAnchorPos({ x: m.x, y: m.y });
        onPageClick?.({ anchor: m.anchor });
      } else if (m.type === 'pin-hover') setHover({ id: m.id, x: m.x, y: m.y });
      else if (m.type === 'pin-leave') setHover((h) => (h?.id === m.id ? null : h));
      else if (m.type === 'pin-click') {
        setAnchorPos({ x: m.x, y: m.y });
        onPinClick?.(m.id);
      } else if (m.type === 'hidden') onHiddenChange?.(m.ids);
      else if (m.type === 'page-error') onPageError?.(m);
      else if (m.type === 'scroll') {
        setHover(null);
        onDismiss?.();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  // Converts a point inside the (scaled) iframe into a position in this stage.
  const toStage = (pt) => ({ left: frameLeft + pt.x * scale, top: pad + pt.y * scale });
  const popoverAt = (pt, extra) => {
    const { left, top } = toStage(pt);
    // Slide the popover up just enough to keep it inside the visible area.
    const scrollTop = wrapRef.current?.scrollTop ?? 0;
    const needed = extra.kind === 'draft' ? 450 : 230;
    const visibleBottom = scrollTop + size.h - 8;
    let boxTop = top - 8;
    if (boxTop + needed > visibleBottom) boxTop = Math.max(scrollTop + 8, visibleBottom - needed);
    return renderPopover({ ...extra, left, top, flip: left > size.w * 0.6, dy: boxTop - top });
  };

  return (
    <div className="html-stage" ref={wrapRef}>
      <div
        className={`device-frame device-${preset.id}`}
        style={{ left: frameLeft, top: pad, width: preset.width * scale, height: frameHeight * scale }}
      >
        {/* Reload on device change: many pages measure the screen once when they load. The name tells the
            injected helper which device to emulate. */}
        <iframe
          ref={frameRef}
          key={`${src}|${preset.id}`}
          name={`review-portal:${preset.id}:${preset.width}x${preset.height ?? Math.round(frameHeight)}`}
          src={src.replace(/^(\/sites\/[^/]+\/)/, `$1~${preset.id}/`)}
          title="Design prototype"
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
          style={{ width: preset.width, height: frameHeight, transform: `scale(${scale})` }}
        />
      </div>
      {draftAnchor && anchorPos && popoverAt(anchorPos, { kind: 'draft' })}
      {!draftAnchor && activeId != null && anchorPos && popoverAt(anchorPos, { kind: 'pin', id: activeId })}
      {hover && hover.id !== activeId && !draftAnchor && popoverAt(hover, { kind: 'pin', id: hover.id, hover: true })}
    </div>
  );
});

export default HtmlStage;
