const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KIND_LABEL = {
  love: '❤️ Love it',
  like: '👍 Like this',
  great: '🎉 This is great',
  change: '✏️ Change',
  question: '❓ Question',
};
const POSITIVE = new Set(['love', 'like', 'great']);
const DEVICE_LABEL = { desktop: 'Desktop', laptop: 'Laptop', tablet: 'Tablet', mobile: 'Mobile' };

/** Splits, validates and de-duplicates a list of notification emails. */
export function parseEmails(input) {
  const list = (Array.isArray(input) ? input : String(input ?? '').split(/[\s,;]+/))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  const invalid = list.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return { emails: [...new Set(list)].filter((e) => !invalid.includes(e)).slice(0, 20), invalid };
}

export function roundSubmittedEmail({ project, round, author, screens, comments, teamUrl, adminUrl }) {
  const changes = comments.filter((c) => !POSITIVE.has(c.kind));
  const positives = comments.length - changes.length;
  const last = round >= project.max_rounds;
  const subject = `${author} submitted round ${round} of ${project.max_rounds} · ${project.name} (${comments.length} comment${comments.length === 1 ? '' : 's'})`;

  const groups = screens
    .map((s) => ({ screen: s, items: comments.filter((c) => c.screen_id === s.id) }))
    .filter((g) => g.items.length);

  const text = [
    `${author} submitted round ${round} of ${project.max_rounds} for "${project.name}"${project.client_name ? ` (${project.client_name})` : ''}.`,
    `${comments.length} comments: ${changes.length} changes/questions, ${positives} positive.`,
    last ? 'This was the final revision round. Next step: upload the final design and send it for approval.' : '',
    '',
    `Review and mark comments done: ${teamUrl}`,
    '',
    ...groups.flatMap((g) => [
      `== ${g.screen.title} ==`,
      ...g.items.map(
        (c) =>
          `- ${KIND_LABEL[c.kind] ?? c.kind}${c.body ? `: ${c.body}` : ''} (${c.author_name}${c.device ? `, ${DEVICE_LABEL[c.device] ?? c.device}` : ''})`,
      ),
      '',
    ]),
    `Project dashboard (sign-in): ${adminUrl}`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:'DM Sans',Arial,sans-serif;color:#0f1b2d">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:10px;padding:28px;border:1px solid #e1e6ed">
    <div style="font-size:13px;color:#5b6b80">${esc(project.client_name || 'Client')} · ${esc(project.name)}</div>
    <h1 style="font-size:22px;margin:6px 0 12px">📨 ${esc(author)} submitted round ${round} of ${project.max_rounds}</h1>
    <p style="margin:0 0 16px;color:#334155">
      <strong>${comments.length}</strong> comment${comments.length === 1 ? '' : 's'}:
      <strong>${changes.length}</strong> to action and <strong>${positives}</strong> positive.
      ${last ? '<br>This was the <strong>final revision round</strong>. Next: upload the final design and send it for approval.' : ''}
    </p>
    <a href="${esc(teamUrl)}" style="display:inline-block;background:#1b3a6b;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Review &amp; mark comments done →</a>
    ${groups
      .map(
        (g) => `
    <h2 style="font-size:16px;margin:24px 0 8px">${esc(g.screen.title)}</h2>
    ${g.items
      .map(
        (c) => `<div style="border-left:3px solid ${POSITIVE.has(c.kind) ? '#0f766e' : c.kind === 'question' ? '#2f6fd6' : '#b45309'};background:#f7f9fc;border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:14px">
      <strong>${esc(KIND_LABEL[c.kind] ?? c.kind)}</strong>${c.body ? `<div style="white-space:pre-wrap;margin-top:2px">${esc(c.body)}</div>` : ''}
      ${c.attachments?.length ? `<div style="font-size:12px;color:#5b6b80;margin-top:2px">📎 ${c.attachments.length} screenshot${c.attachments.length === 1 ? '' : 's'}</div>` : ''}
      <div style="font-size:12px;color:#5b6b80;margin-top:2px">${esc(c.author_name)}${c.device ? ` · ${esc(DEVICE_LABEL[c.device] ?? c.device)}` : ''}</div>
    </div>`,
      )
      .join('')}`,
      )
      .join('')}
    <p style="font-size:12px;color:#5b6b80;margin:24px 0 0">
      Anyone with the review link above can update comment statuses. Don't forward it outside your team.<br>
      Project dashboard: <a href="${esc(adminUrl)}" style="color:#1b3a6b">${esc(adminUrl)}</a>
    </p>
  </div>
</div></body></html>`;

  return { subject, text, html };
}
