// Quiz questions: validation of what the host saves, the answer-free copy players see, and scoring.
//
// A question is plain JSON stored inside the quiz:
//   { id, type, prompt, time, points, visual: { scene, image }, explanation, ...type fields }
//
//   choice      options: [{ text, correct }]          (several correct = "pick all that apply")
//   truefalse   answer: true | false
//   order       items: [text, ...]                    in the correct order
//   categorize  buckets: [name, ...], items: [{ text, bucket }]
//   match       pairs: [{ left, right }]
//   hotspot     canvas (built-in mockup) or visual.image, target: { x, y, w, h } as 0–1 fractions
//   slider      min, max, step, answer, tolerance, unit
//   blanks      text with [[answer]] gaps, distractors: [text, ...]

import crypto from 'node:crypto';

export const QUESTION_TYPES = ['choice', 'truefalse', 'order', 'categorize', 'match', 'hotspot', 'slider', 'blanks'];
export const SCENES = [
  'none', 'browser', 'serp', 'mobile', 'palette', 'typography', 'speed', 'growth',
  'grid', 'funnel', 'crawler', 'links', 'cursor',
];
export const CANVASES = ['landing', 'serp', 'app', 'checkout'];
export const THEMES = ['aurora', 'sunset', 'ocean', 'forest', 'mono'];
const TIMES = [10, 20, 30, 45, 60, 90, 120];
const MAX_QUESTIONS = 100;

class QuizError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}
const bad = (message) => {
  throw new QuizError(message);
};

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp01 = (v) => Math.min(1, Math.max(0, num(v)));
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** Gap answers in a "blanks" text: "The [[title]] tag" -> ['title']. */
export const blankAnswers = (text) => [...String(text).matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1].trim());

/**
 * Cleans one question from the editor. Drafts are allowed to be incomplete; `problems` lists what
 * still needs filling in before the quiz can be played.
 */
export function cleanQuestion(raw, index) {
  const type = QUESTION_TYPES.includes(raw?.type) ? raw.type : 'choice';
  const visual = raw?.visual ?? {};
  const q = {
    id: str(raw?.id, 40) || crypto.randomBytes(6).toString('hex'),
    type,
    prompt: str(raw?.prompt, 300),
    time: TIMES.includes(num(raw?.time)) ? num(raw.time) : 30,
    points: [0, 1, 2].includes(num(raw?.points, 1)) ? num(raw.points, 1) : 1,
    visual: {
      scene: SCENES.includes(visual.scene) ? visual.scene : 'none',
      image: /^\/api\/quiz-media\/[\w.-]+$/.test(visual.image ?? '') ? visual.image : '',
    },
    explanation: str(raw?.explanation, 500),
  };

  switch (type) {
    case 'choice':
      q.options = list(raw.options, 6).map((o) => ({ text: str(o?.text, 120), correct: !!o?.correct }));
      break;
    case 'truefalse':
      q.answer = raw.answer !== false;
      break;
    case 'order':
      q.items = list(raw.items, 8).map((t) => str(t, 120));
      break;
    case 'categorize': {
      q.buckets = list(raw.buckets, 4).map((b) => str(b, 60));
      const n = Math.max(1, q.buckets.length);
      q.items = list(raw.items, 12).map((i) => ({
        text: str(i?.text, 80),
        bucket: Math.min(n - 1, Math.max(0, Math.round(num(i?.bucket)))),
      }));
      break;
    }
    case 'match':
      q.pairs = list(raw.pairs, 6).map((p) => ({ left: str(p?.left, 80), right: str(p?.right, 80) }));
      break;
    case 'hotspot': {
      q.canvas = CANVASES.includes(raw.canvas) ? raw.canvas : 'landing';
      const t = raw.target ?? {};
      const w = Math.max(0.03, clamp01(t.w || 0.2));
      const h = Math.max(0.03, clamp01(t.h || 0.15));
      q.target = { x: Math.min(clamp01(t.x), 1 - w), y: Math.min(clamp01(t.y), 1 - h), w, h };
      break;
    }
    case 'slider': {
      q.min = num(raw.min, 0);
      q.max = num(raw.max, 100);
      if (q.max <= q.min) q.max = q.min + 1;
      q.step = Math.max(0.01, num(raw.step, 1));
      q.answer = Math.min(q.max, Math.max(q.min, num(raw.answer, (q.min + q.max) / 2)));
      q.tolerance = Math.max(0, num(raw.tolerance, 0));
      q.unit = str(raw.unit, 12);
      break;
    }
    case 'blanks':
      q.text = str(raw.text, 400);
      q.distractors = list(raw.distractors, 6).map((t) => str(t, 60)).filter(Boolean);
      break;
  }
  q.problems = problemsOf(q, index);
  return q;
}

function problemsOf(q, index) {
  const at = `Question ${index + 1}`;
  const out = [];
  if (!q.prompt) out.push(`${at}: add the question text`);
  const filled = (arr) => arr.filter((t) => t).length;
  switch (q.type) {
    case 'choice':
      if (filled(q.options.map((o) => o.text)) < 2) out.push(`${at}: add at least 2 answers`);
      if (!q.options.some((o) => o.correct && o.text)) out.push(`${at}: mark the correct answer`);
      break;
    case 'order':
      if (filled(q.items) < 3) out.push(`${at}: add at least 3 items to put in order`);
      break;
    case 'categorize':
      if (filled(q.buckets) < 2) out.push(`${at}: add at least 2 groups`);
      if (filled(q.items.map((i) => i.text)) < 2) out.push(`${at}: add at least 2 items to sort`);
      break;
    case 'match':
      if (q.pairs.filter((p) => p.left && p.right).length < 2) out.push(`${at}: add at least 2 complete pairs`);
      break;
    case 'blanks':
      if (!blankAnswers(q.text).length) out.push(`${at}: wrap at least one answer in [[double brackets]]`);
      break;
  }
  return out;
}

/** Validates a whole quiz from the editor. */
export function cleanQuiz(raw) {
  const title = str(raw?.title, 120);
  if (!title) bad('Give the quiz a title');
  const questions = list(raw?.questions, MAX_QUESTIONS).map(cleanQuestion);
  return {
    title,
    description: str(raw?.description, 500),
    theme: THEMES.includes(raw?.theme) ? raw.theme : 'aurora',
    questions,
  };
}

/** Questions ready to play: every question complete. */
export function playable(questions) {
  const problems = questions.flatMap((q) => q.problems ?? []);
  if (!questions.length) problems.push('Add at least one question');
  return { ok: problems.length === 0, problems };
}

/**
 * A playable copy of a question with the editor's empty rows removed (and category indexes
 * remapped), so indexes mean the same thing to the player, the grader and the reveal.
 */
export function compact(q) {
  const { problems, ...out } = q;
  switch (q.type) {
    case 'choice':
      out.options = q.options.filter((o) => o.text);
      break;
    case 'order':
      out.items = q.items.filter(Boolean);
      break;
    case 'categorize': {
      const keep = q.buckets.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
      out.buckets = keep.map((i) => q.buckets[i]);
      out.items = q.items
        .filter((it) => it.text && keep.includes(it.bucket))
        .map((it) => ({ text: it.text, bucket: keep.indexOf(it.bucket) }));
      break;
    }
    case 'match':
      out.pairs = q.pairs.filter((p) => p.left && p.right);
      break;
  }
  return out;
}

function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Never hand out the answer already solved.
  if (a.length > 1 && a.every((x, i) => x === arr[i])) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

/**
 * What a player sees while answering a compacted question: no correct answers. Shuffled items carry
 * the index of the original item as `id`, which is what answers refer to.
 */
export function forPlayer(q) {
  const base = { id: q.id, type: q.type, prompt: q.prompt, time: q.time, points: q.points, visual: q.visual };
  switch (q.type) {
    case 'choice':
      return {
        ...base,
        options: q.options.map((o) => ({ text: o.text })),
        multi: q.options.filter((o) => o.correct).length > 1,
      };
    case 'truefalse':
      return base;
    case 'order':
      return { ...base, items: shuffle(q.items.map((text, id) => ({ id, text }))) };
    case 'categorize':
      return { ...base, buckets: q.buckets, items: shuffle(q.items.map((i, id) => ({ id, text: i.text }))) };
    case 'match':
      return {
        ...base,
        lefts: q.pairs.map((p, id) => ({ id, text: p.left })),
        rights: shuffle(q.pairs.map((p, id) => ({ id, text: p.right }))),
      };
    case 'hotspot':
      return { ...base, canvas: q.canvas, image: q.visual.image };
    case 'slider':
      return { ...base, min: q.min, max: q.max, step: q.step, unit: q.unit };
    case 'blanks': {
      const answers = blankAnswers(q.text);
      const parts = String(q.text).split(/\[\[.+?\]\]/);
      // Chip ids are given after shuffling, so they say nothing about which chips are answers.
      const chips = shuffle([...answers, ...q.distractors]).map((text, id) => ({ id, text }));
      return { ...base, parts, chips };
    }
  }
  return base;
}

/** The correct answer of a compacted question, in the same shape players answer with. */
export function solutionOf(q) {
  switch (q.type) {
    case 'choice':
      return q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
    case 'truefalse':
      return q.answer;
    case 'order':
      return q.items.map((_, i) => i);
    case 'categorize':
      return Object.fromEntries(q.items.map((it, i) => [i, it.bucket]));
    case 'match':
      return Object.fromEntries(q.pairs.map((_, i) => [i, i]));
    case 'hotspot':
      return q.target;
    case 'slider':
      return { answer: q.answer, tolerance: q.tolerance };
    case 'blanks':
      return blankAnswers(q.text);
  }
  return null;
}

/** Everything shown once time is up: the question as played, plus the solution and explanation. */
export const revealOf = (q, played) => ({ ...played, solution: solutionOf(q), explanation: q.explanation });

/**
 * How right an answer to a compacted question is, from 0 to 1. Drag-and-drop questions earn partial
 * credit per item. `answer` is untrusted input from a player, so every shape is checked.
 */
export function gradeAnswer(q, answer) {
  const ratio = (want, isRight) => {
    const ids = Object.keys(want);
    return ids.length ? ids.filter(isRight).length / ids.length : 0;
  };
  const obj = (a) => (a && typeof a === 'object' && !Array.isArray(a) ? a : {});
  switch (q.type) {
    case 'choice': {
      const correct = solutionOf(q);
      if (!correct.length) return 0;
      const picked = [...new Set(list(answer, 6).map((n) => Math.round(num(n, -1))))].filter(
        (i) => i >= 0 && i < q.options.length,
      );
      const hits = picked.filter((i) => correct.includes(i)).length;
      return Math.max(0, (hits - (picked.length - hits)) / correct.length);
    }
    case 'truefalse':
      return answer === q.answer ? 1 : 0;
    case 'order': {
      const got = list(answer, 20).map((n) => Math.round(num(n, -1)));
      return ratio(solutionOf(q), (i) => got[i] === Number(i));
    }
    case 'categorize':
    case 'match': {
      const want = solutionOf(q);
      const got = obj(answer);
      return ratio(want, (id) => got[id] !== undefined && num(got[id], -1) === want[id]);
    }
    case 'hotspot': {
      const x = num(answer?.x, -1);
      const y = num(answer?.y, -1);
      const t = q.target;
      // A small margin so a pin on the edge of the target still counts.
      const m = 0.02;
      return x >= t.x - m && x <= t.x + t.w + m && y >= t.y - m && y <= t.y + t.h + m ? 1 : 0;
    }
    case 'slider': {
      if (answer === null || answer === undefined || answer === '') return 0;
      const diff = Math.abs(num(answer, Infinity) - q.answer);
      if (diff <= q.tolerance) return 1;
      // Close calls still earn something: half points within twice the tolerance (or 5% of the range).
      const near = Math.max(q.tolerance * 2, (q.max - q.min) * 0.05);
      return diff <= near ? 0.5 : 0;
    }
    case 'blanks': {
      const want = blankAnswers(q.text).map((t) => t.toLowerCase());
      const got = list(answer, 20).map((t) => str(t, 60).toLowerCase());
      return ratio(want, (i) => got[i] === want[i]);
    }
  }
  return 0;
}

/**
 * Points for one answer, Kahoot style: up to 1000 (2000 for double points), losing up to half for
 * answering slowly, scaled by how right it was.
 */
export function pointsFor(q, fraction, elapsedMs) {
  if (!q.points || fraction <= 0) return 0;
  const t = Math.min(1, Math.max(0, elapsedMs / (q.time * 1000)));
  return Math.round(1000 * q.points * fraction * (1 - t / 2));
}

/** Bonus for answering several questions fully right in a row. */
export const streakBonus = (streak) => (streak >= 2 ? Math.min(500, (streak - 1) * 100) : 0);
