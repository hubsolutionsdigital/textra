// The quiz builder: slides on the left (drag to reorder), the question in the middle, settings on
// the right. Changes save automatically.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import HotspotCanvas from './Canvases.jsx';
import { useDrag, useFlip } from './dnd.js';
import { CANVASES, SCENES, SHAPES, THEMES, TIMES, TYPES, shapeClass } from './meta.js';
import { SceneThumb } from './Scenes.jsx';
import './quiz.css';

const newId = () => Math.random().toString(36).slice(2, 10);

const DEFAULTS = {
  choice: () => ({ options: [{ text: '', correct: true }, { text: '' }, { text: '' }, { text: '' }] }),
  truefalse: () => ({ answer: true }),
  order: () => ({ items: ['', '', '', ''] }),
  categorize: () => ({ buckets: ['', ''], items: [{ text: '', bucket: 0 }, { text: '', bucket: 1 }] }),
  match: () => ({ pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] }),
  hotspot: () => ({ canvas: 'landing', target: { x: 0.35, y: 0.35, w: 0.3, h: 0.2 } }),
  slider: () => ({ min: 0, max: 100, step: 1, answer: 50, tolerance: 5, unit: '' }),
  blanks: () => ({ text: '', distractors: [] }),
};

const blankQuestion = (type = 'choice') => ({
  id: newId(),
  type,
  prompt: '',
  time: 30,
  points: 1,
  visual: { scene: 'none', image: '' },
  explanation: '',
  ...DEFAULTS[type](),
});

export default function QuizEditor() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [problems, setProblems] = useState({});
  const [sel, setSel] = useState(0);
  const [status, setStatus] = useState('saved');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const saveTimer = useRef(null);
  const latest = useRef(null);

  const applyProblems = (saved) => setProblems(Object.fromEntries(saved.questions.map((x) => [x.id, x.problems ?? []])));

  useEffect(() => {
    api('GET', `/api/quizzes/${quizId}`).then(
      ({ quiz: z }) => {
        setQuiz(z);
        applyProblems(z);
      },
      (e) => setError(e.message),
    );
  }, [quizId]);

  const save = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const z = latest.current;
    if (!z) return;
    setStatus('saving');
    try {
      const { quiz: saved } = await api('PUT', `/api/quizzes/${quizId}`, z);
      applyProblems(saved);
      setStatus(latest.current === z ? 'saved' : 'dirty');
      setError('');
    } catch (e) {
      setStatus('error');
      setError(e.message);
    }
  }, [quizId]);

  const change = (fn) => {
    setQuiz((z) => {
      const next = fn(z);
      latest.current = next;
      return next;
    });
    setStatus('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 700);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const setQ = (i, patch) => change((z) => ({ ...z, questions: z.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const host = async () => {
    await save();
    try {
      const { pin } = await api('POST', `/api/quizzes/${quizId}/live`);
      navigate(`/live/${pin}`);
    } catch (e) {
      setError(e.message);
    }
  };

  // Slide reordering.
  const moveSlide = (id, to) =>
    change((z) => {
      const from = z.questions.findIndex((x) => x.id === id);
      to = Number(to);
      if (from < 0 || from === to) return z;
      const qs = z.questions.slice();
      const [it] = qs.splice(from, 1);
      qs.splice(to, 0, it);
      setSel(to);
      return { ...z, questions: qs };
    });
  const slideDrag = useDrag({ onHover: moveSlide, onDrop: moveSlide, onTap: (id) => setSel(quiz.questions.findIndex((x) => x.id === id)) });
  const slidesRef = useFlip(quiz?.questions.map((x) => x.id).join());

  if (error && !quiz) return <div className="container"><div className="form-error">{error}</div></div>;
  if (!quiz) return <div className="page-loading">Loading…</div>;

  const q = quiz.questions[sel];
  const allProblems = quiz.questions.flatMap((x) => problems[x.id] ?? []);

  return (
    <div className="qz-editor">
      <header className="qz-ed-top">
        <Link to="/quizzes" className="btn btn-ghost btn-sm">← Quizzes</Link>
        <input className="qz-ed-title" value={quiz.title} maxLength={120} onChange={(e) => change((z) => ({ ...z, title: e.target.value }))} aria-label="Quiz title" />
        <span className={`qz-save is-${status}`}>
          {{ saved: '✓ Saved', saving: 'Saving…', dirty: 'Editing…', error: '⚠ Not saved' }[status]}
        </span>
        <span className="grow" />
        {allProblems.length > 0 && (
          <details className="qz-problems">
            <summary>⚠ {allProblems.length} to finish</summary>
            <ul>{allProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          </details>
        )}
        <a className="btn btn-sm" href={`/practice/${quiz.practice_token}`} target="_blank" rel="noreferrer">🎯 Try it</a>
        <button className="btn btn-primary btn-sm" onClick={host} disabled={allProblems.length > 0}>▶ Host live</button>
      </header>
      {error && <div className="form-error qz-ed-error">{error}</div>}

      <div className="qz-ed-body">
        <aside className="qz-ed-slides">
          <ol ref={slidesRef}>
            {quiz.questions.map((x, i) => (
              <li
                key={x.id}
                data-flip={x.id}
                data-drop={i}
                className={`qz-slide ${i === sel ? 'is-on' : ''}`}
                tabIndex={0}
                {...slideDrag(x.id)}
              >
                <span className="qz-slide-num">{i + 1}</span>
                <div className={`qz-slide-art qz-theme-${quiz.theme}`}>
                  {x.visual?.image ? <img src={x.visual.image} alt="" /> : x.visual?.scene !== 'none' ? <SceneThumb scene={x.visual.scene} /> : <span className="qz-slide-icon">{TYPES[x.type].icon}</span>}
                </div>
                <span className="qz-slide-text">{x.prompt || <i>Untitled</i>}</span>
                <span className="qz-slide-type">{TYPES[x.type].icon} {TYPES[x.type].label}</span>
                {problems[x.id]?.length > 0 && <span className="qz-slide-warn" title={problems[x.id].join('\n')}>!</span>}
              </li>
            ))}
          </ol>
          <button className="btn btn-primary btn-block" onClick={() => setAdding(true)}>+ Add question</button>
        </aside>

        <main className="qz-ed-main">
          {q ? (
            <>
              <textarea
                className="qz-ed-prompt"
                placeholder="Type your question…"
                value={q.prompt}
                maxLength={300}
                rows={2}
                onChange={(e) => setQ(sel, { prompt: e.target.value })}
              />
              {q.type !== 'hotspot' && <VisualPicker visual={q.visual} theme={quiz.theme} onChange={(visual) => setQ(sel, { visual })} />}
              <section className="qz-ed-card">
                <h3>{TYPES[q.type].icon} {TYPES[q.type].label}</h3>
                <TypeEditor key={q.id} q={q} set={(patch) => setQ(sel, patch)} />
              </section>
              <label className="qz-ed-card">
                <span>💡 Explanation shown after the answer (optional)</span>
                <textarea value={q.explanation} maxLength={500} rows={2} onChange={(e) => setQ(sel, { explanation: e.target.value })} />
              </label>
            </>
          ) : (
            <div className="empty-state"><h2>No questions yet</h2><button className="btn btn-primary" onClick={() => setAdding(true)}>Add your first question</button></div>
          )}
        </main>

        <aside className="qz-ed-settings">
          {q && (
            <>
              <label>
                Question type
                <select value={q.type} onChange={(e) => setQ(sel, { ...DEFAULTS[e.target.value](), type: e.target.value })}>
                  {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
                </select>
              </label>
              <label>
                Time limit
                <select value={q.time} onChange={(e) => setQ(sel, { time: Number(e.target.value) })}>
                  {TIMES.map((t) => <option key={t} value={t}>{t < 60 ? `${t} seconds` : `${t / 60} minute${t > 60 ? 's' : ''}`}</option>)}
                </select>
              </label>
              <fieldset className="qz-seg">
                <legend>Points</legend>
                {[[1, 'Standard'], [2, 'Double ×2'], [0, 'No points']].map(([v, l]) => (
                  <button key={v} className={q.points === v ? 'is-on' : ''} onClick={() => setQ(sel, { points: v })}>{l}</button>
                ))}
              </fieldset>
              <div className="qz-ed-row-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    change((z) => {
                      const qs = z.questions.slice();
                      qs.splice(sel + 1, 0, { ...structuredClone(q), id: newId() });
                      return { ...z, questions: qs };
                    });
                    setSel(sel + 1);
                  }}
                >
                  ⧉ Duplicate
                </button>
                <button
                  className="btn btn-sm btn-danger-ghost"
                  onClick={() => {
                    change((z) => ({ ...z, questions: z.questions.filter((_, j) => j !== sel) }));
                    setSel(Math.max(0, sel - 1));
                  }}
                >
                  🗑 Delete
                </button>
              </div>
              <hr />
            </>
          )}
          <label>
            Theme
            <div className="qz-themes">
              {Object.entries(THEMES).map(([k, label]) => (
                <button key={k} className={`qz-theme-swatch qz-theme-${k} ${quiz.theme === k ? 'is-on' : ''}`} title={label} onClick={() => change((z) => ({ ...z, theme: k }))}>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </label>
          <label>
            Description
            <textarea rows={3} maxLength={500} value={quiz.description} onChange={(e) => change((z) => ({ ...z, description: e.target.value }))} />
          </label>
        </aside>
      </div>

      {adding && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdding(false)}>
          <div className="modal modal-wide">
            <button className="modal-close" onClick={() => setAdding(false)} aria-label="Close">×</button>
            <h2>Add a question</h2>
            <div className="qz-type-grid">
              {Object.entries(TYPES).map(([k, t]) => (
                <button
                  key={k}
                  className="qz-type-card"
                  onClick={() => {
                    change((z) => ({ ...z, questions: [...z.questions, blankQuestion(k)] }));
                    setSel(quiz.questions.length);
                    setAdding(false);
                  }}
                >
                  <span className="qz-type-icon">{t.icon}</span>
                  <strong>{t.label}</strong>
                  <span className="muted small">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VisualPicker({ visual, theme, onChange }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { url } = await api('POST', '/api/quiz-media', fd);
      onChange({ scene: visual.scene, image: url });
      setOpen(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  };
  const current = visual.image ? 'Your image' : SCENES[visual.scene];
  return (
    <section className="qz-ed-card">
      <div className="qz-visual-head">
        <div className={`qz-visual-preview qz-theme-${theme}`}>
          {visual.image ? <img src={visual.image} alt="" /> : <SceneThumb scene={visual.scene} />}
        </div>
        <div className="grow">
          <h3>🎬 Animated graphic</h3>
          <p className="muted small">Shown with the question on the big screen and phones. {current}.</p>
          <div className="qz-ed-row-actions">
            <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Choose graphic'}</button>
            <label className="btn btn-sm">
              {uploading ? 'Uploading…' : '⬆ Upload image / GIF'}
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => upload(e.target.files[0])} />
            </label>
            {visual.image && <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...visual, image: '' })}>Remove image</button>}
          </div>
          {err && <p className="form-error">{err}</p>}
        </div>
      </div>
      {open && (
        <div className="qz-scene-grid">
          {Object.entries(SCENES).map(([k, label]) => (
            <button
              key={k}
              className={`qz-scene-pick qz-theme-${theme} ${!visual.image && visual.scene === k ? 'is-on' : ''}`}
              onClick={() => {
                onChange({ scene: k, image: '' });
                setOpen(false);
              }}
            >
              <SceneThumb scene={k} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TypeEditor({ q, set }) {
  switch (q.type) {
    case 'choice':
      return <ChoiceEditor q={q} set={set} />;
    case 'truefalse':
      return (
        <div className="qz-tiles qz-tiles-2 is-editor">
          {[true, false].map((v) => (
            <button key={String(v)} className={`qz-tile ${v ? 'qz-c1' : 'qz-c0'} ${q.answer === v ? 'is-right' : 'is-dim'}`} onClick={() => set({ answer: v })}>
              <span className="qz-shape">{v ? '✓' : '✕'}</span>
              <span className="qz-tile-text">{v ? 'True' : 'False'}</span>
              {q.answer === v && <span className="qz-verdict">Correct</span>}
            </button>
          ))}
        </div>
      );
    case 'order':
      return <OrderEditor q={q} set={set} />;
    case 'categorize':
      return <CategorizeEditor q={q} set={set} />;
    case 'match':
      return (
        <div className="qz-ed-list">
          <p className="muted small">Players drag the right-hand answers onto the left-hand prompts.</p>
          {q.pairs.map((p, i) => (
            <div key={i} className="qz-ed-pair">
              <span className={`qz-ed-dot ${shapeClass(i)}`}>{SHAPES[i]}</span>
              <input placeholder="Prompt, e.g. robots.txt" value={p.left} maxLength={80} onChange={(e) => set({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} />
              <span aria-hidden="true">🔗</span>
              <input placeholder="Its match" value={p.right} maxLength={80} onChange={(e) => set({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} />
              <button className="btn btn-ghost btn-sm" aria-label="Remove pair" disabled={q.pairs.length <= 2} onClick={() => set({ pairs: q.pairs.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          {q.pairs.length < 6 && <button className="btn btn-sm" onClick={() => set({ pairs: [...q.pairs, { left: '', right: '' }] })}>+ Add pair</button>}
        </div>
      );
    case 'hotspot':
      return <HotspotEditor q={q} set={set} />;
    case 'slider':
      return <SliderEditor q={q} set={set} />;
    case 'blanks':
      return <BlanksEditor q={q} set={set} />;
  }
  return null;
}

function ChoiceEditor({ q, set }) {
  const upd = (i, patch) => set({ options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  return (
    <>
      <p className="muted small">Tick every correct answer. Mark more than one to make it “pick all that apply”.</p>
      <div className={`qz-tiles qz-tiles-${Math.max(2, q.options.length)} is-editor`}>
        {q.options.map((o, i) => (
          <div key={i} className={`qz-tile ${shapeClass(i)} ${o.correct ? 'is-right' : ''}`}>
            <span className="qz-shape">{SHAPES[i]}</span>
            <input className="qz-tile-input" placeholder={`Answer ${i + 1}${i > 1 ? ' (optional)' : ''}`} value={o.text} maxLength={120} onChange={(e) => upd(i, { text: e.target.value })} />
            <button className={`qz-correct-toggle ${o.correct ? 'is-on' : ''}`} onClick={() => upd(i, { correct: !o.correct })} aria-pressed={o.correct} title="Correct answer">✓</button>
            {q.options.length > 2 && <button className="qz-tile-remove" onClick={() => set({ options: q.options.filter((_, j) => j !== i) })} aria-label="Remove answer">✕</button>}
          </div>
        ))}
      </div>
      {q.options.length < 6 && <button className="btn btn-sm qz-mt" onClick={() => set({ options: [...q.options, { text: '' }] })}>+ Add answer</button>}
    </>
  );
}

function OrderEditor({ q, set }) {
  const rows = q.items.map((text, i) => ({ text, key: i }));
  const move = (from, to) => {
    from = Number(from);
    to = Number(to);
    if (from === to) return;
    const items = q.items.slice();
    const [it] = items.splice(from, 1);
    items.splice(to, 0, it);
    set({ items });
  };
  const drag = useDrag({ onDrop: move });
  return (
    <div className="qz-ed-list">
      <p className="muted small">Enter the items in the <b>correct</b> order. Players get them shuffled. Drag ⋮⋮ to reorder.</p>
      <ol className="qz-ed-order">
        {rows.map((r, i) => (
          <li key={i} className="qz-ed-row" data-drop={i}>
            <span className="qz-grip" {...drag(i, { from: '.qz-ed-row' })} aria-label="Drag to reorder">⋮⋮</span>
            <span className="qz-order-num">{i + 1}</span>
            <input value={r.text} placeholder={`Step ${i + 1}`} maxLength={120} onChange={(e) => set({ items: q.items.map((t, j) => (j === i ? e.target.value : t)) })} />
            <button className="btn btn-ghost btn-sm" aria-label="Remove" disabled={q.items.length <= 3} onClick={() => set({ items: q.items.filter((_, j) => j !== i) })}>✕</button>
          </li>
        ))}
      </ol>
      {q.items.length < 8 && <button className="btn btn-sm" onClick={() => set({ items: [...q.items, ''] })}>+ Add item</button>}
    </div>
  );
}

function CategorizeEditor({ q, set }) {
  const drag = useDrag({
    onDrop: (i, bucket) => set({ items: q.items.map((it, j) => (j === i ? { ...it, bucket: Number(bucket) } : it)) }),
  });
  const updItem = (i, patch) => set({ items: q.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const removeBucket = (b) =>
    set({
      buckets: q.buckets.filter((_, j) => j !== b),
      items: q.items.filter((it) => it.bucket !== b).map((it) => ({ ...it, bucket: it.bucket > b ? it.bucket - 1 : it.bucket })),
    });
  return (
    <>
      <p className="muted small">Name the groups, then add the cards that belong in each. Drag ⋮⋮ to move a card to another group.</p>
      <div className={`qz-buckets qz-buckets-${q.buckets.length} is-editor`}>
        {q.buckets.map((b, bi) => (
          <div key={bi} className={`qz-bucket ${shapeClass(bi)}`} data-drop={bi}>
            <div className="qz-bucket-name">
              <input value={b} placeholder={`Group ${bi + 1}`} maxLength={60} onChange={(e) => set({ buckets: q.buckets.map((x, j) => (j === bi ? e.target.value : x)) })} />
              {q.buckets.length > 2 && <button className="qz-tile-remove" onClick={() => removeBucket(bi)} aria-label="Remove group">✕</button>}
            </div>
            <div className="qz-bucket-body">
              {q.items.map((it, i) =>
                it.bucket === bi ? (
                  <div key={i} className="qz-ed-row qz-ed-chip">
                    <span className="qz-grip" {...drag(i, { from: '.qz-ed-row' })}>⋮⋮</span>
                    <input value={it.text} placeholder="Card" maxLength={80} onChange={(e) => updItem(i, { text: e.target.value })} />
                    <button className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => set({ items: q.items.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                ) : null,
              )}
              {q.items.length < 12 && <button className="btn btn-sm btn-ghost" onClick={() => set({ items: [...q.items, { text: '', bucket: bi }] })}>+ Card</button>}
            </div>
          </div>
        ))}
      </div>
      {q.buckets.length < 4 && <button className="btn btn-sm qz-mt" onClick={() => set({ buckets: [...q.buckets, ''] })}>+ Add group</button>}
    </>
  );
}

function HotspotEditor({ q, set }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);
  const t = q.target;
  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e) => {
    e.preventDefault();
    const p0 = point(e);
    const inside = p0.x >= t.x && p0.x <= t.x + t.w && p0.y >= t.y && p0.y <= t.y + t.h;
    const start = { ...t };
    const move = (ev) => {
      const p = point(ev);
      if (inside) {
        set({ target: { ...start, x: Math.min(1 - start.w, Math.max(0, start.x + p.x - p0.x)), y: Math.min(1 - start.h, Math.max(0, start.y + p.y - p0.y)) } });
      } else {
        set({ target: { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.max(0.03, Math.abs(p.x - p0.x)), h: Math.max(0.03, Math.abs(p.y - p0.y)) } });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { url } = await api('POST', '/api/quiz-media', fd);
      set({ visual: { ...q.visual, image: url } });
    } finally {
      setUploading(false);
    }
  };
  return (
    <>
      <div className="qz-seg qz-seg-wrap">
        {Object.entries(CANVASES).map(([k, label]) => (
          <button key={k} className={!q.visual.image && q.canvas === k ? 'is-on' : ''} onClick={() => set({ canvas: k, visual: { ...q.visual, image: '' } })}>{label}</button>
        ))}
        <label className={`btn-like ${q.visual.image ? 'is-on' : ''}`}>
          {uploading ? 'Uploading…' : '⬆ Your design'}
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => upload(e.target.files[0])} />
        </label>
      </div>
      <p className="muted small">Drag on the design to draw the correct area. Drag the green box to move it.</p>
      <div ref={ref} className="qz-hotspot is-editor" onPointerDown={down}>
        <HotspotCanvas canvas={q.canvas} image={q.visual.image}>
          <div className="qz-target is-editing" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.w * 100}%`, height: `${t.h * 100}%` }}>
            <span>Correct area</span>
          </div>
        </HotspotCanvas>
      </div>
    </>
  );
}

function SliderEditor({ q, set }) {
  const field = (key, label, extra = {}) => (
    <label>
      {label}
      <input type={key === 'unit' ? 'text' : 'number'} value={q[key]} {...extra} onChange={(e) => set({ [key]: key === 'unit' ? e.target.value : Number(e.target.value) })} />
    </label>
  );
  const span = Math.max(1, q.max - q.min);
  const at = (v) => `${Math.min(100, Math.max(0, ((v - q.min) / span) * 100))}%`;
  return (
    <>
      <div className="qz-ed-grid">
        {field('min', 'From')}
        {field('max', 'To')}
        {field('step', 'Step', { min: 0.01, step: 'any' })}
        {field('answer', 'Correct answer')}
        {field('tolerance', 'Full points within ±')}
        {field('unit', 'Unit (optional)', { maxLength: 12, placeholder: 'px, %, ms…' })}
      </div>
      <div className="qz-slider-reveal qz-mt">
        <div className="qz-slider-track">
          <div className="qz-band" style={{ left: at(q.answer - q.tolerance), width: `calc(${at(q.answer + q.tolerance)} - ${at(q.answer - q.tolerance)} + 4px)` }} />
          <span className="qz-marker is-right" style={{ left: at(q.answer) }}>{q.answer}{q.unit && ` ${q.unit}`}</span>
        </div>
      </div>
      <p className="muted small">Answers within twice the tolerance (or 5% of the range) get half points.</p>
    </>
  );
}

function BlanksEditor({ q, set }) {
  const ref = useRef(null);
  const makeGap = () => {
    const el = ref.current;
    const { selectionStart: a, selectionEnd: b } = el;
    if (a === b) return;
    set({ text: `${q.text.slice(0, a)}[[${q.text.slice(a, b).trim()}]]${q.text.slice(b)}` });
  };
  const parts = q.text.split(/(\[\[.+?\]\])/g);
  return (
    <>
      <p className="muted small">Write the sentence, select a word and click <b>Make it a gap</b> (or type [[word]]).</p>
      <textarea ref={ref} rows={3} maxLength={400} value={q.text} placeholder="A [[301]] redirect is permanent." onChange={(e) => set({ text: e.target.value })} />
      <div className="qz-ed-row-actions qz-mt">
        <button className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={makeGap}>🧩 Make it a gap</button>
      </div>
      <p className="qz-sentence is-editor">
        {parts.map((p, i) => (/^\[\[.+\]\]$/.test(p) ? <span key={i} className="qz-gap is-filled"><span className="qz-chip is-static">{p.slice(2, -2)}</span></span> : <span key={i}>{p}</span>))}
      </p>
      <label>
        Decoy words (comma separated)
        <input value={q.distractors.join(', ')} placeholder="404, 500" onChange={(e) => set({ distractors: e.target.value.split(',').map((s) => s.trimStart()).slice(0, 6) })} />
      </label>
    </>
  );
}
