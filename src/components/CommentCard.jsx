import { useState } from 'react';
import { KINDS } from '../guidance.js';
import { timeAgo } from '../util.js';

const STATUS = {
  done: { label: 'Done', icon: '✅' },
  wontfix: { label: 'Discussed', icon: '💬' },
};

/**
 * One piece of feedback. Agency mode adds status + reply controls;
 * client mode lets the author remove their own comment while the round is open.
 */
export default function CommentCard({ comment, number, urls, mode, canDelete, onDelete, onUpdate, compact }) {
  const kind = KINDS[comment.kind] ?? KINDS.change;
  const [reply, setReply] = useState(comment.agency_reply);
  const [editingReply, setEditingReply] = useState(false);
  const status = STATUS[comment.status];

  return (
    <div className={`comment-card tone-${kind.tone} ${compact ? 'compact' : ''}`}>
      <div className="comment-head">
        {number != null && <span className={`pin-badge tone-${kind.tone}`}>{number}</span>}
        <span className="comment-kind">
          {kind.emoji} {kind.label}
        </span>
        <span className="round-chip">R{comment.round}</span>
      </div>
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
        {status && (
          <span className={`status-chip status-${comment.status}`}>
            {status.icon} {status.label}
          </span>
        )}
      </div>
      {comment.agency_reply && !editingReply && (
        <div className="agency-reply">
          <strong>Studio reply:</strong> {comment.agency_reply}
        </div>
      )}
      {mode === 'client' && canDelete && (
        <button className="link-btn danger" onClick={() => onDelete(comment)}>
          Remove
        </button>
      )}
      {mode === 'agency' && (
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
                onUpdate(comment, { agency_reply: reply.trim() }).then(() => setEditingReply(false));
              }}
            >
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder="Visible to the client in the next round"
              />
              <button className="btn btn-sm btn-primary">Save reply</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
