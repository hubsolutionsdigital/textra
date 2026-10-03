import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrls } from '../api.js';
import AppHeader from '../components/AppHeader.jsx';
import CommentCard from '../components/CommentCard.jsx';
import { isActionable, versionLabel } from '../guidance.js';
import { shareUrl, stageInfo } from '../stage.js';
import { formatDate, plural } from '../util.js';

export default function ProjectAdmin() {
  const { projectId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('pages');

  const load = useCallback(
    () => api('GET', `/api/projects/${projectId}`).then(setData, (e) => setError(e.message)),
    [projectId],
  );
  useEffect(() => {
    load();
  }, [load]);

  /** Runs a mutating request that returns the fresh project bundle. */
  const [uploadWarnings, setUploadWarnings] = useState([]);

  const mutate = async (method, url, body) => {
    setError('');
    try {
      const { upload_warning: warning, ...bundle } = await api(method, `/api/projects/${projectId}${url}`, body);
      setData(bundle);
      if (method === 'POST' && url.endsWith('/versions')) {
        // A replacement upload supersedes earlier warnings (e.g. the zip that fixes a lone index.html).
        setUploadWarnings(warning ? [warning] : []);
      } else if (warning) {
        setUploadWarnings((cur) => [...cur.filter((w) => w.file !== warning.file), warning]);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  if (!data) return <div className="page-loading">{error || 'Loading…'}</div>;
  const { project, screens, comments, events } = data;
  const s = stageInfo(project);
  const urls = fileUrls({ projectId });

  return (
    <>
      <AppHeader>
        <Link to="/projects">Projects</Link> / <span>{project.name}</span>
      </AppHeader>
      <main className="container">
        <div className="page-head">
          <div>
            <h1>{project.name}</h1>
            <div className="muted">
              {project.client_name || 'Client'} · <span className={`badge badge-${s.tone}`}>{s.label}</span>
            </div>
          </div>
        </div>

        <RoundStepper project={project} />
        <ShareBox project={project} />
        <NextStep project={project} screens={screens} comments={comments} mutate={mutate} />
        {error && <div className="form-error">{error}</div>}

        <div className="tabs tabs-lg">
          {[
            ['pages', `Pages (${screens.length})`],
            ['feedback', `Feedback (${comments.length})`],
            ['activity', 'Activity log'],
            ['settings', 'Settings'],
          ].map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'pages' && uploadWarnings.length > 0 && (
          <MissingFilesWarning warnings={uploadWarnings} onDismiss={() => setUploadWarnings([])} />
        )}
        {tab === 'pages' && <PagesTab project={project} screens={screens} comments={comments} mutate={mutate} />}
        {tab === 'feedback' && (
          <FeedbackTab
            project={project}
            screens={screens}
            comments={comments}
            urls={urls}
            mutate={mutate}
            screenHref={(s) => `/projects/${project.id}/screens/${s.id}`}
          />
        )}
        {tab === 'activity' && <ActivityTab events={events} />}
        {tab === 'settings' && <SettingsTab project={project} mutate={mutate} />}
      </main>
    </>
  );
}

export function RoundStepper({ project }) {
  const steps = [
    ...Array.from({ length: project.max_rounds }, (_, i) => ({ key: i + 1, label: `Round ${i + 1}` })),
    { key: 'final', label: 'Final approval' },
    { key: 'approved', label: 'Development' },
  ];
  const state = (step) => {
    const { stage, current_round: r } = project;
    if (step.key === 'approved') return stage === 'approved' ? 'current' : '';
    if (step.key === 'final') return stage === 'approved' ? 'done' : stage === 'final' ? 'current' : '';
    if (['final', 'approved'].includes(stage) || step.key < r) return 'done';
    if (step.key === r) return stage === 'review' ? 'current' : 'done';
    return '';
  };
  return (
    <ol className="stepper">
      {steps.map((st) => (
        <li key={st.key} className={state(st)}>
          <span className="step-dot" />
          {st.label}
        </li>
      ))}
    </ol>
  );
}

function ShareBox({ project }) {
  const url = shareUrl(project);
  const [copied, setCopied] = useState(false);
  return (
    <div className="share-box">
      <div>
        <strong>Client review link</strong>
        <div className="muted small">
          The same link works for every round. Clients just enter their name, no account needed.
        </div>
      </div>
      <div className="share-row">
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">
          Open as client ↗
        </a>
      </div>
    </div>
  );
}

function NextStep({ project, screens, comments, mutate }) {
  const r = project.current_round;
  const roundComments = comments.filter((c) => c.round === r);
  const open = roundComments.filter((c) => c.status === 'open' && isActionable(c)).length;
  const lastRound = r >= project.max_rounds;
  const updatedForNext = screens.filter((s) => s.current_version && s.current_version.round > r).length;
  const confirmAndAdvance = (action, message) => window.confirm(message) && mutate('POST', '/advance', { action });

  if (screens.length === 0) {
    return (
      <div className="next-step">
        <div className="next-emoji">📤</div>
        <div>
          <strong>Start by uploading your designs</strong>
          <p className="muted">Add one PDF per page (Home, About, Contact…). Your client will review them one by one.</p>
        </div>
      </div>
    );
  }

  switch (project.stage) {
    case 'review':
      return (
        <div className="next-step">
          <div className="next-emoji">👀</div>
          <div>
            <strong>Waiting for the client to review round {r}</strong>
            <p className="muted">
              {plural(roundComments.length, 'comment')} so far. You’ll see them live; the round locks once they submit.
              {project.notify_emails
                ? ` We’ll email ${project.notify_emails} when they do.`
                : ' Add notification emails in Settings to get an email when they do.'}
            </p>
          </div>
        </div>
      );
    case 'revising':
      return (
        <div className="next-step highlight">
          <div className="next-emoji">🛠️</div>
          <div className="grow">
            <strong>
              Round {r} submitted with {plural(roundComments.length, 'comment')}
              {open > 0 && ` · ${open} still open`}
            </strong>
            <p className="muted">
              Work through the feedback, mark comments done and upload updated PDFs ({updatedForNext}/{screens.length}{' '}
              pages updated).{' '}
              {lastRound
                ? 'This was the last revision round, so upload the final designs and send them for approval.'
                : `Then open round ${r + 1} and the client can review again using the same link.`}
            </p>
            <div className="row">
              {lastRound ? (
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    confirmAndAdvance('send_final', 'Send the final designs to the client for approval?')
                  }
                >
                  Send final for approval →
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      confirmAndAdvance(
                        'next_round',
                        `Open round ${r + 1}? The client will see the latest uploaded versions.`,
                      )
                    }
                  >
                    Open round {r + 1} →
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      confirmAndAdvance(
                        'send_final',
                        'Skip remaining rounds and send the final designs for approval?',
                      )
                    }
                  >
                    Skip to final approval
                  </button>
                </>
              )}
              <button
                className="btn btn-ghost"
                onClick={() =>
                  confirmAndAdvance('reopen', `Reopen round ${r} so the client can add more comments?`)
                }
              >
                Reopen round {r}
              </button>
            </div>
          </div>
        </div>
      );
    case 'final':
      return (
        <div className="next-step">
          <div className="next-emoji">⏳</div>
          <div>
            <strong>Final design sent, waiting for the client to approve</strong>
            <p className="muted">Once they approve, you’ll see it here and development can start.</p>
          </div>
        </div>
      );
    case 'approved':
      return (
        <div className="next-step success">
          <div className="next-emoji">🚀</div>
          <div className="grow">
            <strong>
              Approved by {project.approved_by} on {formatDate(project.approved_at)}. Development can start!
            </strong>
            <p className="muted">
              {project.live_url
                ? `The client can see the live site: ${project.live_url}`
                : 'When the site is live, add the URL in Settings and it will show on the client’s page.'}
            </p>
          </div>
        </div>
      );
    default:
      return null;
  }
}

/** Shown after uploading an HTML page whose images, fonts or scripts weren't included in the upload. */
function MissingFilesWarning({ warnings, onDismiss }) {
  return (
    <div className="missing-files" role="alert">
      <div className="row">
        <strong className="grow">⚠️ Some files your design needs weren’t uploaded</strong>
        <button className="link-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {warnings.map((w) => (
        <div key={w.file} className="small">
          <strong>{w.file}</strong>{' '}
          {w.total > 0 && (
            <>
              refers to {w.total} file{w.total === 1 ? '' : 's'} that aren’t in the upload:{' '}
              <span className="missing-list">
                {w.files.slice(0, 8).join(', ')}
                {w.total > 8 && `, and ${w.total - 8} more`}
              </span>
              .{' '}
            </>
          )}
          {w.computerPaths.length > 0 && (
            <>
              It also links to files on your computer (<code>{w.computerPaths[0]}</code>), which won’t work online.{' '}
            </>
          )}
        </div>
      ))}
      <p className="small">
        <strong>To fix it:</strong> in Finder, right-click the folder that holds the HTML file and its images, choose{' '}
        <strong>Compress</strong>, then use <strong>Upload new version</strong> on that page and pick the{' '}
        <strong>.zip</strong>. On Windows, right-click the folder and choose <strong>Send to → Compressed (zipped)
        folder</strong>.
      </p>
    </div>
  );
}

const ACCEPTED = /\.(pdf|html?|zip)$/i;
const ACCEPT_ATTR = 'application/pdf,.pdf,text/html,.html,.htm,application/zip,.zip';

function uploadTarget(project) {
  if (project.stage === 'review') return `round ${project.current_round}`;
  if (project.stage === 'revising') {
    return project.current_round >= project.max_rounds ? 'the final version' : `round ${project.current_round + 1}`;
  }
  return 'the final version';
}

function PagesTab({ project, screens, comments, mutate }) {
  const [busy, setBusy] = useState(false);
  const locked = project.stage === 'approved';

  const addFiles = async (files) => {
    setBusy(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        const title = file.name.replace(/\.(pdf|html?|zip)$/i, '').replace(/[-_]+/g, ' ').trim();
        fd.append('title', title.charAt(0).toUpperCase() + title.slice(1));
        fd.append('file', file);
        await mutate('POST', '/screens', fd);
      }
    } finally {
      setBusy(false);
    }
  };

  const move = (index, dir) => {
    const order = screens.map((s) => s.id);
    const [id] = order.splice(index, 1);
    order.splice(index + dir, 0, id);
    mutate('POST', '/reorder', { order });
  };

  return (
    <div className="stack">
      {!locked && (
        <label
          className={`dropzone ${busy ? 'busy' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles([...e.dataTransfer.files].filter((f) => ACCEPTED.test(f.name)));
          }}
        >
          <input
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            hidden
            onChange={(e) => {
              addFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
          <div className="dropzone-emoji">📄</div>
          <strong>{busy ? 'Uploading…' : 'Drop designs here or click to add pages'}</strong>
          <span className="muted small">
            One file per page: a <strong>PDF</strong>, an <strong>.html</strong> file, or a <strong>.zip</strong> of an
            HTML prototype (with its CSS, JS, images and fonts, for animations and scroll effects). Rename pages after.
          </span>
        </label>
      )}
      {screens.length > 0 && project.stage !== 'approved' && (
        <div className="muted small">New uploads will be shown to the client as {uploadTarget(project)}.</div>
      )}
      {screens.map((s, i) => (
        <ScreenRow
          key={s.id}
          project={project}
          screen={s}
          comments={comments.filter((c) => c.screen_id === s.id)}
          mutate={mutate}
          onMove={(dir) => move(i, dir)}
          first={i === 0}
          last={i === screens.length - 1}
        />
      ))}
    </div>
  );
}

function ScreenRow({ project, screen, comments, mutate, onMove, first, last }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(screen.title);
  const [note, setNote] = useState(screen.note);
  const open = comments.filter((c) => c.status === 'open' && isActionable(c)).length;
  const locked = project.stage === 'approved';
  const needsUpdate =
    project.stage === 'revising' && (!screen.current_version || screen.current_version.round <= project.current_round);

  const upload = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    mutate('POST', `/screens/${screen.id}/versions`, fd);
  };

  return (
    <div className="screen-row">
      <div className="reorder">
        <button className="icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
          ▲
        </button>
        <button className="icon-btn" disabled={last} onClick={() => onMove(1)} aria-label="Move down">
          ▼
        </button>
      </div>
      <div className="grow">
        {editing ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              mutate('PATCH', `/screens/${screen.id}`, { title, note }).then(() => setEditing(false));
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the client, e.g. “Focus on the order of sections below the hero”"
            />
            <div className="row">
              <button className="btn btn-sm btn-primary">Save</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="row">
              <Link to={`/projects/${project.id}/screens/${screen.id}`} className="screen-title">
                {screen.title}
              </Link>
              <span className="badge badge-grey">{versionLabel(screen.current_version, project.max_rounds)}</span>
              {screen.current_version?.kind === 'html' && <span className="badge badge-blue">HTML</span>}
              {needsUpdate && <span className="badge badge-amber">Needs updated design</span>}
            </div>
            {screen.note && <div className="muted small">📝 {screen.note}</div>}
            <div className="muted small">
              {plural(comments.length, 'comment')} · {open} open · {plural(screen.versions.length, 'version')}
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="row">
          <Link className="btn btn-sm" to={`/projects/${project.id}/screens/${screen.id}`}>
            View feedback
          </Link>
          {!locked && (
            <label className="btn btn-sm btn-ghost">
              Upload new version
              <input
                type="file"
                accept={ACCEPT_ATTR}
                hidden
                onChange={(e) => {
                  if (e.target.files[0]) upload(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
          {!locked && (
            <button
              className="btn btn-sm btn-ghost danger"
              onClick={() =>
                window.confirm(`Delete “${screen.title}” and all its comments?`) &&
                mutate('DELETE', `/screens/${screen.id}`)
              }
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Comments grouped by page with done/reply controls. Shared by the dashboard and the team link page. */
export function FeedbackTab({ project, screens, comments, urls, mutate, screenHref, initialRound }) {
  const [round, setRound] = useState(initialRound ?? project.current_round);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const rounds = [...new Set(comments.map((c) => c.round))].sort((a, b) => b - a);
  const shown = comments.filter(
    (c) => (round === 'all' || c.round === round) && (!onlyOpen || (c.status === 'open' && isActionable(c))),
  );
  const inScope = comments.filter((c) => (round === 'all' || c.round === round) && isActionable(c));
  const handled = inScope.filter((c) => c.status !== 'open').length;

  return (
    <div className="stack">
      {inScope.length > 0 && (
        <div className="done-progress">
          <div className="row">
            <strong>
              {handled} of {inScope.length} change requests handled
            </strong>
            {handled === inScope.length && <span className="badge badge-green">All done 🎉</span>}
          </div>
          <div className="progress">
            <div style={{ width: `${(handled / inScope.length) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="row">
        <select value={round} onChange={(e) => setRound(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">All rounds</option>
          {[...new Set([project.current_round, ...rounds])].map((r) => (
            <option key={r} value={r}>
              Round {r}
            </option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          <span>Only open</span>
        </label>
      </div>
      {shown.length === 0 && <div className="empty-note">No feedback here yet.</div>}
      {screens.map((s) => {
        const list = shown.filter((c) => c.screen_id === s.id);
        if (!list.length) return null;
        return (
          <section key={s.id} className="feedback-group">
            <div className="row">
              <h3>{s.title}</h3>
              <Link className="link-btn" to={screenHref(s)}>
                Open on design →
              </Link>
            </div>
            <div className="feedback-cards">
              {list.map((c) => (
                <CommentCard
                  key={c.id}
                  comment={c}
                  urls={urls}
                  mode="agency"
                  onUpdate={(cm, patch) => mutate('PATCH', `/comments/${cm.id}`, patch)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ActivityTab({ events }) {
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id} className={`event-${e.type}`}>
          <span className="round-chip">R{e.round}</span>
          <span className="grow">{e.message}</span>
          <span className="muted small">{formatDate(e.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

function TeamLink({ project }) {
  const url = `${window.location.origin}/t/${project.team_token}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack-sm">
      <span className="field-label">Team feedback link</span>
      <div className="share-row">
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <span className="muted small">
        Included in every notification email. Anyone with it can view comments and mark them done, so keep it inside
        your team.
      </span>
    </div>
  );
}

function SettingsTab({ project, mutate }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: project.name,
    client_name: project.client_name,
    welcome_message: project.welcome_message,
    live_url: project.live_url,
    max_rounds: project.max_rounds,
    notify_emails: project.notify_emails,
  });
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="stack settings"
      onSubmit={async (e) => {
        e.preventDefault();
        await mutate('PATCH', '', form);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }}
    >
      <label>
        Project name
        <input value={form.name} onChange={set('name')} required />
      </label>
      <label>
        Client / company name
        <input value={form.client_name} onChange={set('client_name')} />
      </label>
      <label>
        Revision rounds included
        <input type="number" min={project.current_round} max={10} value={form.max_rounds} onChange={set('max_rounds')} />
      </label>
      <label>
        Welcome message shown to the client
        <textarea rows={3} value={form.welcome_message} onChange={set('welcome_message')} />
      </label>
      <label>
        Notify these emails when the client submits a round
        <input
          value={form.notify_emails}
          onChange={set('notify_emails')}
          placeholder="pm@studio.com, designer@studio.com"
          required
        />
        <span className="muted small">
          Separate addresses with commas. Each email has a link where the team can mark comments done, with no
          sign-in needed.
        </span>
      </label>
      <TeamLink project={project} />
      <label>
        Live site URL <span className="muted">(shown to the client after approval)</span>
        <input value={form.live_url} onChange={set('live_url')} placeholder="https://staging.client-site.com" />
      </label>
      <div className="row">
        <button className="btn btn-primary">{saved ? 'Saved ✓' : 'Save settings'}</button>
        <div className="grow" />
        <button
          type="button"
          className="btn btn-ghost danger"
          onClick={async () => {
            if (!window.confirm('Delete this project, its files and all feedback? This cannot be undone.')) return;
            await api('DELETE', `/api/projects/${project.id}`);
            navigate('/projects');
          }}
        >
          Delete project
        </button>
      </div>
    </form>
  );
}
