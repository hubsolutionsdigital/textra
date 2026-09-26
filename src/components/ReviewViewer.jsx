import { useMemo, useState } from 'react';
import PdfDocument from './PdfDocument.jsx';
import Composer from './Composer.jsx';
import CommentCard from './CommentCard.jsx';
import { KINDS } from '../guidance.js';

/**
 * The design + comments workspace, shared by the client portal and the agency.
 * Comments from the live round are solid numbered pins; earlier rounds show as faint
 * "ghost" pins that reveal what was said when hovered, so the design stays uncluttered.
 */
export default function ReviewViewer({
  project,
  screen,
  version,
  comments,
  urls,
  mode,
  me,
  canComment,
  onCreate,
  onDelete,
  onUpdate,
  toolbar,
  sidebarTop,
  footer,
}) {
  const [zoom, setZoom] = useState(1);
  const [showPast, setShowPast] = useState(true);
  const [draft, setDraft] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const liveRound = ['final', 'approved'].includes(project.stage) ? null : project.current_round;
  const [tab, setTab] = useState(liveRound ? 'current' : 'past');

  const { live, past, numbers } = useMemo(() => {
    const mine = comments.filter((c) => c.screen_id === screen.id);
    const numbers = new Map();
    const perRound = new Map();
    for (const c of mine) {
      const n = (perRound.get(c.round) ?? 0) + 1;
      perRound.set(c.round, n);
      numbers.set(c.id, n);
    }
    return {
      live: mine.filter((c) => c.round === liveRound),
      past: mine.filter((c) => c.round !== liveRound).sort((a, b) => b.round - a.round || a.id - b.id),
      numbers,
    };
  }, [comments, screen.id, liveRound]);

  const focusComment = (c) => {
    setActiveId(c.id);
    if (c.round !== liveRound) setShowPast(true);
    requestAnimationFrame(() =>
      document.getElementById(`pin-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  };

  const onPageClick = canComment
    ? ({ pageNumber, x, y }) => {
        setActiveId(null);
        setDraft({ pageNumber, x, y });
      }
    : () => setActiveId(null);

  const cardProps = (c) => ({
    comment: c,
    number: numbers.get(c.id),
    urls,
    mode,
    canDelete: canComment && c.round === liveRound && c.author_name === me,
    onDelete: async (cm) => {
      await onDelete(cm);
      setActiveId(null);
    },
    onUpdate,
  });

  const renderOverlay = (pageNumber) => {
    const onPage = (c) => c.pdf_page === pageNumber;
    return (
      <div className="pdf-overlay">
        {showPast &&
          past.filter(onPage).map((c) => {
            const open = hoverId === c.id || activeId === c.id;
            return (
              <div
                key={c.id}
                id={`pin-${c.id}`}
                className={`pin ghost ${open ? 'open' : ''}`}
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                onMouseEnter={() => setHoverId(c.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveId(activeId === c.id ? null : c.id);
                }}
              >
                <span className="pin-dot">{KINDS[c.kind]?.emoji}</span>
                {open && (
                  <div className={`pin-popover ${c.x > 0.6 ? 'flip' : ''}`}>
                    <div className="popover-label">From round {c.round}</div>
                    <CommentCard {...cardProps(c)} compact />
                  </div>
                )}
              </div>
            );
          })}
        {live.filter(onPage).map((c) => {
          const tone = KINDS[c.kind]?.tone ?? 'change';
          return (
            <div
              key={c.id}
              id={`pin-${c.id}`}
              className={`pin live tone-${tone} ${activeId === c.id ? 'open' : ''}`}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              onClick={(e) => {
                e.stopPropagation();
                setDraft(null);
                setActiveId(activeId === c.id ? null : c.id);
              }}
            >
              <span className="pin-dot">{numbers.get(c.id)}</span>
              {activeId === c.id && (
                <div className={`pin-popover ${c.x > 0.6 ? 'flip' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <CommentCard {...cardProps(c)} />
                </div>
              )}
            </div>
          );
        })}
        {draft?.pageNumber === pageNumber && (
          <div className="pin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>
            <span className="pin-dot">+</span>
            <Composer
              flip={draft.x > 0.6}
              onCancel={() => setDraft(null)}
              onSubmit={async ({ kind, body, images }) => {
                await onCreate({ screen, pdf_page: pageNumber, x: draft.x, y: draft.y, kind, body, images });
                setDraft(null);
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const list = tab === 'current' ? live : past;

  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        {toolbar}
        <div className="toolbar-spacer" />
        <label className="toggle">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          <span>Earlier feedback</span>
        </label>
        <div className="zoom">
          <button className="btn btn-sm btn-ghost" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}>
            −
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setZoom(1)} title="Fit to width">
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))}>
            +
          </button>
        </div>
      </div>

      <div className="viewer-body">
        <div className={`canvas-scroll ${canComment ? 'can-comment' : ''}`}>
          {version ? (
            <PdfDocument url={urls.version(version.id)} zoom={zoom} renderOverlay={renderOverlay} onPageClick={onPageClick} />
          ) : (
            <div className="pdf-status">No design uploaded for this page yet.</div>
          )}
        </div>

        <aside className="viewer-sidebar">
          {sidebarTop}
          <div className="tabs">
            <button className={tab === 'current' ? 'active' : ''} onClick={() => setTab('current')}>
              {liveRound ? `Round ${liveRound}` : 'Latest'} <span className="count">{live.length}</span>
            </button>
            <button className={tab === 'past' ? 'active' : ''} onClick={() => setTab('past')}>
              Earlier rounds <span className="count">{past.length}</span>
            </button>
          </div>
          <div className="comment-list">
            {list.length === 0 && (
              <div className="empty-note">
                {tab === 'current'
                  ? canComment
                    ? 'No comments yet. Click anywhere on the design to leave one.'
                    : 'No comments in this round.'
                  : 'Nothing from earlier rounds on this page.'}
              </div>
            )}
            {list.map((c, i) => (
              <div key={c.id}>
                {tab === 'past' && (i === 0 || list[i - 1].round !== c.round) && (
                  <div className="round-divider">Round {c.round}</div>
                )}
                <div
                  className={`comment-list-item ${activeId === c.id ? 'active' : ''}`}
                  onClick={() => focusComment(c)}
                >
                  <CommentCard {...cardProps(c)} compact={mode === 'client'} />
                </div>
              </div>
            ))}
          </div>
          {footer}
        </aside>
      </div>
    </div>
  );
}
