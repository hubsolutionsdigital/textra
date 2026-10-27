import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrls } from '../api.js';
import ReviewViewer from '../components/ReviewViewer.jsx';
import { storage } from '../util.js';

/**
 * A comment-free preview of a project for prospects: they enter their name, then land on the home page and
 * move around through the design's own menus, like the real website. The link expires after a few days
 * (set by the agency, 5 at most).
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
  const first = data.screens[0];
  return (
    <div className="client-shell preview-shell">
      <Routes>
        <Route
          index
          element={
            first ? (
              <Navigate to={`p/${first.id}`} replace />
            ) : (
              <main className="client-main">
                <div className="empty-note">There’s nothing to preview yet.</div>
              </main>
            )
          }
        />
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
          {busy ? (
            <>
              <span className="spinner spinner-sm" /> Opening…
            </>
          ) : (
            'View the design →'
          )}
        </button>
      </form>
    </div>
  );
}

function PreviewScreen({ data, name, urls }) {
  const { screenId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, screens } = data;
  const index = screens.findIndex((s) => s.id === Number(screenId));
  const screen = screens[index];
  const loading = usePageLoading(screen);
  if (!screen) return <Navigate to=".." replace />;
  const isHtml = screen.current_version?.kind === 'html';
  // Interactive designs are navigated through their own menus; PDFs get simple previous/next arrows.
  const prev = !isHtml && screens[index - 1];
  const next = !isHtml && screens[index + 1];
  return (
    <div className="viewer-page client">
      {loading && (
        <div className="preview-loading" role="status" aria-live="polite">
          <div className="spinner" />
          <div>
            <strong>Loading {screen.title}…</strong>
            <div className="muted small">{project.agency_name ? `${project.agency_name} · ` : ''}{project.name}</div>
          </div>
        </div>
      )}
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
            <span className="preview-brand">
              <span className="muted small">{project.agency_name}</span>
              <strong>{project.name}</strong>
            </span>
            <span className="round-pill">Preview</span>
            {prev && (
              <Link to={`../p/${prev.id}`} className="btn btn-sm btn-ghost">
                ‹ {prev.title}
              </Link>
            )}
            {next && (
              <Link to={`../p/${next.id}`} className="btn btn-sm btn-ghost">
                {next.title} ›
              </Link>
            )}
          </>
        }
      />
    </div>
  );
}

/**
 * True while the current page is loading: until the prototype reports it's ready (HTML), or briefly for PDFs.
 * Starts again whenever the visitor moves to another page.
 */
function usePageLoading(screen) {
  const [loading, setLoading] = useState(true);
  const isHtml = screen?.current_version?.kind === 'html';
  useEffect(() => {
    if (!screen) return undefined;
    setLoading(true);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTimeout(() => setLoading(false), 350); // give images and fonts a moment to paint
    };
    const onMessage = (e) => e.data?.__portal && e.data.type === 'ready' && finish();
    window.addEventListener('message', onMessage);
    const fallback = setTimeout(finish, isHtml ? 15000 : 1200);
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(fallback);
    };
  }, [screen?.id, isHtml]); // eslint-disable-line react-hooks/exhaustive-deps
  return loading;
}
