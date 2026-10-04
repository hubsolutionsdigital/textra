// How each question type is answered (player), shown (big screen) and revealed (everyone).
// Answers use the shapes graded in server/quiz-logic.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import HotspotCanvas from './Canvases.jsx';
import { useDrag, useFlip } from './dnd.js';
import { SHAPES, shapeClass } from './meta.js';

// ---------- answering ----------

export function AnswerInput({ question, onSubmit, disabled }) {
  const props = { q: question, onSubmit, disabled };
  switch (question.type) {
    case 'choice':
      return <ChoiceInput {...props} />;
    case 'truefalse':
      return <TrueFalseInput {...props} />;
    case 'order':
      return <OrderInput {...props} />;
    case 'categorize':
      return <CategorizeInput {...props} />;
    case 'match':
      return <MatchInput {...props} />;
    case 'hotspot':
      return <HotspotInput {...props} />;
    case 'slider':
      return <SliderInput {...props} />;
    case 'blanks':
      return <BlanksInput {...props} />;
  }
  return null;
}

function LockIn({ onClick, disabled, ready = true, children = 'Lock it in' }) {
  return (
    <button className="qz-lockin" onClick={onClick} disabled={disabled || !ready}>
      <span>{children}</span> <span aria-hidden="true">🔒</span>
    </button>
  );
}

function ChoiceInput({ q, onSubmit, disabled }) {
  const [picked, setPicked] = useState([]);
  return (
    <div className="qz-answer">
      {q.multi && <p className="qz-hint">Pick all that apply, then lock it in.</p>}
      <div className={`qz-tiles qz-tiles-${q.options.length}`}>
        {q.options.map((o, i) => (
          <button
            key={i}
            className={`qz-tile ${shapeClass(i)} ${picked.includes(i) ? 'is-picked' : ''}`}
            disabled={disabled}
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => {
              if (!q.multi) return onSubmit([i]);
              setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
            }}
          >
            <span className="qz-shape">{SHAPES[i]}</span>
            <span className="qz-tile-text">{o.text}</span>
            {q.multi && <span className="qz-tick">{picked.includes(i) ? '✓' : ''}</span>}
          </button>
        ))}
      </div>
      {q.multi && <LockIn disabled={disabled} ready={picked.length > 0} onClick={() => onSubmit(picked)} />}
    </div>
  );
}

function TrueFalseInput({ onSubmit, disabled }) {
  return (
    <div className="qz-answer">
      <div className="qz-tiles qz-tiles-2">
        <button className="qz-tile qz-c1" disabled={disabled} onClick={() => onSubmit(true)}>
          <span className="qz-shape">✓</span>
          <span className="qz-tile-text">True</span>
        </button>
        <button className="qz-tile qz-c0" disabled={disabled} onClick={() => onSubmit(false)}>
          <span className="qz-shape">✕</span>
          <span className="qz-tile-text">False</span>
        </button>
      </div>
    </div>
  );
}

function OrderInput({ q, onSubmit, disabled }) {
  const [items, setItems] = useState(q.items);
  const [selected, setSelected] = useState(null);
  const listRef = useFlip(items.map((i) => i.id).join());

  const moveTo = (id, target) => {
    setItems((list) => {
      const from = list.findIndex((i) => i.id === id);
      const to = Number(target);
      if (from < 0 || from === to) return list;
      const next = list.slice();
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  };
  const drag = useDrag({
    onHover: (id, target) => moveTo(id, target),
    onDrop: (id, target) => moveTo(id, target),
    onTap: (id) => {
      if (selected === null) return setSelected(id);
      if (selected !== id) {
        const to = items.findIndex((i) => i.id === id);
        moveTo(selected, to);
      }
      setSelected(null);
    },
  });
  const nudge = (index, delta) => moveTo(items[index].id, Math.max(0, Math.min(items.length - 1, index + delta)));

  return (
    <div className="qz-answer">
      <p className="qz-hint">Drag to reorder (or tap one, then tap where it goes). Top = first.</p>
      <ol className="qz-order" ref={listRef}>
        {items.map((it, i) => (
          <li
            key={it.id}
            data-flip={it.id}
            data-drop={i}
            className={`qz-order-item ${selected === it.id ? 'is-selected' : ''}`}
            tabIndex={0}
            {...drag(it.id, { disabled })}
          >
            <span className="qz-order-num">{i + 1}</span>
            <span className="grow">{it.text}</span>
            <span className="qz-order-nudge">
              <button tabIndex={-1} aria-label="Move up" onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(i, -1)} disabled={disabled || i === 0}>▲</button>
              <button tabIndex={-1} aria-label="Move down" onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(i, 1)} disabled={disabled || i === items.length - 1}>▼</button>
            </span>
            <span className="qz-grip" aria-hidden="true">⋮⋮</span>
          </li>
        ))}
      </ol>
      <LockIn disabled={disabled} onClick={() => onSubmit(items.map((i) => i.id))} />
    </div>
  );
}

/** Click and keyboard handling for a drop zone, for the "tap a chip, then tap where it goes" path. */
const zoneProps = (zone, onPick) => ({
  role: 'button',
  tabIndex: 0,
  onClick: () => onPick(zone),
  onKeyDown: (e) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onPick(zone);
    }
  },
});

/** A pool of chips plus zones; a zone holds one chip (single) or many. Used by sort, match and gaps. */
function usePlacement() {
  const [placed, setPlaced] = useState({}); // chipId -> zone
  const [selected, setSelected] = useState(null);
  const place = (chip, zone, { single } = {}) =>
    setPlaced((p) => {
      const next = { ...p };
      if (zone === 'pool' || zone === undefined) {
        delete next[chip];
        return next;
      }
      if (single) for (const [c, z] of Object.entries(next)) if (z === zone && c !== String(chip)) delete next[c];
      next[chip] = zone;
      return next;
    });
  /** Tap a chip: select it, or, while another chip is selected, drop that one where this one sits. */
  const tapChip = (chip, opts) => {
    const zone = placed[chip];
    if (selected !== null && selected !== chip && zone !== undefined) {
      place(selected, zone, opts);
      setSelected(null);
    } else setSelected((s) => (s === chip ? null : chip));
  };
  return { placed, place, selected, setSelected, tapChip };
}

function CategorizeInput({ q, onSubmit, disabled }) {
  const { placed, place, selected, setSelected, tapChip } = usePlacement();
  const drag = useDrag({
    onDrop: (id, zone) => place(id, zone),
    onTap: (id) => tapChip(id),
  });
  const tapZone = (zone) => {
    if (selected === null || disabled) return;
    place(selected, zone);
    setSelected(null);
  };
  const chip = (it) => (
    <button key={it.id} className={`qz-chip ${selected === it.id ? 'is-selected' : ''}`} disabled={disabled} {...drag(it.id, { disabled })}>
      {it.text}
    </button>
  );
  const pool = q.items.filter((it) => placed[it.id] === undefined);
  const answer = Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, Number(v)]));

  return (
    <div className="qz-answer">
      <p className="qz-hint">Drag each card into a group (or tap a card, then tap a group).</p>
      <div className="qz-pool" data-drop="pool" {...zoneProps('pool', tapZone)}>
        {pool.length ? pool.map(chip) : <span className="qz-pool-empty">All sorted ✨</span>}
      </div>
      <div className={`qz-buckets qz-buckets-${q.buckets.length}`}>
        {q.buckets.map((b, bi) => (
          <div key={bi} className={`qz-bucket ${shapeClass(bi)}`} data-drop={bi} {...zoneProps(String(bi), tapZone)}>
            <div className="qz-bucket-name">{b}</div>
            <div className="qz-bucket-body">{q.items.filter((it) => placed[it.id] === String(bi)).map(chip)}</div>
          </div>
        ))}
      </div>
      <LockIn disabled={disabled} ready={pool.length === 0} onClick={() => onSubmit(answer)}>
        {pool.length ? `${pool.length} left to sort` : 'Lock it in'}
      </LockIn>
    </div>
  );
}

function MatchInput({ q, onSubmit, disabled }) {
  const { placed, place, selected, setSelected, tapChip } = usePlacement();
  const drag = useDrag({
    onDrop: (id, zone) => place(id, zone, { single: true }),
    onTap: (id) => tapChip(id, { single: true }),
  });
  const tapZone = (zone) => {
    if (selected === null || disabled) return;
    place(selected, zone, { single: true });
    setSelected(null);
  };
  const chip = (r) => (
    <button key={r.id} className={`qz-chip ${selected === r.id ? 'is-selected' : ''}`} disabled={disabled} {...drag(r.id, { disabled })}>
      {r.text}
    </button>
  );
  const pool = q.rights.filter((r) => placed[r.id] === undefined);
  const answer = {};
  for (const [rightId, leftId] of Object.entries(placed)) answer[leftId] = Number(rightId);

  return (
    <div className="qz-answer">
      <p className="qz-hint">Drag each answer onto its partner (or tap, then tap).</p>
      <div className="qz-pool" data-drop="pool" {...zoneProps('pool', tapZone)}>
        {pool.length ? pool.map(chip) : <span className="qz-pool-empty">All matched ✨</span>}
      </div>
      <div className="qz-match">
        {q.lefts.map((l, i) => {
          const r = q.rights.find((x) => placed[x.id] === String(l.id));
          return (
            <div key={l.id} className="qz-match-row">
              <div className={`qz-match-left ${shapeClass(i)}`}>{l.text}</div>
              <span className="qz-match-link" aria-hidden="true">{r ? '🔗' : '→'}</span>
              <div className={`qz-slot ${r ? 'is-filled' : ''}`} data-drop={l.id} {...zoneProps(String(l.id), tapZone)}>
                {r ? chip(r) : <span className="qz-slot-empty">Drop here</span>}
              </div>
            </div>
          );
        })}
      </div>
      <LockIn disabled={disabled} ready={pool.length === 0} onClick={() => onSubmit(answer)}>
        {pool.length ? `${pool.length} left to match` : 'Lock it in'}
      </LockIn>
    </div>
  );
}

function HotspotInput({ q, onSubmit, disabled }) {
  const [pin, setPin] = useState(null);
  const ref = useRef(null);
  const setFrom = (e) => {
    const r = ref.current.getBoundingClientRect();
    setPin({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  };
  const down = (e) => {
    if (disabled) return;
    e.preventDefault();
    setFrom(e);
    const move = (ev) => setFrom(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="qz-answer">
      <p className="qz-hint">Tap or drag to drop your pin on the design.</p>
      <div ref={ref} className="qz-hotspot" onPointerDown={down}>
        <HotspotCanvas canvas={q.canvas} image={q.image}>
          {pin && <Pin x={pin.x} y={pin.y} className="is-mine" />}
          {!pin && <div className="qz-hotspot-tip">👆 Drop your pin</div>}
        </HotspotCanvas>
      </div>
      <LockIn disabled={disabled} ready={!!pin} onClick={() => onSubmit(pin)} />
    </div>
  );
}

const Pin = ({ x, y, className = '', label }) => (
  <span className={`qz-mappin ${className}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
    {label ?? '📍'}
  </span>
);

function SliderInput({ q, onSubmit, disabled }) {
  const mid = useMemo(() => {
    const steps = Math.round((q.max - q.min) / q.step / 2);
    return q.min + steps * q.step;
  }, [q]);
  const [value, setValue] = useState(mid);
  const pct = ((value - q.min) / (q.max - q.min)) * 100;
  const fmt = (v) => `${Number(v.toFixed(2))}${q.unit ? ` ${q.unit}` : ''}`;
  const bump = (d) => setValue((v) => Math.min(q.max, Math.max(q.min, Number((v + d * q.step).toFixed(4)))));
  return (
    <div className="qz-answer">
      <div className="qz-slider">
        <div className="qz-slider-bubble" style={{ left: `${pct}%` }}>
          {fmt(value)}
        </div>
        <input
          type="range"
          min={q.min}
          max={q.max}
          step={q.step}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ '--pct': `${pct}%` }}
        />
        <div className="qz-slider-ends">
          <span>{fmt(q.min)}</span>
          <span>{fmt(q.max)}</span>
        </div>
        <div className="qz-slider-nudge">
          <button onClick={() => bump(-1)} disabled={disabled}>−</button>
          <button onClick={() => bump(1)} disabled={disabled}>+</button>
        </div>
      </div>
      <LockIn disabled={disabled} onClick={() => onSubmit(value)} />
    </div>
  );
}

function BlanksInput({ q, onSubmit, disabled }) {
  const { placed, place, selected, setSelected, tapChip } = usePlacement();
  const drag = useDrag({
    onDrop: (id, zone) => place(id, zone, { single: true }),
    onTap: (id) => tapChip(id, { single: true }),
  });
  const tapZone = (zone) => {
    if (selected === null || disabled) return;
    place(selected, zone, { single: true });
    setSelected(null);
  };
  const gaps = q.parts.length - 1;
  const inGap = (g) => q.chips.find((c) => placed[c.id] === String(g));
  const pool = q.chips.filter((c) => placed[c.id] === undefined);
  const chip = (c) => (
    <button key={c.id} className={`qz-chip ${selected === c.id ? 'is-selected' : ''}`} disabled={disabled} {...drag(c.id, { disabled })}>
      {c.text}
    </button>
  );
  const filled = Array.from({ length: gaps }, (_, g) => inGap(g)?.text ?? '');
  return (
    <div className="qz-answer">
      <p className="qz-hint">Drag words into the gaps (or tap a word, then a gap).</p>
      <p className="qz-sentence">
        {q.parts.map((part, g) => (
          <span key={g}>
            {part}
            {g < gaps && (
              <span className={`qz-gap ${inGap(g) ? 'is-filled' : ''}`} data-drop={g} {...zoneProps(String(g), tapZone)}>
                {inGap(g) ? chip(inGap(g)) : ' '}
              </span>
            )}
          </span>
        ))}
      </p>
      <div className="qz-pool" data-drop="pool" {...zoneProps('pool', tapZone)}>
        {pool.map(chip)}
      </div>
      <LockIn disabled={disabled} ready={filled.every(Boolean)} onClick={() => onSubmit(filled)} />
    </div>
  );
}

// ---------- big screen while players answer ----------

export function HostQuestion({ question: q }) {
  switch (q.type) {
    case 'choice':
      return (
        <div className={`qz-tiles qz-tiles-${q.options.length} is-static`}>
          {q.options.map((o, i) => (
            <div key={i} className={`qz-tile ${shapeClass(i)}`} style={{ animationDelay: `${i * 80}ms` }}>
              <span className="qz-shape">{SHAPES[i]}</span>
              <span className="qz-tile-text">{o.text}</span>
            </div>
          ))}
        </div>
      );
    case 'truefalse':
      return (
        <div className="qz-tiles qz-tiles-2 is-static">
          <div className="qz-tile qz-c1"><span className="qz-shape">✓</span><span className="qz-tile-text">True</span></div>
          <div className="qz-tile qz-c0"><span className="qz-shape">✕</span><span className="qz-tile-text">False</span></div>
        </div>
      );
    case 'order':
      return <div className="qz-float-chips">{q.items.map((i, n) => <span key={i.id} className="qz-chip is-static" style={{ animationDelay: `${n * 0.3}s` }}>{i.text}</span>)}</div>;
    case 'categorize':
      return (
        <div className="qz-host-split">
          <div className="qz-float-chips">{q.items.map((i, n) => <span key={i.id} className="qz-chip is-static" style={{ animationDelay: `${n * 0.3}s` }}>{i.text}</span>)}</div>
          <div className={`qz-buckets qz-buckets-${q.buckets.length}`}>
            {q.buckets.map((b, bi) => <div key={bi} className={`qz-bucket ${shapeClass(bi)}`}><div className="qz-bucket-name">{b}</div></div>)}
          </div>
        </div>
      );
    case 'match':
      return (
        <div className="qz-host-split">
          <div className="qz-match">{q.lefts.map((l, i) => <div key={l.id} className={`qz-match-left ${shapeClass(i)}`}>{l.text}</div>)}</div>
          <div className="qz-float-chips">{q.rights.map((r, n) => <span key={r.id} className="qz-chip is-static" style={{ animationDelay: `${n * 0.3}s` }}>{r.text}</span>)}</div>
        </div>
      );
    case 'hotspot':
      return <HotspotCanvas canvas={q.canvas} image={q.image} className="qz-host-canvas" />;
    case 'slider':
      return (
        <div className="qz-slider-static">
          <span>{q.min}{q.unit && ` ${q.unit}`}</span>
          <div className="qz-slider-track"><div className="qz-slider-sweep" /></div>
          <span>{q.max}{q.unit && ` ${q.unit}`}</span>
        </div>
      );
    case 'blanks':
      return (
        <div>
          <p className="qz-sentence">
            {q.parts.map((p, g) => (
              <span key={g}>{p}{g < q.parts.length - 1 && <span className="qz-gap">{' '}</span>}</span>
            ))}
          </p>
          <div className="qz-float-chips">{q.chips.map((c, n) => <span key={c.id} className="qz-chip is-static" style={{ animationDelay: `${n * 0.3}s` }}>{c.text}</span>)}</div>
        </div>
      );
  }
  return null;
}

// ---------- after time is up ----------

/**
 * The correct answer. `answer` is this player's answer (marks their picks); `stats` is the
 * big-screen breakdown of everyone's answers.
 */
export function Reveal({ question: q, answer, stats }) {
  const sol = q.solution;
  switch (q.type) {
    case 'choice':
    case 'truefalse': {
      const options = q.type === 'choice' ? q.options.map((o) => o.text) : ['True', 'False'];
      const isRight = (i) => (q.type === 'choice' ? sol.includes(i) : sol === (i === 0));
      const mine = (i) => (q.type === 'choice' ? Array.isArray(answer) && answer.includes(i) : answer === (i === 0));
      const max = Math.max(1, ...(stats?.counts ?? [0]));
      const colour = (i) => (q.type === 'truefalse' ? (i === 0 ? 'qz-c1' : 'qz-c0') : shapeClass(i));
      return (
        <div className={`qz-tiles qz-tiles-${options.length} is-reveal`}>
          {options.map((text, i) => (
            <div key={i} className={`qz-tile ${colour(i)} ${isRight(i) ? 'is-right' : 'is-wrong'} ${mine(i) ? 'is-mine' : ''}`}>
              <span className="qz-shape">{q.type === 'truefalse' ? (i === 0 ? '✓' : '✕') : SHAPES[i]}</span>
              <span className="qz-tile-text">{text}</span>
              {stats?.counts && (
                <span className="qz-count">
                  <span className="qz-count-bar" style={{ '--h': stats.counts[i] / max }} />
                  {stats.counts[i]}
                </span>
              )}
              <span className="qz-verdict">{isRight(i) ? '✓' : ''}</span>
              {mine(i) && <span className="qz-you">You</span>}
            </div>
          ))}
        </div>
      );
    }
    case 'order': {
      const byId = Object.fromEntries(q.items.map((i) => [i.id, i.text]));
      return (
        <ol className="qz-order is-reveal">
          {sol.map((id, i) => {
            const ok = Array.isArray(answer) ? answer[i] === id : null;
            return (
              <li key={id} className={`qz-order-item ${ok === true ? 'is-ok' : ok === false ? 'is-bad' : ''}`} style={{ animationDelay: `${i * 120}ms` }}>
                <span className="qz-order-num">{i + 1}</span>
                <span className="grow">{byId[id]}</span>
                {ok !== null && <span>{ok ? '✓' : '✕'}</span>}
              </li>
            );
          })}
        </ol>
      );
    }
    case 'categorize':
      return (
        <div className={`qz-buckets qz-buckets-${q.buckets.length}`}>
          {q.buckets.map((b, bi) => (
            <div key={bi} className={`qz-bucket ${shapeClass(bi)}`}>
              <div className="qz-bucket-name">{b}</div>
              <div className="qz-bucket-body">
                {q.items.filter((it) => sol[it.id] === bi).map((it, n) => {
                  const ok = answer ? Number(answer[it.id]) === bi : null;
                  return (
                    <span key={it.id} className={`qz-chip is-static ${ok === true ? 'is-ok' : ok === false ? 'is-bad' : ''}`} style={{ animationDelay: `${n * 100}ms` }}>
                      {it.text} {ok !== null && (ok ? '✓' : '✕')}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    case 'match': {
      const right = Object.fromEntries(q.rights.map((r) => [r.id, r.text]));
      return (
        <div className="qz-match">
          {q.lefts.map((l, i) => {
            const ok = answer ? Number(answer[l.id]) === sol[l.id] : null;
            return (
              <div key={l.id} className="qz-match-row" style={{ animationDelay: `${i * 120}ms` }}>
                <div className={`qz-match-left ${shapeClass(i)}`}>{l.text}</div>
                <span className="qz-match-link">🔗</span>
                <div className={`qz-slot is-filled ${ok === true ? 'is-ok' : ok === false ? 'is-bad' : ''}`}>
                  <span className="qz-chip is-static">{right[sol[l.id]]}</span>
                  {ok !== null && <span className="qz-slot-mark">{ok ? '✓' : '✕'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'hotspot':
      return (
        <HotspotCanvas canvas={q.canvas} image={q.image} className="qz-host-canvas">
          <div
            className="qz-target"
            style={{ left: `${sol.x * 100}%`, top: `${sol.y * 100}%`, width: `${sol.w * 100}%`, height: `${sol.h * 100}%` }}
          />
          {stats?.pins?.map((p, i) => (
            <span key={i} className={`qz-heat ${p.ok ? 'is-ok' : ''}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, animationDelay: `${(i % 30) * 40}ms` }} />
          ))}
          {answer && <Pin x={answer.x} y={answer.y} className="is-mine" />}
        </HotspotCanvas>
      );
    case 'slider': {
      const span = q.max - q.min;
      const at = (v) => `${((v - q.min) / span) * 100}%`;
      const lo = Math.max(q.min, sol.answer - sol.tolerance);
      const hi = Math.min(q.max, sol.answer + sol.tolerance);
      return (
        <div className="qz-slider-reveal">
          <div className="qz-slider-track">
            <div className="qz-band" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)} + 4px)` }} />
            {stats?.values?.map((v, i) => <span key={i} className="qz-dot" style={{ left: at(v), animationDelay: `${(i % 30) * 40}ms` }} />)}
            {typeof answer === 'number' && <span className="qz-marker is-mine" style={{ left: at(answer) }}>You: {answer}</span>}
            <span className="qz-marker is-right" style={{ left: at(sol.answer) }}>
              {sol.answer}{q.unit && ` ${q.unit}`}
            </span>
          </div>
          <div className="qz-slider-ends">
            <span>{q.min}</span>
            <span>{q.max}</span>
          </div>
        </div>
      );
    }
    case 'blanks':
      return (
        <p className="qz-sentence">
          {q.parts.map((p, g) => {
            const mine = Array.isArray(answer) ? answer[g] : undefined;
            const ok = mine === undefined ? null : String(mine).toLowerCase() === String(sol[g]).toLowerCase();
            return (
              <span key={g}>
                {p}
                {g < q.parts.length - 1 && (
                  <span className={`qz-gap is-filled ${ok === true ? 'is-ok' : ok === false ? 'is-bad' : ''}`}>
                    {ok === false && <s className="qz-strike">{mine}</s>}
                    <span className="qz-chip is-static">{sol[g]}</span>
                  </span>
                )}
              </span>
            );
          })}
        </p>
      );
  }
  return null;
}

/** Accuracy ring for question types without per-option counts. */
export function AccuracyRing({ stats }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(stats.accuracy));
    return () => cancelAnimationFrame(id);
  }, [stats.accuracy]);
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="qz-ring-stats">
      <svg viewBox="0 0 120 120" className="qz-ring">
        <circle cx="60" cy="60" r={r} className="qz-ring-track" />
        <circle cx="60" cy="60" r={r} className="qz-ring-fill" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - shown) }} />
        <text x="60" y="66" textAnchor="middle" className="qz-ring-text">{Math.round(stats.accuracy * 100)}%</text>
      </svg>
      <ul className="qz-ring-legend">
        <li><b className="ok">{stats.correct}</b> spot on</li>
        <li><b className="partial">{stats.partial}</b> partly right</li>
        <li><b className="bad">{stats.wrong}</b> missed</li>
      </ul>
    </div>
  );
}
