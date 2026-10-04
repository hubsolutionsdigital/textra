// Labels, icons and colours shared by the quiz editor, host screen and player screens.

export const TYPES = {
  choice: { icon: '🔘', label: 'Quiz', hint: 'Pick the right answer (or several).' },
  truefalse: { icon: '⚖️', label: 'True or false', hint: 'A quick two-way call.' },
  order: { icon: '↕️', label: 'Drag to order', hint: 'Drag items into the right sequence.' },
  categorize: { icon: '🗂️', label: 'Sort into groups', hint: 'Drag items into the right bucket.' },
  match: { icon: '🔗', label: 'Match pairs', hint: 'Drag each answer onto its partner.' },
  hotspot: { icon: '📍', label: 'Pin the spot', hint: 'Drop a pin on the right part of a design.' },
  slider: { icon: '🎚️', label: 'Slider guess', hint: 'Slide to a number. Close calls score too.' },
  blanks: { icon: '🧩', label: 'Fill the gaps', hint: 'Drag words into the blanks.' },
};

export const SCENES = {
  none: 'No graphic',
  browser: 'Page building',
  serp: 'Search results',
  mobile: 'Mobile app',
  palette: 'Colour palette',
  typography: 'Typography',
  speed: 'Page speed',
  growth: 'Rank growth',
  grid: 'Layout grid',
  funnel: 'Conversion funnel',
  crawler: 'Crawler bot',
  links: 'Link network',
  cursor: 'Click & CTA',
};

export const CANVASES = {
  landing: 'Landing page',
  serp: 'Search result page',
  app: 'Dashboard app',
  checkout: 'Checkout form',
};

export const THEMES = {
  aurora: 'Aurora',
  sunset: 'Sunset',
  ocean: 'Ocean',
  forest: 'Forest',
  mono: 'Midnight',
};

export const TIMES = [10, 20, 30, 45, 60, 90, 120];

/** The four classic answer colours and shapes, repeated for 5–6 options. */
export const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'];
export const shapeClass = (i) => `qz-c${i % 6}`;

export const AVATARS = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦁', '🐯', '🐨', '🐵', '🐧', '🦉', '🐳', '🦖', '🐝', '👾', '🤖'];
export const REACTIONS = ['🔥', '👏', '😂', '😮', '🎉', '💜'];

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export const resultTone = (fraction) => (fraction === 1 ? 'correct' : fraction > 0 ? 'partial' : 'wrong');

export const RESULT_COPY = {
  correct: ['Nailed it!', 'Pixel perfect!', 'Ranked #1!', 'Chef’s kiss!', 'Flawless!'],
  partial: ['So close!', 'Partly right!', 'Almost there!'],
  wrong: ['Not quite', 'Plot twist!', 'Next one’s yours'],
};
export const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
