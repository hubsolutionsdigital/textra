import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.js';
import { createApp } from './app.js';

const db = openDb();
const app = createApp(db);

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Review portal API listening on http://localhost:${port}`));
