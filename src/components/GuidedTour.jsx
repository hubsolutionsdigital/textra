import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const GAP = 12;
const CARD_W = 340;

/**
 * Step-by-step walkthrough that spotlights real controls. Each step points at an element marked with
 * data-tour="<target>" (or sits centred when target is null); steps whose element isn't on screen are skipped.
 */
export default function GuidedTour({ steps, onClose }) {
  const available = steps.filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [card, setCard] = useState({ w: CARD_W, h: 200 });
  const cardRef = useRef(null);
  const step = available[index];

  const measure = useCallback(() => {
    const el = step?.target && document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    const el = step?.target && document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
    measure();
  }, [measure, step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCard({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
  }, [index, rect]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const last = index === available.length - 1;
  const next = () => (last ? onClose() : setIndex(index + 1));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!step) return null;

  // Place the card beside the highlighted element where it fits: below, above, right, left, else centred.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let pos;
  if (!rect) {
    pos = { top: (vh - card.h) / 2, left: (vw - card.w) / 2 };
  } else {
    const centreX = rect.left + rect.width / 2 - card.w / 2;
    const centreY = rect.top + rect.height / 2 - card.h / 2;
    const options = [
      { top: rect.top + rect.height + GAP, left: centreX, fits: rect.top + rect.height + GAP + card.h < vh },
      { top: rect.top - GAP - card.h, left: centreX, fits: rect.top - GAP - card.h > 0 },
      { top: centreY, left: rect.left + rect.width + GAP, fits: rect.left + rect.width + GAP + card.w < vw },
      { top: centreY, left: rect.left - GAP - card.w, fits: rect.left - GAP - card.w > 0 },
    ];
    pos = options.find((o) => o.fits) ?? { top: (vh - card.h) / 2, left: (vw - card.w) / 2 };
  }
  pos = {
    top: Math.max(12, Math.min(pos.top, vh - card.h - 12)),
    left: Math.max(12, Math.min(pos.left, vw - card.w - 12)),
  };

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label="How to review">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" ref={cardRef} style={pos}>
        <div className="tour-step">
          Step {index + 1} of {available.length}
        </div>
        <h3>{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button className="link-btn muted-link" onClick={onClose}>
            Skip tour
          </button>
          <div className="grow" />
          {index > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button className="btn btn-sm btn-primary" onClick={next} autoFocus>
            {last ? 'Start reviewing' : 'Next'}
          </button>
        </div>
        <div className="tour-dots">
          {available.map((_, i) => (
            <span key={i} className={i === index ? 'active' : i < index ? 'done' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
