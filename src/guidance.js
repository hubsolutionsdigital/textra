/** Preset reactions. Positive ones come first on purpose: we want clients to start with what works. */
export const KINDS = {
  love: { emoji: '❤️', label: 'Love it', tone: 'positive' },
  like: { emoji: '👍', label: 'Like this', tone: 'positive' },
  great: { emoji: '🎉', label: 'This is great', tone: 'positive' },
  change: { emoji: '✏️', label: 'Suggest a change', tone: 'change' },
  question: { emoji: '❓', label: 'Ask a question', tone: 'question' },
};

export const POSITIVE_KINDS = ['love', 'like', 'great'];

/** What the client should focus on in each round. The last round is always "final details". */
const FOCUS = [
  {
    title: 'Layout & structure',
    why: 'We build the layout first, so locking it in now saves everyone time later.',
    tips: [
      'Are the sections in the right order?',
      'Is anything missing, or is there something you don’t need?',
      'Do the big building blocks feel right (e.g. a slider vs. a single hero image)?',
      'Don’t worry about exact wording or colours yet — we’ll get to those.',
    ],
  },
  {
    title: 'Content & visual style',
    why: 'The structure is in place. Now let’s make sure it looks and reads like you.',
    tips: [
      'Is the wording and tone right?',
      'Do the images, colours and fonts feel on-brand?',
      'Are buttons and calls-to-action saying the right thing?',
    ],
  },
  {
    title: 'Final details & polish',
    why: 'This is the last round of changes — perfect time for the finishing touches.',
    tips: [
      'Check spelling, prices, phone numbers and small print.',
      'Look at spacing and small visual details.',
      'Anything that still bugs you? Now is the time to say it.',
    ],
  },
];

export function roundFocus(round, maxRounds) {
  if (round >= maxRounds) return FOCUS[2];
  return FOCUS[Math.min(round - 1, 1)];
}

export const ordinal = (n) => ['first', 'second', 'third', 'fourth', 'fifth'][n - 1] ?? `${n}th`;

export function versionLabel(version, maxRounds) {
  if (!version) return 'No file yet';
  return version.round > maxRounds ? 'Final' : `Round ${version.round}`;
}
