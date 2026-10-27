import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { UPLOAD_DIR } from './db.js';

/** The same describer the in-page helper uses when a comment is left (see public/describe.js). */
const describeTarget = new Function(
  `${fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'describe.js'), 'utf8')}\nreturn describeTarget;`,
)();

const KINDS = {
  love: { emoji: '❤️', label: 'Love it' },
  like: { emoji: '👍', label: 'Like this' },
  great: { emoji: '🎉', label: 'This is great' },
  change: { emoji: '✏️', label: 'Change request' },
  question: { emoji: '❓', label: 'Question' },
};
const POSITIVE = ['love', 'like', 'great'];
const STATUS = { open: 'Open', done: 'Done', wontfix: 'Discussed' };
const DEVICES = { desktop: 'Desktop', laptop: 'Laptop', tablet: 'Tablet', mobile: 'Mobile' };

/**
 * Collects the feedback for an export, page by page in the project's page order.
 * Comment numbers match the pins on the design (per page and round, in the order they were left).
 */
export function collectFeedback(db, project, { round = 'all', onlyOpen = false } = {}) {
  const screens = db.prepare('SELECT * FROM screens WHERE project_id = ? ORDER BY position, id').all(project.id);
  const comments = db.prepare('SELECT * FROM comments WHERE project_id = ? ORDER BY id').all(project.id);
  const attachments = db
    .prepare('SELECT a.* FROM attachments a JOIN comments c ON c.id = a.comment_id WHERE c.project_id = ? ORDER BY a.id')
    .all(project.id);
  const latest = db.prepare('SELECT * FROM versions WHERE screen_id = ? ORDER BY id DESC LIMIT 1');
  const versionById = db.prepare('SELECT * FROM versions WHERE id = ?');
  const locate = locator();

  const numbers = new Map();
  const counters = new Map();
  for (const c of comments) {
    const key = `${c.screen_id}:${c.round}`;
    counters.set(key, (counters.get(key) ?? 0) + 1);
    numbers.set(c.id, counters.get(key));
  }
  const inScope = (c) =>
    (round === 'all' || c.round === round) && (!onlyOpen || (c.status === 'open' && !POSITIVE.includes(c.kind)));

  const pages = screens.map((s, i) => ({
    number: i + 1,
    title: s.title,
    note: s.note,
    kind: latest.get(s.id)?.kind ?? 'pdf',
    comments: comments
      .filter((c) => c.screen_id === s.id && inScope(c))
      .sort((a, b) => a.round - b.round || a.id - b.id)
      .map((c) => ({
        ...c,
        number: numbers.get(c.id),
        location: locate(c, (c.version_id && versionById.get(c.version_id)) || latest.get(s.id)),
        attachments: attachments.filter((a) => a.comment_id === c.id),
      })),
  }));
  const all = pages.flatMap((p) => p.comments);
  const actionable = all.filter((c) => !POSITIVE.includes(c.kind));
  return {
    project,
    round,
    onlyOpen,
    pages,
    totals: {
      comments: all.length,
      changes: all.filter((c) => c.kind === 'change').length,
      questions: all.filter((c) => c.kind === 'question').length,
      positive: all.length - actionable.length,
      handled: actionable.filter((c) => c.status !== 'open').length,
      actionable: actionable.length,
    },
  };
}

export const exportTitle = ({ project, round, onlyOpen }) =>
  `${project.name}: ${round === 'all' ? 'all feedback' : `round ${round} feedback`}${onlyOpen ? ' (open items)' : ''}`;

export const exportFileName = (data, ext) =>
  `${exportTitle(data).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}.${ext}`;

const dateText = (iso) =>
  new Date(`${iso.replace(' ', 'T')}Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Mobile view": the screen size the client was looking at. */
const whereText = (page, c) => (c.device ? `${DEVICES[c.device] ?? c.device} view` : '');

const parseJson = (raw) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** "top left", "middle", "bottom right" for a 0–1 position. */
const region = (x, y) => {
  const v = y < 0.34 ? 'top' : y > 0.66 ? 'bottom' : 'middle';
  const h = x < 0.34 ? 'left' : x > 0.66 ? 'right' : '';
  return v === 'middle' && !h ? 'middle' : `${v}${h ? ` ${h}` : ''}`;
};

const SPECIAL_SECTIONS = /^(Header|Footer|Navigation)/;

/** Turns a describeTarget() result into "Section 3 of 9 “Our games” → the “Play now” button". */
const describeWhere = (w) => {
  if (!w) return '';
  const parts = [];
  if (w.section) parts.push(`Section ${w.section} of ${w.sections}${w.sectionName ? ` “${w.sectionName}”` : ''}`);
  else if (SPECIAL_SECTIONS.test(w.sectionName)) parts.push(w.sectionName);
  else if (w.sectionName) parts.push(`“${w.sectionName}” (overlay, outside the page sections)`);
  if (w.element) parts.push(w.element);
  return parts.join(' → ');
};

/**
 * Where on the design a comment points, in words. HTML comments use the description recorded when
 * the comment was left; older ones are worked out from the uploaded page and the saved element.
 */
export function locator() {
  const docs = new Map();
  const loadDoc = (file) => {
    if (!docs.has(file)) {
      let doc = null;
      try {
        doc = parseHTML(fs.readFileSync(file, 'utf8')).document;
      } catch {
        doc = null;
      }
      docs.set(file, doc);
    }
    return docs.get(file);
  };
  const pageFile = (version, page) => {
    let rel = String(page || '').replace(/^\/+/, '');
    try {
      rel = decodeURIComponent(rel);
    } catch {
      /* keep as is */
    }
    if (!rel) rel = version.entry || 'index.html';
    else if (rel.endsWith('/')) rel += 'index.html';
    for (const dir of [version.stored_name, version.asset_base].filter(Boolean)) {
      const root = path.join(UPLOAD_DIR, dir);
      const file = path.resolve(root, rel);
      if (file.startsWith(root + path.sep) && fs.existsSync(file)) return file;
    }
    return null;
  };

  return (c, version) => {
    if (!version || version.kind !== 'html') {
      const pdfPage = c.pdf_page > 1 ? `PDF page ${c.pdf_page}, ` : '';
      return `${pdfPage}${region(c.x, c.y)} of the page (${Math.round(c.x * 100)}% across, ${Math.round(c.y * 100)}% down)`;
    }
    const a = parseJson(c.anchor) || {};
    let w = a.where;
    if (!w && a.selector) {
      const file = pageFile(version, a.page);
      const doc = file && loadDoc(file);
      let el = null;
      try {
        el = doc && doc.querySelector(a.selector);
      } catch {
        el = null;
      }
      try {
        if (el) w = describeTarget(el);
      } catch {
        w = null;
      }
    }
    const parts = [describeWhere(w)];
    const page = String(a.page || '').replace(/^\/+/, '');
    if (page && page !== version.entry) parts.push(`on ${page}`);
    if (a.py > 0) parts.push(`about ${(Math.round(a.py / 50) * 50).toLocaleString('en-GB')}px from the top`);
    return parts.filter(Boolean).join(' · ') || `${region(c.x, c.y)} of the screen`;
  };
}

const summaryText = ({ totals }) =>
  `${totals.comments} comment${totals.comments === 1 ? '' : 's'}: ${totals.changes} change request${totals.changes === 1 ? '' : 's'}, ` +
  `${totals.questions} question${totals.questions === 1 ? '' : 's'}, ${totals.positive} positive. ` +
  `${totals.handled} of ${totals.actionable} change requests and questions handled.`;

// ---------- Word ----------

/** Pixel size of a PNG, GIF or JPEG, or null. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), type: 'jpg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

const fit = ({ width, height }, maxW = 520, maxH = 560) => {
  const scale = Math.min(1, maxW / width, maxH / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

const NAVY = '1B3A6B';
const MUTED = '667085';

/** Builds the .docx: a heading per page, each comment numbered like its pin, with replies and screenshots. */
export async function toDocx(data, readAttachment) {
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: data.project.name, color: NAVY })] }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${data.round === 'all' ? 'All rounds' : `Round ${data.round} of ${data.project.max_rounds}`}` +
            `${data.onlyOpen ? ' · open items only' : ''} · ${data.project.client_name || 'Client'} · exported ${dateText(new Date().toISOString().slice(0, 19))}`,
          color: MUTED,
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun(summaryText(data))] }),
  ];

  for (const page of data.pages) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: children.length > 3 && page.comments.length > 0,
        children: [new TextRun({ text: `Page ${page.number}: ${page.title}`, color: NAVY })],
      }),
    );
    if (!page.comments.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'No feedback on this page.', italics: true, color: MUTED })] }));
      continue;
    }
    let lastRound = null;
    for (const c of page.comments) {
      if (data.round === 'all' && c.round !== lastRound) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`Round ${c.round}`)] }));
        lastRound = c.round;
      }
      const kind = KINDS[c.kind] ?? { emoji: '', label: c.kind };
      const cell = [
        new Paragraph({
          children: [
            new TextRun({ text: `#${c.number}  ${kind.emoji} ${kind.label}`, bold: true }),
            ...(POSITIVE.includes(c.kind)
              ? []
              : [new TextRun({ text: `   ${STATUS[c.status] ?? c.status}`, bold: true, color: c.status === 'open' ? 'B54708' : '027A48' })]),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: [c.author_name, dateText(c.created_at), whereText(page, c)].filter(Boolean).join(' · '),
              color: MUTED,
              size: 18,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 60, after: 60 },
          children: [new TextRun({ text: '📍 Where: ', bold: true, color: NAVY }), new TextRun({ text: c.location, bold: true })],
        }),
      ];
      for (const line of (c.body || '').split('\n')) if (c.body) cell.push(new Paragraph({ children: [new TextRun(line)] }));
      for (const a of c.attachments) {
        const buf = readAttachment(a);
        const size = buf && imageSize(buf);
        cell.push(
          size
            ? new Paragraph({ spacing: { before: 80 }, children: [new ImageRun({ type: size.type, data: buf, transformation: fit(size) })] })
            : new Paragraph({ children: [new TextRun({ text: '[Screenshot: view it in the portal]', italics: true, color: MUTED })] }),
        );
      }
      if (c.agency_reply) {
        cell.push(
          new Paragraph({
            spacing: { before: 80 },
            children: [new TextRun({ text: 'Team reply: ', bold: true, color: NAVY }), new TextRun(c.agency_reply)],
          }),
        );
      }
      if (c.client_reply) {
        cell.push(
          new Paragraph({
            spacing: { before: 60 },
            children: [
              new TextRun({ text: `${c.client_reply_by || 'Client'} answered: `, bold: true, color: '12783C' }),
              new TextRun(c.client_reply),
            ],
          }),
        );
      }
      const border = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' };
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: cell,
                  margins: { top: 100, bottom: 100, left: 140, right: 140 },
                  borders: { top: border, bottom: border, left: border, right: border },
                  shading: POSITIVE.includes(c.kind) ? { type: ShadingType.CLEAR, fill: 'F0F9F4', color: 'auto' } : undefined,
                }),
              ],
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 60 }, alignment: AlignmentType.LEFT, children: [] }),
      );
    }
  }

  const doc = new Document({
    creator: data.project.agency_name || 'Review Portal',
    title: exportTitle(data),
    styles: { default: { document: { run: { font: 'Arial', size: 21 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

// ---------- printable page (Save as PDF) ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** A standalone, print-ready HTML page; screenshots are embedded so it works offline too. */
export function toHtml(data, readAttachment) {
  const pages = data.pages
    .map((page) => {
      let lastRound = null;
      const items = page.comments
        .map((c) => {
          const kind = KINDS[c.kind] ?? { emoji: '', label: c.kind };
          const roundHead =
            data.round === 'all' && c.round !== lastRound ? `<h3 class="round">Round ${(lastRound = c.round)}</h3>` : '';
          const shots = c.attachments
            .map((a) => {
              const buf = readAttachment(a);
              return buf ? `<img src="data:${esc(a.mime)};base64,${buf.toString('base64')}" alt="Screenshot">` : '';
            })
            .join('');
          return `${roundHead}<div class="c ${POSITIVE.includes(c.kind) ? 'pos' : ''}">
  <div class="top"><strong>#${c.number} ${kind.emoji} ${esc(kind.label)}</strong>${POSITIVE.includes(c.kind) ? '' : `<span class="st st-${esc(c.status)}">${esc(STATUS[c.status] ?? c.status)}</span>`}</div>
  <div class="meta">${esc([c.author_name, dateText(c.created_at), whereText(page, c)].filter(Boolean).join(' · '))}</div>
  <div class="where">📍 <strong>Where:</strong> ${esc(c.location)}</div>
  ${c.body ? `<p>${esc(c.body).replace(/\n/g, '<br>')}</p>` : ''}${shots ? `<div class="shots">${shots}</div>` : ''}
  ${c.agency_reply ? `<div class="reply"><strong>Team reply:</strong> ${esc(c.agency_reply)}</div>` : ''}
  ${c.client_reply ? `<div class="reply client"><strong>${esc(c.client_reply_by || 'Client')} answered:</strong> ${esc(c.client_reply)}</div>` : ''}
</div>`;
        })
        .join('\n');
      return `<section class="${items ? 'has' : ''}"><h2>Page ${page.number}: ${esc(page.title)}</h2>${items || '<p class="none">No feedback on this page.</p>'}</section>`;
    })
    .join('\n');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(exportTitle(data))}</title>
<style>
  body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#101828;max-width:800px;margin:0 auto;padding:24px 16px;background:#fff}
  h1{color:#1b3a6b;margin:0 0 4px} h2{color:#1b3a6b;border-bottom:2px solid #1b3a6b;padding-bottom:4px;margin:32px 0 12px}
  h3.round{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#667085;margin:16px 0 8px}
  .sub,.meta,.none{color:#667085} .meta{font-size:12px;margin-bottom:6px}
  .summary{background:#f2f4f7;border-radius:8px;padding:10px 14px;margin:12px 0 0}
  .c{border:1px solid #d0d5dd;border-radius:8px;padding:10px 14px;margin:0 0 10px;break-inside:avoid}
  .c.pos{background:#f0f9f4}
  .where{font-size:13px;background:#f5f8fc;border-radius:6px;padding:4px 8px;margin:2px 0 6px;color:#1b3a6b} .c p{margin:4px 0}
  .top{display:flex;justify-content:space-between;gap:12px}
  .st{font-size:12px;font-weight:600;border-radius:99px;padding:1px 8px;background:#fef0c7;color:#b54708;white-space:nowrap}
  .st-done,.st-wontfix{background:#d1fadf;color:#027a48}
  .shots img{max-width:100%;max-height:420px;border:1px solid #eaecf0;border-radius:6px;margin-top:6px;display:block}
  .reply{margin-top:6px;padding:6px 10px;border-left:3px solid #1b3a6b;background:#f5f8fc}
  .reply.client{border-left-color:#12783c;background:#eef8f1}
  .bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;text-align:right}
  .bar button{font:inherit;font-weight:600;background:#1b3a6b;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer}
  section.has+section{break-before:auto} section.has:not(:first-of-type){break-before:page}
  @media print{.bar{display:none} body{padding:0} h2{margin-top:0}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
<h1>${esc(data.project.name)}</h1>
<div class="sub">${esc(data.round === 'all' ? 'All rounds' : `Round ${data.round} of ${data.project.max_rounds}`)}${data.onlyOpen ? ' · open items only' : ''} · ${esc(data.project.client_name || 'Client')} · exported ${esc(dateText(new Date().toISOString().slice(0, 19)))}</div>
<div class="summary">${esc(summaryText(data))}</div>
${pages}
</body></html>`;
}
