import { useMemo, useRef, useState } from 'react';
import PdfDocument from './PdfDocument.jsx';
import HtmlStage, { DEVICES } from './HtmlStage.jsx';
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
  screens = [],
  onOpenScreen,
  view,
}) {
  const [zoom, setZoom] = useState(1);
  const [showPast, setShowPast] = useState(true);
  const [draft, setDraft] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const liveRound = ['final', 'approved'].includes(project.stage) ? null : project.current_round;
  const [tab, setTab] = useState(liveRound ? 'current' : 'past');

  // HTML prototypes
  const isHtml = version?.kind === 'html';
  const stageRef = useRef(null);
  // Start at the reviewer's own kind of device: on a phone, a desktop preview would be a tiny thumbnail.
  // `view` carries device + mode over when the reviewer moves to another page through the design's own menu.
  const [device, setDevice] = useState(
    () => view?.device ?? (window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop'),
  );
  const [commentMode, setCommentMode] = useState(view?.commentMode ?? canComment);
  const [foreignPage, setForeignPage] = useState(null);
  const [stageKey, setStageKey] = useState(0);

  /**
   * The design was navigated (e.g. its menu's "Play" link in Interact mode). If that file is another page in
   * this review, switch to it so the title, comments and Done button follow; otherwise say it isn't reviewed.
   */
  const handlePageChange = (page) => {
    if (!version || page === version.entry) return setForeignPage(null);
    const target = screens.find(
      (s) =>
        s.id !== screen.id &&
        s.current_version?.kind === 'html' &&
        (s.current_version.site_group ?? s.current_version.stored_name) === (version.site_group ?? version.stored_name) &&
        s.current_version.entry === page,
    );
    if (target && onOpenScreen) {
      onOpenScreen(target, { device, commentMode });
    } else {
      setHtmlDraft(null);
      setForeignPage(page);
    }
  };
  const [htmlDraft, setHtmlDraft] = useState(null);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [pageError, setPageError] = useState(null);

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
    if (isHtml) {
      setHtmlDraft(null);
      // Jump to the screen size it was left on if it isn't visible at the current one.
      if (hiddenIds.includes(c.id) && c.device) setDevice(c.device);
      setTimeout(() => stageRef.current?.focus(c.id), hiddenIds.includes(c.id) ? 600 : 0);
      return;
    }
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
    hiddenHere: isHtml && hiddenIds.includes(c.id),
    // For the client: feedback from a submitted round that the team hasn't closed yet.
    pending: mode === 'client' && c.status === 'open' && !(project.stage === 'review' && c.round === project.current_round),
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

  const htmlPins = isHtml
    ? [...live, ...(showPast ? past : [])]
        .map((c) => ({ c, a: parseAnchor(c.anchor) }))
        .filter(({ a }) => a)
        .map(({ c, a }) => ({
          ...a,
          id: c.id,
          ghost: c.round !== liveRound,
          tone: KINDS[c.kind]?.tone ?? 'change',
          label: c.round !== liveRound ? KINDS[c.kind]?.emoji ?? '•' : String(numbers.get(c.id)),
        }))
    : [];
  const byId = (id) => comments.find((c) => c.id === id);

  const renderHtmlPopover = ({ kind, id, left, top, flip, dy, hover }) => {
    const anchorStyle = { left, top, '--dy': `${dy}px` };
    if (kind === 'draft') {
      return (
        <div className="stage-anchor" style={anchorStyle} key="draft">
          <Composer
            flip={flip}
            onCancel={() => setHtmlDraft(null)}
            onSubmit={async ({ kind: k, body, images }) => {
              await onCreate({
                screen,
                pdf_page: 1,
                x: htmlDraft.fx,
                y: htmlDraft.fy,
                kind: k,
                body,
                images,
                anchor: htmlDraft,
                device,
              });
              setHtmlDraft(null);
            }}
          />
        </div>
      );
    }
    const c = byId(id);
    if (!c) return null;
    return (
      <div className="stage-anchor" style={anchorStyle} key={`pin-${id}-${hover ? 'h' : 'a'}`}>
        <div className={`pin-popover ${flip ? 'flip' : ''}`} onClick={(e) => e.stopPropagation()}>
          {c.round !== liveRound && <div className="popover-label">From round {c.round}</div>}
          <CommentCard {...cardProps(c)} compact={hover} />
        </div>
      </div>
    );
  };

  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        {toolbar}
        <div className="toolbar-spacer" />
        <label className="toggle">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          <span>Earlier feedback</span>
        </label>
        {isHtml && (
          <>
            <div className="segmented" role="group" aria-label="Screen size" data-tour="devices">
              {DEVICES.map((d) => (
                <button
                  key={d.id}
                  className={device === d.id ? 'active' : ''}
                  onClick={() => {
                    setDevice(d.id);
                    setHtmlDraft(null);
                  }}
                  title={`${d.label} (${d.width}${d.height ? ` × ${d.height}` : ""} px)`}
                >
                  <span aria-hidden>{d.icon}</span> {d.label}
                </button>
              ))}
            </div>
            {canComment && (
              <div className="segmented" role="group" aria-label="Mode" data-tour="mode">
                <button
                  className={commentMode ? 'active' : ''}
                  onClick={() => setCommentMode(true)}
                  title="Click anywhere on the page to leave a comment"
                >
                  💬 Comment
                </button>
                <button
                  className={!commentMode ? 'active' : ''}
                  onClick={() => {
                    setCommentMode(false);
                    setHtmlDraft(null);
                  }}
                  title="Use the page normally: click links, open menus, play animations"
                >
                  👆 Interact
                </button>
              </div>
            )}
          </>
        )}
        {!isHtml && (
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
        )}
      </div>

      <div className="viewer-body">
        <div className={`canvas-scroll ${canComment ? 'can-comment' : ''} ${isHtml ? 'is-html' : ''}`} data-tour="canvas">
          {isHtml && pageError && mode === 'agency' && (
            <div className="page-error" role="status">
              ⚠️ This prototype hit a script error in the portal: <code>{pageError.message}</code>
              {pageError.source && <> ({pageError.source})</>}. Some animations may not run as designed.
              <button className="link-btn" onClick={() => setPageError(null)}>
                Dismiss
              </button>
            </div>
          )}
          {isHtml && foreignPage && (
            <div className="page-error foreign-page" role="status">
              <span>
                You’re on <strong>{foreignPage}</strong>, which isn’t one of the pages in this review. Comments here are
                saved on “{screen.title}”.
              </span>
              <button
                className="link-btn"
                onClick={() => {
                  setForeignPage(null);
                  setStageKey((k) => k + 1);
                }}
              >
                Back to {screen.title}
              </button>
            </div>
          )}
          {isHtml ? (
            <HtmlStage
              key={stageKey}
              ref={stageRef}
              src={`/sites/${version.site_token}/${version.entry}`}
              device={device}
              pins={htmlPins}
              commentMode={canComment && commentMode}
              activeId={activeId}
              draftAnchor={htmlDraft}
              onPageClick={({ anchor }) => {
                setActiveId(null);
                setHtmlDraft(anchor);
              }}
              onPinClick={(id) => {
                setHtmlDraft(null);
                setActiveId((cur) => (cur === id ? null : id));
              }}
              onHiddenChange={setHiddenIds}
              onDismiss={() => setActiveId(null)}
              onPageError={(err) => setPageError((cur) => cur ?? err)}
              onPageChange={handlePageChange}
              renderPopover={renderHtmlPopover}
            />
          ) : version ? (
            <PdfDocument url={urls.version(version.id)} zoom={zoom} renderOverlay={renderOverlay} onPageClick={onPageClick} />
          ) : (
            <div className="pdf-status">No design uploaded for this page yet.</div>
          )}
        </div>

        <aside className="viewer-sidebar">
          {sidebarTop}
          <div className="tabs" data-tour="comments">
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

function parseAnchor(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
