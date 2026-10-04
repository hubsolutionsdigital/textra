// Starter quizzes offered when creating a new quiz. Hotspot targets are 0–1 fractions of the built-in
// mockups drawn in src/quiz/Canvases.jsx (800×500), so they must stay in sync with those drawings.

const q = (type, prompt, fields, extra = {}) => ({ type, prompt, time: 30, points: 1, ...extra, ...fields });

export const TEMPLATES = {
  uiux: {
    title: 'UI/UX Design Showdown',
    description: 'Laws of UX, accessibility, layout and interaction design, with drag-and-drop rounds.',
    theme: 'aurora',
    questions: [
      q('choice', 'Which law says the time to make a decision grows with the number of choices?', {
        options: [
          { text: "Hick's Law", correct: true },
          { text: "Fitts's Law" },
          { text: "Jakob's Law" },
          { text: "Miller's Law" },
        ],
      }, { visual: { scene: 'cursor' }, time: 20, explanation: 'Hick’s Law: more options, slower decisions. Keep menus and choices focused.' }),
      q('hotspot', 'Drag the pin onto the primary call-to-action on this landing page.', {
        canvas: 'landing',
        target: { x: 0.075, y: 0.58, w: 0.2125, h: 0.1 },
      }, { explanation: 'The primary CTA sits right under the headline, where the eye lands after reading the value proposition.' }),
      q('order', 'Put the Design Thinking stages in order.', {
        items: ['Empathize', 'Define', 'Ideate', 'Prototype', 'Test'],
      }, { visual: { scene: 'browser' }, time: 45, explanation: 'Empathize → Define → Ideate → Prototype → Test (and then iterate).' }),
      q('categorize', 'Drag each task into UX or UI.', {
        buckets: ['UX (experience)', 'UI (interface)'],
        items: [
          { text: 'User interviews', bucket: 0 },
          { text: 'Journey mapping', bucket: 0 },
          { text: 'Usability testing', bucket: 0 },
          { text: 'Colour palette', bucket: 1 },
          { text: 'Type scale', bucket: 1 },
          { text: 'Button hover states', bucket: 1 },
        ],
      }, { time: 45, explanation: 'UX shapes how the product works for people; UI is how it looks and feels on screen.' }),
      q('truefalse', 'WCAG AA requires a contrast ratio of at least 4.5:1 for normal body text.', { answer: true }, {
        visual: { scene: 'palette' },
        time: 20,
        explanation: 'True. 4.5:1 for normal text, 3:1 for large text (18pt, or 14pt bold).',
      }),
      q('match', 'Match each Gestalt principle to what it means.', {
        pairs: [
          { left: 'Proximity', right: 'Items close together look related' },
          { left: 'Similarity', right: 'Items that look alike seem grouped' },
          { left: 'Closure', right: 'We fill in gaps to see whole shapes' },
          { left: 'Continuity', right: 'The eye follows lines and curves' },
        ],
      }, { visual: { scene: 'grid' }, time: 45 }),
      q('slider', 'What is Apple’s minimum recommended touch target size?', {
        min: 20, max: 80, step: 1, answer: 44, tolerance: 0, unit: 'pt',
      }, { visual: { scene: 'mobile' }, explanation: '44×44 pt on iOS. Material Design recommends 48×48 dp.' }),
      q('blanks', 'Fill in the gaps.', {
        text: 'An [[8]]-point grid keeps spacing consistent, and body text reads best with a line height of about [[1.5]] times the font size.',
        distractors: ['5', '3', '2.5'],
      }, { visual: { scene: 'typography' }, time: 45 }),
      q('choice', 'Which of these are among Nielsen’s 10 usability heuristics? Pick all that apply.', {
        options: [
          { text: 'Visibility of system status', correct: true },
          { text: 'Error prevention', correct: true },
          { text: 'Recognition rather than recall', correct: true },
          { text: 'Mobile first' },
        ],
      }, { visual: { scene: 'browser' }, time: 30 }),
      q('hotspot', 'Where would users expect the button to create something new?', {
        canvas: 'app',
        target: { x: 0.8, y: 0.04, w: 0.165, h: 0.08 },
      }, { points: 2, explanation: 'Primary actions live top-right of the main content area in most dashboards (Jakob’s Law).' }),
    ],
  },

  seo: {
    title: 'SEO Speedrun',
    description: 'Core Web Vitals, SERP anatomy, technical and on-page SEO.',
    theme: 'ocean',
    questions: [
      q('choice', 'Which Core Web Vital measures loading performance?', {
        options: [
          { text: 'LCP (Largest Contentful Paint)', correct: true },
          { text: 'INP (Interaction to Next Paint)' },
          { text: 'CLS (Cumulative Layout Shift)' },
          { text: 'TTFB (Time to First Byte)' },
        ],
      }, { visual: { scene: 'speed' }, time: 20, explanation: 'LCP = loading, INP = responsiveness, CLS = visual stability. A good LCP is 2.5 s or less.' }),
      q('hotspot', 'Drag the pin onto the meta description in this search result.', {
        canvas: 'serp',
        target: { x: 0.05, y: 0.32, w: 0.725, h: 0.1 },
      }, { explanation: 'The meta description is the grey snippet under the title. Google may rewrite it, but a good one lifts clicks.' }),
      q('order', 'Put the steps of how a page gets into Google in order.', {
        items: ['Discover the URL', 'Crawl', 'Render', 'Index', 'Rank & serve'],
      }, { visual: { scene: 'crawler' }, time: 45 }),
      q('categorize', 'Sort these into On-page, Off-page or Technical SEO.', {
        buckets: ['On-page', 'Off-page', 'Technical'],
        items: [
          { text: 'Title tags', bucket: 0 },
          { text: 'Heading structure', bucket: 0 },
          { text: 'Backlinks', bucket: 1 },
          { text: 'Brand mentions', bucket: 1 },
          { text: 'XML sitemap', bucket: 2 },
          { text: 'Canonical tags', bucket: 2 },
        ],
      }, { time: 60 }),
      q('slider', 'About how many characters of a title tag does Google usually show before cutting it off?', {
        min: 20, max: 120, step: 1, answer: 60, tolerance: 5, unit: 'chars',
      }, { visual: { scene: 'serp' }, explanation: 'Around 50–60 characters (really ~600 px). Put the important words first.' }),
      q('match', 'Match each file or tag to its job.', {
        pairs: [
          { left: 'robots.txt', right: 'Tells crawlers which paths to skip' },
          { left: 'sitemap.xml', right: 'Lists the URLs you want found' },
          { left: 'rel="canonical"', right: 'Names the preferred version of a page' },
          { left: 'hreflang', right: 'Points to language/region versions' },
        ],
      }, { visual: { scene: 'links' }, time: 45 }),
      q('truefalse', 'Adding a meta keywords tag helps your Google rankings.', { answer: false }, {
        visual: { scene: 'growth' },
        time: 20,
        explanation: 'False. Google has ignored meta keywords for ranking since 2009.',
      }),
      q('blanks', 'Fill in the status codes.', {
        text: 'A [[301]] redirect is permanent, while a [[302]] redirect is temporary.',
        distractors: ['404', '500', '200'],
      }, { visual: { scene: 'links' } }),
      q('choice', 'Which Schema.org types can earn rich results? Pick all that apply.', {
        options: [
          { text: 'Product', correct: true },
          { text: 'Recipe', correct: true },
          { text: 'Event', correct: true },
          { text: 'KeywordDensity' },
        ],
      }, { visual: { scene: 'serp' } }),
      q('choice', 'Which link attribute marks a paid or sponsored link?', {
        options: [
          { text: 'rel="sponsored"', correct: true },
          { text: 'rel="ugc"' },
          { text: 'rel="noopener"' },
          { text: 'rel="canonical"' },
        ],
      }, { visual: { scene: 'funnel' }, points: 2, time: 20 }),
    ],
  },

  blank: {
    title: 'Untitled quiz',
    description: '',
    theme: 'sunset',
    questions: [
      q('choice', '', { options: [{ text: '', correct: true }, { text: '' }, { text: '' }, { text: '' }] }),
    ],
  },
};
