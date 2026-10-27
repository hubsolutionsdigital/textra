import { useState } from 'react';
import { KINDS, isActionable } from '../guidance.js';
import { timeAgo } from '../util.js';
import { deviceLabel } from './HtmlStage.jsx';

const STATUS = {
  done: { label: 'Done', icon: '✅' },
  wontfix: { label: 'Discussed', icon: '💬' },
};

/**
 * One piece of feedback. Agency mode adds status + reply controls;
 * client mode lets the author remove their own comment while the round is open.
 */
export default function CommentCard({
  comment,
  number,
  urls,
  mode,
  canDelete,
  onDelete,
  onUpdate,
  compact,
  pending,
  hiddenHere,
  onSeenReply,
  onAnswer,
}) {
  const kind = KINDS[comment.kind] ?? KINDS.change;
  const [reply, setReply] = useState(comment.agency_reply);
  const [important, setImportant] = useState(!!comment.reply_important);
  const [editingReply, setEditingReply] = useState(false);
  const status = STATUS[comment.status];
  const actionable = isActionable(comment);
  const handled = comment.status !== 'open';

  return (
    <div className={`comment-card tone-${kind.tone} ${compact ? 'compact' : ''} ${handled ? 'handled' : ''}`}>
      <div className="comment-head">
        {number != null && <span className={`pin-badge tone-${kind.tone}`}>{number}</span>}
        <span className="comment-kind">
          {kind.emoji} {kind.label}
        </span>
        {comment.device && <span className="round-chip">{deviceLabel(comment.device)}</span>}
        <span className="round-chip">R{comment.round}</span>
      </div>
      {mode === 'agency' && comment.location && (
        <div className="comment-where" title="Where on the design">
          📍 {comment.location}
        </div>
      )}
      {hiddenHere && <div className="hidden-note">Not visible at this screen size. Click to jump to it.</div>}
      {comment.body && <p className="comment-body">{comment.body}</p>}
      {comment.attachments.length > 0 && (
        <div className="comment-images">
          {comment.attachments.map((id) => (
            <a key={id} href={urls.attachment(id)} target="_blank" rel="noreferrer">
              <img src={urls.attachment(id)} alt="Reference screenshot" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <div className="comment-meta">
        <span>
          {comment.author_name} · {timeAgo(comment.created_at)}
        </span>
        {status ? (
          <span
            className={`status-chip status-${comment.status}`}
            title={comment.status_changed_at ? `Updated ${timeAgo(comment.status_changed_at)}` : undefined}
          >
            {status.icon} {status.label}
            {mode === 'client' && comment.status_changed_at && (
              <span className="status-when"> · {timeAgo(comment.status_changed_at)}</span>
            )}
          </span>
        ) : (
          pending && actionable && <span className="status-chip status-pending">⏳ Working on it</span>
        )}
      </div>
      {comment.agency_reply && !editingReply && (
        <div className={`agency-reply ${comment.reply_important ? 'important' : ''}`}>
          {comment.reply_important ? <span className="reply-tag important">📌 Important</span> : null}
          {mode === 'client' && !comment.reply_seen_at && <span className="reply-tag new">New</span>}
          <strong>Studio reply:</strong> {comment.agency_reply}
          {mode === 'client' && !comment.reply_seen_at && onSeenReply && !asksQuestion(comment) && (
            <div>
              <button className="link-btn" onClick={() => onSeenReply(comment)}>
                ✓ Got it
              </button>
            </div>
          )}
          {mode === 'agency' && (
            <div className="reply-seen muted small">
              {comment.reply_seen_at
                ? `👀 Read by ${comment.reply_seen_by} · ${timeAgo(comment.reply_seen_at)}`
                : 'Not read by the client yet'}
            </div>
          )}
        </div>
      )}
      {comment.agency_reply && !editingReply && (
        <ClientAnswer comment={comment} mode={mode} onAnswer={onAnswer} onUpdate={onUpdate} />
      )}
      {mode === 'client' && canDelete && (
        <button className="link-btn danger" onClick={() => onDelete(comment)}>
          Remove
        </button>
      )}
      {mode === 'agency' && !actionable && (
        <div className="comment-actions">
          <span className="muted small">No action needed</span>
          <button className="link-btn" onClick={() => setEditingReply((v) => !v)}>
            {comment.agency_reply ? 'Edit reply' : 'Reply'}
          </button>
          {editingReply && (
            <form
              className="reply-form"
              onSubmit={(e) => {
                e.preventDefault();
                onUpdate(comment, { agency_reply: reply.trim(), reply_important: important }).then(() =>
                  setEditingReply(false),
                );
              }}
            >
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder="The client sees this under their comment"
              />
              <label className="toggle">
                <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
                <span>📌 Important: the client must confirm they’ve read it</span>
              </label>
              <button className="btn btn-sm btn-primary">Save reply</button>
            </form>
          )}
        </div>
      )}
      {mode === 'agency' && actionable && (
        <div className="comment-actions">
          {comment.status === 'open' ? (
            <button className="btn btn-sm" onClick={() => onUpdate(comment, { status: 'done' })}>
              ✅ Mark done
            </button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={() => onUpdate(comment, { status: 'open' })}>
              Reopen
            </button>
          )}
          {comment.status === 'open' && (
            <button className="btn btn-sm btn-ghost" onClick={() => onUpdate(comment, { status: 'wontfix' })}>
              💬 Discussed
            </button>
          )}
          <button className="link-btn" onClick={() => setEditingReply((v) => !v)}>
            {comment.agency_reply ? 'Edit reply' : 'Reply'}
          </button>
          {editingReply && (
            <form
              className="reply-form"
              onSubmit={(e) => {
                e.preventDefault();
                onUpdate(comment, { agency_reply: reply.trim(), reply_important: important }).then(() =>
                  setEditingReply(false),
                );
              }}
            >
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder="The client sees this under their comment"
              />
              <label className="toggle">
                <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
                <span>📌 Important: the client must confirm they’ve read it</span>
              </label>
              <button className="btn btn-sm btn-primary">Save reply</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** The team's reply asks the client something ("Could you confirm…?"), so we invite an answer up front. */
export const asksQuestion = (comment) => (comment.agency_reply || '').includes('?');

/** The client's answer to a team reply: a reply box for the client, a highlighted answer for the team. */
export function ClientAnswer({ comment, mode, onAnswer, onUpdate }) {
  const [open, setOpen] = useState(false);
  const answered = !!comment.client_reply;

  if (mode === 'agency') {
    if (!answered) return null;
    const isNew = !comment.client_reply_seen_at;
    return (
      <div className={`client-answer ${isNew ? 'new' : ''}`}>
        {isNew && <span className="reply-tag new">New answer</span>}
        <strong>💬 {comment.client_reply_by || 'Client'} answered:</strong> {comment.client_reply}
        <div className="muted small">
          {timeAgo(comment.client_reply_at)}
          {isNew && onUpdate && (
            <>
              {' · '}
              <button className="link-btn" onClick={() => onUpdate(comment, { client_reply_seen: true })}>
                ✓ Seen
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!onAnswer) {
    return answered ? (
      <div className="client-answer">
        <strong>💬 Your answer:</strong> {comment.client_reply}
      </div>
    ) : null;
  }
  if (answered && !open) {
    return (
      <div className="client-answer">
        <strong>💬 Your answer:</strong> {comment.client_reply}{' '}
        <button className="link-btn" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
    );
  }
  const question = asksQuestion(comment);
  if (!question && !open) {
    return (
      <button className="link-btn" onClick={() => setOpen(true)}>
        ↩ Reply to the team
      </button>
    );
  }
  return (
    <AnswerBox
      initial={comment.client_reply}
      prompt={question && !answered ? 'The team asked you a question. Reply here:' : 'Your reply to the team:'}
      onCancel={answered || !question ? () => setOpen(false) : undefined}
      onSend={async (body) => {
        await onAnswer(comment, body);
        setOpen(false);
      }}
    />
  );
}

function AnswerBox({ initial = '', prompt, onSend, onCancel }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="answer-box"
      onClick={(e) => e.stopPropagation()}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        setError('');
        try {
          await onSend(body.trim());
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="answer-prompt">{prompt}</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Type your answer…" />
      {error && <div className="form-error">{error}</div>}
      <div className="row">
        <button className="btn btn-sm btn-primary" disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
