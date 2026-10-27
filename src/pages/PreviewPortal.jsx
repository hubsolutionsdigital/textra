import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrls } from '../api.js';
import ReviewViewer from '../components/ReviewViewer.jsx';
import { formatDate, storage } from '../util.js';

/**
 * A comment-free preview of a project for prospects: they enter their name, then browse the latest
 * version of every page. The link expires after a few days (set by the agency, 5 at most).
 */
export default function PreviewPortal() {
  const { previewToken } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const nameKey = `preview-name:${previewToken}`;
  const [name, setName] = useState(() => storage.get(nameKey) || '');

  const load = useCallback(
    () => api('GET', `/api/preview/${previewToken}`).then(setData, (e) => setError(e.message)),
    [previewToken],
  );
  useEffect(() => {
    load();
  }, [load]);

  // Returning visitors are logged once per browser session, so the agency sees repeat visits.
  useEffect(() => {
    if (!name || !data) return;
    const seen = `preview-logged:${previewToken}`;
    try {
      if (sessionStorage.getItem(seen)) return;
      sessionStorage.setItem(seen, '1');
    } catch {
      /* private mode: log every load */
    }
    api('POST', `/api/preview/${previewToken}/view`, { name }).catch(() => {});
  }, [name, data, previewToken]);

  if (error && !data) {
    return (
      <div className="client-shell center">
        <div className="big-card">
          <div className="big-emoji">⏳</div>
          <h1>This preview isn’t available</h1>
          <p className="muted">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="page-loading">Loading the preview…</div>;
  const { project } = data;

  if (!name) {
    return (
      <PreviewNameGate
        project={project}
        onSubmit={async (n) => {
          storage.set(nameKey, n);
          try {
            sessionStorage.setItem(`preview-logged:${previewToken}`, '1');
          } catch {
            /* ignore */
          }
          setData(await api('POST', `/api/preview/${previewToken}/view`, { name: n }));
          setName(n);
        }}
      />
    );
  }

  const ctx = { data, name, previewToken, urls: fileUrls({ previewToken }) };
  return (
    <div className="client-shell">
      <header className="client-header">
        <Link to="." className="client-title">
          <span className="muted small">{project.agency_name}</span>
          <strong>{project.name}</strong>
        </Link>
        <span className="round-pill">Preview</span>
        <div className="grow" />
        <span className="muted small hide-sm">
          Hi, {name} · available until {formatDate(data.expires_at)}
        </span>
      </header>
      <Routes>
        <Route index element={<PreviewOverview {...ctx} />} />
        <Route path="p/:screenId" element={<PreviewScreen {...ctx} />} />
      </Routes>
    </div>
  );
}

function PreviewNameGate({ project, onSubmit }) {
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
        <div className="muted">{project.agency_name} shared a design preview with you</div>
        <h1>{project.name}</h1>
        <p className="muted">No account needed. Just tell us your name to take a look.</p>
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
          View the design →
        </button>
      </form>
    </div>
  );
}

function PreviewOverview({ data, name }) {
  const { project, screens } = data;
  return (
    <main className="client-main">
      <section className="hello">
        <h1>Hi {name} 👋</h1>
        <p className="muted">
          Here’s a preview of {project.name}
          {project.agency_name ? ` by ${project.agency_name}` : ''}. Open any page to look around; on interactive pages
          you can try the menus, buttons and animations, and switch between desktop, tablet and mobile.
        </p>
      </section>
      {screens.length === 0 && <div className="empty-note">There’s nothing to preview yet.</div>}
      <ol className="checklist">
        {screens.map((s, i) => (
          <li key={s.id}>
            <Link to={`p/${s.id}`} className="check-item">
              <span className="check-circle">{i + 1}</span>
              <span className="grow">
                <strong>{s.title}</strong>
                {s.note && <span className="muted small block">{s.note}</span>}
              </span>
              <span className="chev">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}

function PreviewScreen({ data, name, urls }) {
  const { screenId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, screens } = data;
  const index = screens.findIndex((s) => s.id === Number(screenId));
  const screen = screens[index];
  if (!screen) {
    return (
      <main className="client-main">
        <div className="empty-note">
          This page isn’t available. <Link to="..">Back to all pages</Link>
        </div>
      </main>
    );
  }
  const prev = screens[index - 1];
  const next = screens[index + 1];
  return (
    <div className="viewer-page client">
      <ReviewViewer
        key={screen.id}
        project={project}
        screen={screen}
        screens={screens}
        view={location.state?.view}
        onOpenScreen={(target, view) => navigate(`../p/${target.id}`, { state: { view } })}
        version={screen.current_version}
        comments={[]}
        urls={urls}
        mode="client"
        me={name}
        canComment={false}
        previewOnly
        onCreate={() => {}}
        onDelete={() => {}}
        toolbar={
          <>
            <Link to=".." className="btn btn-sm btn-ghost">
              ← All pages
            </Link>
            <strong className="toolbar-title">{screen.title}</strong>
            <span className="muted small">
              Page {index + 1} of {screens.length}
            </span>
            {prev && (
              <Link to={`../p/${prev.id}`} className="btn btn-sm btn-ghost hide-sm">
                ‹ {prev.title}
              </Link>
            )}
            {next && (
              <Link to={`../p/${next.id}`} className="btn btn-sm btn-ghost hide-sm">
                {next.title} ›
              </Link>
            )}
          </>
        }
      />
    </div>
  );
}
