import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrls } from '../api.js';
import Modal from '../components/Modal.jsx';
import ReviewViewer from '../components/ReviewViewer.jsx';
import CommentCard from '../components/CommentCard.jsx';
import { KINDS, ordinal, roundFocus } from '../guidance.js';
import { celebrate } from '../confetti.js';
import { plural, storage } from '../util.js';

const IDLE_PROMPT_SECONDS = 10 * 60;
const REFRESH_MS = 45_000;

export default function ClientPortal() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState(() => storage.get(`review-name:${token}`) || '');
  const [submitOpen, setSubmitOpen] = useState(null); // null | 'manual' | 'idle'
  const [celebration, setCelebration] = useState(null);

  const load = useCallback(
    () =>
      api('GET', `/api/share/${token}`).then(
        (d) => {
          setData(d);
          setError('');
        },
        (e) => setError(e.message),
      ),
    [token],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const call = async (method, path, body) => setData(await api(method, `/api/share/${token}${path}`, body));

  const myRoundComments = useMemo(
    () =>
      data ? data.comments.filter((c) => c.round === data.project.current_round && c.author_name === name) : [],
    [data, name],
  );

  useIdleSubmitPrompt({
    enabled: data?.project.stage === 'review' && !!name && myRoundComments.length > 0 && !submitOpen,
    onPrompt: () => setSubmitOpen('idle'),
  });

  if (error && !data) {
    return (
      <div className="client-shell center">
        <div className="big-card">
          <div className="big-emoji">🔗</div>
          <h1>Link not found</h1>
          <p className="muted">{error}. Please check the link with your design team.</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="page-loading">Loading your review…</div>;

  const { project } = data;

  if (!name) {
    return (
      <NameGate
        project={project}
        onSubmit={async (n) => {
          await api('POST', `/api/share/${token}/join`, { name: n });
          storage.set(`review-name:${token}`, n);
          setName(n);
        }}
      />
    );
  }

  const ctx = {
    token,
    data,
    name,
    call,
    urls: fileUrls({ token }),
    openSubmit: () => setSubmitOpen('manual'),
  };

  return (
    <div className="client-shell">
      <ClientHeader
        project={project}
        name={name}
        onChangeName={() => {
          storage.set(`review-name:${token}`, '');
          setName('');
        }}
        onSubmit={ctx.openSubmit}
        commentCount={data.comments.filter((c) => c.round === project.current_round).length}
        reviewedCount={data.screens.filter((s) => screenStatus(data, s, name).reviewed).length}
        totalScreens={data.screens.length}
      />
      <Routes>
        <Route index element={<Overview {...ctx} />} />
        <Route path="p/:screenId" element={<ClientScreen {...ctx} />} />
      </Routes>
      {project.stage === 'review' && <TourModal key={project.current_round} {...ctx} />}
      {submitOpen && project.stage === 'review' && (
        <SubmitModal
          {...ctx}
          reason={submitOpen}
          onClose={() => setSubmitOpen(null)}
          onSubmitted={() => {
            setSubmitOpen(null);
            setCelebration('submitted');
            celebrate();
          }}
        />
      )}
      {celebration && <Celebration kind={celebration} project={project} onClose={() => setCelebration(null)} />}
      {project.stage === 'final' && (
        <ApproveBar
          {...ctx}
          onApproved={() => {
            setCelebration('approved');
            celebrate();
          }}
        />
      )}
    </div>
  );
}

/** Counts visible time on the page and fires once it reaches the threshold. */
function useIdleSubmitPrompt({ enabled, onPrompt }) {
  const seconds = useRef(0);
  const cb = useRef(onPrompt);
  cb.current = onPrompt;
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      seconds.current += 5;
      if (seconds.current >= IDLE_PROMPT_SECONDS) {
        seconds.current = 0;
        cb.current();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [enabled]);
}

function NameGate({ project, onSubmit }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="client-shell center">
      <form
        className="big-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim()) return;
          setBusy(true);
          try {
            await onSubmit(value.trim());
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        <div className="big-emoji">👋</div>
        <div className="muted">{project.agency_name} shared a design with you</div>
        <h1>{project.name}</h1>
        <p className="muted">
          No account needed. Just tell us who’s giving feedback so the team knows who said what.
        </p>
        <input
          className="input-lg"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          autoFocus
          maxLength={80}
        />
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={!value.trim() || busy}>
          Let’s go →
        </button>
      </form>
    </div>
  );
}

function ClientHeader({ project, name, onChangeName, onSubmit, commentCount, reviewedCount, totalScreens }) {
  const ready = totalScreens > 0 && reviewedCount === totalScreens;
  const stageLabel = {
    review: `Round ${project.current_round} of ${project.max_rounds}`,
    revising: `Round ${project.current_round} submitted`,
    final: 'Final approval',
    approved: 'Approved 🎉',
  }[project.stage];
  return (
    <header className="client-header">
      <Link to="." className="client-title">
        <span className="muted small">{project.agency_name}</span>
        <strong>{project.name}</strong>
      </Link>
      <span className="round-pill">{stageLabel}</span>
      <div className="grow" />
      <span className="muted small hide-sm">
        Hi, {name} ·{' '}
        <button className="link-btn" onClick={onChangeName}>
          not you?
        </button>
      </span>
      {project.stage === 'review' && (
        <button
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={!ready}
          title={ready ? undefined : 'Review every page first (click “Done with this page” on each one)'}
        >
          Submit round {project.current_round}
          {ready ? (
            commentCount > 0 && <span className="btn-count">{commentCount}</span>
          ) : (
            <span className="btn-count">
              {reviewedCount}/{totalScreens} pages
            </span>
          )}
        </button>
      )}
    </header>
  );
}

function FocusCard({ project, note, compact }) {
  const focus = roundFocus(project.current_round, project.max_rounds);
  const [open, setOpen] = useState(!compact);
  return (
    <div className="focus-card">
      <button className="focus-head" onClick={() => setOpen((o) => !o)}>
        <span>
          🎯 <strong>Focus this round:</strong> {focus.title}
        </span>
        <span className="muted">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          <p className="muted small">{focus.why}</p>
          <ul className="tips">
            {focus.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {note && (
        <div className="agency-note">
          📝 <strong>Note from the team:</strong> {note}
        </div>
      )}
    </div>
  );
}

function screenStatus(data, screen, name) {
  const round = data.project.current_round;
  const reviewed = data.reviews.some((r) => r.screen_id === screen.id && r.round === round && r.reviewer_name === name);
  const count = data.comments.filter((c) => c.screen_id === screen.id && c.round === round).length;
  return { reviewed, count };
}

function Overview({ data, name, urls, openSubmit }) {
  const { project, screens } = data;
  const navigate = useNavigate();

  if (project.stage === 'approved') return <ApprovedView project={project} data={data} urls={urls} />;

  const statuses = screens.map((s) => ({ screen: s, ...screenStatus(data, s, name) }));
  const done = statuses.filter((s) => s.reviewed).length;
  const next = statuses.find((s) => !s.reviewed) ?? statuses[0];
  const reviewing = project.stage === 'review';

  return (
    <main className="client-main">
      {project.stage === 'revising' && <SubmittedBanner project={project} />}
      {project.stage === 'final' && (
        <div className="banner banner-purple">
          <div className="banner-emoji">✨</div>
          <div>
            <h2>Your final design is ready!</h2>
            <p>
              All your feedback from {plural(project.max_rounds, 'round')} has been worked in. Take a last look at each page,
              then click <strong>Approve design</strong> so development can begin.
            </p>
          </div>
        </div>
      )}
      {reviewing && (
        <section className="hello">
          <h1>
            Hi {name} 👋 Let’s review your {ordinal(project.current_round)} round
          </h1>
          {project.welcome_message && <p className="welcome">{project.welcome_message}</p>}
          <RoundTrack project={project} />
        </section>
      )}

      <div className="overview-grid">
        <section>
          <div className="section-head">
            <h2>{reviewing ? 'Pages to review' : 'Pages'}</h2>
            {reviewing && (
              <span className="muted small">
                {done} of {screens.length} reviewed
              </span>
            )}
          </div>
          {reviewing && (
            <div className="progress">
              <div style={{ width: `${screens.length ? (done / screens.length) * 100 : 0}%` }} />
            </div>
          )}
          {screens.length === 0 && <div className="empty-note">The team hasn’t added any pages yet. Check back soon!</div>}
          <ol className="checklist">
            {statuses.map(({ screen, reviewed, count }, i) => (
              <li key={screen.id}>
                <Link to={`p/${screen.id}`} className={`check-item ${reviewed ? 'reviewed' : ''}`}>
                  <span className="check-circle">{reviewed ? '✓' : i + 1}</span>
                  <span className="grow">
                    <strong>{screen.title}</strong>
                    {screen.note && <span className="muted small block">{screen.note}</span>}
                  </span>
                  {reviewing && count > 0 && <span className="badge badge-grey">{plural(count, 'comment')}</span>}
                  <span className="chev">→</span>
                </Link>
              </li>
            ))}
          </ol>
          {reviewing && screens.length > 0 && (
            <div className="row">
              {done < screens.length ? (
                <button className="btn btn-primary btn-lg" onClick={() => navigate(`p/${next.screen.id}`)}>
                  {done === 0 ? `Start with ${next.screen.title} →` : `Continue with ${next.screen.title} →`}
                </button>
              ) : (
                <button className="btn btn-primary btn-lg" onClick={openSubmit}>
                  All pages reviewed. Submit round {project.current_round} 🎉
                </button>
              )}
            </div>
          )}
        </section>
        <aside className="stack">
          {reviewing && <FocusCard project={project} />}
          {reviewing && <HowItWorks />}
        </aside>
      </div>

      <FeedbackLog data={data} urls={urls} />
    </main>
  );
}

function RoundTrack({ project }) {
  return (
    <div className="round-track">
      {Array.from({ length: project.max_rounds }, (_, i) => {
        const r = i + 1;
        const cls =
          r < project.current_round || (r === project.current_round && project.stage !== 'review')
            ? 'done'
            : r === project.current_round
              ? 'current'
              : '';
        return (
          <div key={r} className={`track-step ${cls}`}>
            <span>{cls === 'done' ? '✓' : r}</span>
            Round {r}
          </div>
        );
      })}
      <div className={`track-step ${project.stage === 'approved' ? 'done' : project.stage === 'final' ? 'current' : ''}`}>
        <span>★</span>
        Final approval
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="how-card">
      <strong>How to give feedback</strong>
      <ol>
        <li>Open a page from the list.</li>
        <li>
          <strong>Click anywhere</strong> on the design to drop a comment right there.
        </li>
        <li>
          Pick a reaction: {KINDS.love.emoji} {KINDS.like.emoji} {KINDS.great.emoji} for what you like, or{' '}
          {KINDS.change.emoji} to suggest a change. You can paste screenshots too.
        </li>
        <li>
          When you’re happy, hit <strong>Submit round</strong>.
        </li>
      </ol>
    </div>
  );
}

function SubmittedBanner({ project }) {
  const last = project.current_round >= project.max_rounds;
  return (
    <div className="banner banner-green">
      <div className="banner-emoji">{last ? '🏁' : '🎉'}</div>
      <div>
        {last ? (
          <>
            <h2>That’s a wrap. All {project.max_rounds} rounds are done!</h2>
            <p>
              Thank you so much for your feedback. We’re putting the finishing touches on the final design. You’ll get
              it right here, on this same link, to approve.
            </p>
          </>
        ) : (
          <>
            <h2>Round {project.current_round} submitted. Thank you!</h2>
            <p>
              We’re working on your feedback now. When round {project.current_round + 1} is ready, just open this same
              link again. Your earlier comments will be right there for reference.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Every round's feedback in one place, newest round first. */
function FeedbackLog({ data, urls }) {
  const { comments, screens, project } = data;
  const rounds = [...new Set(comments.map((c) => c.round))]
    .filter((r) => !(project.stage === 'review' && r === project.current_round))
    .sort((a, b) => b - a);
  const [openRound, setOpenRound] = useState(rounds[0]);
  if (!rounds.length) return null;

  return (
    <section className="log">
      <div className="section-head">
        <h2>📜 Feedback log</h2>
        <span className="muted small">Everything you’ve told us so far, round by round</span>
      </div>
      {rounds.map((r) => {
        const list = comments.filter((c) => c.round === r);
        const doneCount = list.filter((c) => c.status !== 'open').length;
        return (
          <div key={r} className="log-round">
            <button className="log-round-head" onClick={() => setOpenRound(openRound === r ? null : r)}>
              <strong>Round {r}</strong>
              <span className="muted small">
                {plural(list.length, 'comment')} · {doneCount} addressed
              </span>
              <span className="muted">{openRound === r ? '−' : '+'}</span>
            </button>
            {openRound === r &&
              screens.map((s) => {
                const items = list.filter((c) => c.screen_id === s.id);
                if (!items.length) return null;
                return (
                  <div key={s.id} className="log-screen">
                    <Link to={`p/${s.id}`} className="log-screen-title">
                      {s.title} →
                    </Link>
                    <div className="feedback-cards">
                      {items.map((c) => (
                        <CommentCard key={c.id} comment={c} urls={urls} mode="client" compact />
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </section>
  );
}

function ClientScreen({ data, name, call, urls, token, openSubmit }) {
  const { screenId } = useParams();
  const navigate = useNavigate();
  const { project, screens } = data;
  const index = screens.findIndex((s) => s.id === Number(screenId));
  const screen = screens[index];
  const hintKey = `review-hint:${token}:${project.current_round}`;
  const [showHint, setShowHint] = useState(() => !storage.get(hintKey));

  if (!screen) {
    return (
      <main className="client-main">
        <div className="empty-note">
          This page isn’t available. <Link to="..">Back to all pages</Link>
        </div>
      </main>
    );
  }

  const reviewing = project.stage === 'review';
  const { reviewed } = screenStatus(data, screen, name);
  // The next page still to review, looking forward first and then wrapping around.
  const nextScreen = [...screens.slice(index + 1), ...screens.slice(0, index)].find(
    (s) => !screenStatus(data, s, name).reviewed,
  );

  const dismissHint = () => {
    storage.set(hintKey, '1');
    setShowHint(false);
  };

  const markReviewed = async () => {
    await call('POST', `/screens/${screen.id}/reviewed`, { author_name: name, reviewed: true });
    if (nextScreen) navigate(`../p/${nextScreen.id}`);
    else openSubmit();
  };

  const createComment = async ({ screen: s, pdf_page, x, y, kind, body, images }) => {
    const fd = new FormData();
    Object.entries({ author_name: name, screen_id: s.id, pdf_page, x, y, kind, body }).forEach(([k, v]) =>
      fd.append(k, String(v)),
    );
    images.forEach((img, i) => fd.append('images', img, img.name || `screenshot-${i + 1}.png`));
    await call('POST', '/comments', fd);
    dismissHint();
  };

  return (
    <div className="viewer-page client">
      {showHint && reviewing && (
        <div className="coach-hint" onClick={dismissHint}>
          <span>
            👆 Click anywhere on the design to leave a comment. Start with what you <strong>love</strong>!
          </span>
          <button className="link-btn">Got it</button>
        </div>
      )}
      <ReviewViewer
        key={screen.id}
        project={project}
        screen={screen}
        version={screen.current_version}
        comments={data.comments}
        urls={urls}
        mode="client"
        me={name}
        canComment={reviewing}
        onCreate={createComment}
        onDelete={(c) => call('DELETE', `/comments/${c.id}`, { author_name: name })}
        toolbar={
          <>
            <Link to=".." className="btn btn-sm btn-ghost">
              ← All pages
            </Link>
            <strong className="toolbar-title">{screen.title}</strong>
            <span className="muted small">
              Page {index + 1} of {screens.length}
            </span>
          </>
        }
        sidebarTop={reviewing ? <FocusCard project={project} note={screen.note} compact={index > 0} /> : null}
        footer={
          reviewing ? (
            <div className="sidebar-footer">
              {reviewed ? (
                <>
                  <div className="reviewed-note">✓ You’ve marked this page as reviewed</div>
                  {nextScreen ? (
                    <Link className="btn btn-primary btn-block" to={`../p/${nextScreen.id}`}>
                      Next: {nextScreen.title} →
                    </Link>
                  ) : (
                    <button className="btn btn-primary btn-block" onClick={openSubmit}>
                      Submit round {project.current_round} 🎉
                    </button>
                  )}
                </>
              ) : (
                <button className="btn btn-primary btn-block" onClick={markReviewed}>
                  ✓ Done with this page{nextScreen ? `, next: ${nextScreen.title}` : ''}
                </button>
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}

function TourModal({ data, name, token }) {
  const { project, screens } = data;
  const key = `review-tour:${token}:${project.current_round}`;
  const [step, setStep] = useState(() => (storage.get(key) ? -1 : 0));
  const navigate = useNavigate();
  const focus = roundFocus(project.current_round, project.max_rounds);
  if (step < 0 || screens.length === 0) return null;

  const close = () => {
    storage.set(key, '1');
    setStep(-1);
  };
  const returning = project.current_round > 1;

  const steps = [
    <>
      <div className="big-emoji">{returning ? '🔁' : '👋'}</div>
      <h2>
        {returning ? `Welcome back, ${name}!` : `Welcome, ${name}!`}
      </h2>
      <p>
        {returning
          ? `We’ve updated the designs based on your feedback. This is round ${project.current_round} of ${project.max_rounds}. Your earlier comments are still here: hover the faint dots on the design to see what you said.`
          : `${project.agency_name} has designs ready for you to review. You have ${project.max_rounds} rounds of revisions, and this is round 1. We’ll guide you through it. It only takes a few minutes.`}
      </p>
      {project.welcome_message && !returning && <p className="welcome">{project.welcome_message}</p>}
    </>,
    <>
      <div className="big-emoji">📋</div>
      <h2>Here’s what to review</h2>
      <ol className="tour-list">
        {screens.map((s) => (
          <li key={s.id}>{s.title}</li>
        ))}
      </ol>
      <p className="muted">Go through them one at a time. We’ll take you to the next one when you’re done.</p>
    </>,
    <>
      <div className="big-emoji">💬</div>
      <h2>Giving feedback is easy</h2>
      <div className="tour-demo">
        <div className="preset positive">❤️ Love it</div>
        <div className="preset positive">👍 Like this</div>
        <div className="preset positive">🎉 This is great</div>
        <div className="preset change">✏️ Suggest a change</div>
      </div>
      <p>
        <strong>Click anywhere on the design</strong> and pick a reaction. Tell us what you love as well as what to change,
        because knowing what works matters just as much. Paste screenshots with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>{' '}
        if you want to show us an example.
      </p>
    </>,
    <>
      <div className="big-emoji">🎯</div>
      <h2>This round, focus on: {focus.title}</h2>
      <p className="muted">{focus.why}</p>
      <ul className="tips">
        {focus.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>,
  ];
  const last = step === steps.length - 1;

  return (
    <Modal onClose={close} className="tour">
      {steps[step]}
      <div className="tour-footer">
        <div className="dots">
          {steps.map((_, i) => (
            <span key={i} className={i === step ? 'active' : ''} />
          ))}
        </div>
        {step > 0 && (
          <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {last ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              close();
              navigate(`/r/${token}/p/${screens[0].id}`);
            }}
          >
            Start with {screens[0].title} →
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
      </div>
    </Modal>
  );
}

function SubmitModal({ data, name, call, reason, onClose, onSubmitted }) {
  const { project, screens, comments } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const round = project.current_round;
  const roundComments = comments.filter((c) => c.round === round);
  const positive = roundComments.filter((c) => KINDS[c.kind]?.tone === 'positive').length;
  const unreviewed = screens.filter((s) => !screenStatus(data, s, name).reviewed);
  const remaining = project.max_rounds - round;

  return (
    <Modal onClose={onClose}>
      <div className="big-emoji">{reason === 'idle' ? '⏰' : '📨'}</div>
      <h2>
        {reason === 'idle' ? `Ready to submit round ${round}?` : `Submit round ${round} of ${project.max_rounds}?`}
      </h2>
      {reason === 'idle' && (
        <p className="muted">
          You’ve been reviewing for a while. Would you like to send this batch of comments to the team now?
        </p>
      )}
      <div className="submit-summary">
        <div>
          <strong>{roundComments.length}</strong>
          <span>comments</span>
        </div>
        <div>
          <strong>{positive}</strong>
          <span>things you love</span>
        </div>
        <div>
          <strong>
            {screens.length - unreviewed.length}/{screens.length}
          </strong>
          <span>pages reviewed</span>
        </div>
      </div>
      {unreviewed.length > 0 && (
        <div className="warn-box">
          Please review every page before submitting. Still to go:{' '}
          {unreviewed.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <Link to={`/r/${project.share_token}/p/${s.id}`} onClick={onClose}>
                {s.title}
              </Link>
            </span>
          ))}
          . Open each one and click <strong>Done with this page</strong>.
        </div>
      )}
      <p className="muted small">
        Once submitted, this round is locked and the team starts working on it.{' '}
        {remaining > 0
          ? `You’ll have ${plural(remaining, 'more round')} after this.`
          : 'This is your last round of changes. After this, you’ll receive the final design to approve.'}
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="row-end">
        <button className="btn btn-ghost" onClick={onClose}>
          {reason === 'idle' ? 'Not yet, keep reviewing' : 'Keep reviewing'}
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || unreviewed.length > 0}
          onClick={async () => {
            setBusy(true);
            try {
              await call('POST', '/submit', { author_name: name });
              navigate(`/r/${data.project.share_token}`);
              onSubmitted();
            } catch (err) {
              setError(err.message);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Submitting…' : `Submit round ${round}`}
        </button>
      </div>
    </Modal>
  );
}

function ApproveBar({ data, name, call, onApproved }) {
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="approve-bar">
        <span>
          ✨ Final design. Happy with it? Approving lets the team start building.
        </span>
        <button className="btn btn-success btn-lg" onClick={() => setConfirming(true)}>
          ✓ Approve design
        </button>
      </div>
      {confirming && (
        <Modal onClose={() => setConfirming(false)}>
          <div className="big-emoji">✅</div>
          <h2>Approve the final design?</h2>
          <p className="muted">Once approved, development starts based on these designs.</p>
          <label className="check-row">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>
              I, <strong>{name}</strong>, have reviewed all {data.screens.length} pages and approve them for development.
            </span>
          </label>
          <div className="row-end">
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Not yet
            </button>
            <button
              className="btn btn-success"
              disabled={!checked || busy}
              onClick={async () => {
                setBusy(true);
                await call('POST', '/approve', { author_name: name });
                setConfirming(false);
                onApproved();
              }}
            >
              Approve &amp; start development 🚀
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ApprovedView({ project, data, urls }) {
  return (
    <main className="client-main">
      <div className="big-card celebrate-card">
        <div className="big-emoji">🚀</div>
        <h1>Development has started!</h1>
        <p>
          Thanks{project.approved_by ? `, ${project.approved_by}` : ''}! The design is approved and the team is now building
          your site.
        </p>
        {project.live_url ? (
          <a className="btn btn-primary btn-lg" href={project.live_url} target="_blank" rel="noreferrer">
            View your live site ↗
          </a>
        ) : (
          <p className="muted">The team will share the live site link right here as soon as it’s ready.</p>
        )}
        <RoundTrack project={project} />
      </div>
      <section>
        <div className="section-head">
          <h2>Approved designs</h2>
        </div>
        <ol className="checklist">
          {data.screens.map((s) => (
            <li key={s.id}>
              <Link to={`p/${s.id}`} className="check-item reviewed">
                <span className="check-circle">✓</span>
                <strong className="grow">{s.title}</strong>
                <span className="chev">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <FeedbackLog data={data} urls={urls} />
    </main>
  );
}

function Celebration({ kind, project, onClose }) {
  const lastRound = project.current_round >= project.max_rounds;
  const content =
    kind === 'approved'
      ? {
          emoji: '🚀',
          title: 'Woohoo, development has started!',
          text: project.live_url
            ? 'Your live site link is ready on this page.'
            : 'The team is on it. We’ll share your live site link right here as soon as it’s up.',
        }
      : lastRound
        ? {
            emoji: '🏁',
            title: 'All rounds done. Thank you!',
            text: `That was the ${ordinal(project.max_rounds)} and final round of revisions. We’ll prepare the final design and send it here for your approval.`,
          }
        : {
            emoji: '🎉',
            title: `Round ${project.current_round} submitted!`,
            text: `Thanks for the great feedback. We’ll get to work and let you know when round ${project.current_round + 1} is ready. It’ll be on this same link.`,
          };
  return (
    <Modal onClose={onClose} className="celebration">
      <div className="big-emoji bounce">{content.emoji}</div>
      <h2>{content.title}</h2>
      <p>{content.text}</p>
      <button className="btn btn-primary btn-lg" onClick={onClose}>
        Awesome!
      </button>
    </Modal>
  );
}
