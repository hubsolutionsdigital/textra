// Which app this deployment is. With APP_MODE=quiz the server runs Quiz Arena on its own (no review
// portal) and tells the page by setting window.__APP_MODE__; `npm run dev` reads VITE_APP_MODE instead.
export const QUIZ_ONLY =
  (typeof window !== 'undefined' && window.__APP_MODE__ === 'quiz') || import.meta.env.VITE_APP_MODE === 'quiz';

/** Where signed-in users land. */
export const HOME = QUIZ_ONLY ? '/quizzes' : '/projects';
