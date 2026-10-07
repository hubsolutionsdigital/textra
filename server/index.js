import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.js';
import { createApp } from './app.js';

// APP_MODE=quiz runs Quiz Arena as its own site, without the design review portal.
const quizOnly = process.env.APP_MODE === 'quiz';

const db = openDb();
const app = createApp(db, { quizOnly });

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  let page = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (quizOnly) {
    page = page
      .replace('<title>Design Review Portal</title>', '<title>Quiz Arena</title>')
      .replace('💬</text>', '🎮</text>')
      .replace('</head>', '<script>window.__APP_MODE__ = "quiz";</script></head>');
  }
  app.use(express.static(dist, { index: false }));
  app.get(/^(?!\/api\/).*/, (req, res) => res.type('html').send(page));
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`${quizOnly ? 'Quiz Arena' : 'Review portal'} listening on port ${port}`));

if (process.env.NODE_ENV === 'production' && !process.env.APP_URL && !quizOnly) {
  console.warn('[config] APP_URL is not set; links in emails will use the request host. Set APP_URL to your public URL.');
}
