import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrls } from '../api.js';
import ReviewViewer from '../components/ReviewViewer.jsx';
import { versionLabel } from '../guidance.js';

export default function AgencyScreen() {
  // Reached either signed in (/projects/:projectId/…) or from a team email link (/t/:teamToken/…).
  const { projectId, teamToken, screenId } = useParams();
  const apiBase = teamToken ? `/api/team/${teamToken}` : `/api/projects/${projectId}`;
  const linkBase = teamToken ? `/t/${teamToken}` : `/projects/${projectId}`;
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [versionId, setVersionId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () => api('GET', apiBase).then(setData, (e) => setError(e.message)),
    [apiBase],
  );
  useEffect(() => {
    load();
    setVersionId(null);
  }, [load, screenId]);

  if (!data) return <div className="page-loading">{error || 'Loading…'}</div>;
  const { project, screens, comments } = data;
  const index = screens.findIndex((s) => s.id === Number(screenId));
  const screen = screens[index];
  if (!screen) return <div className="page-loading">Page not found.</div>;
  const version = screen.versions.find((v) => v.id === versionId) ?? screen.current_version;

  return (
    <div className="viewer-page">
      <ReviewViewer
        key={screen.id}
        project={project}
        screen={screen}
        version={version}
        comments={comments}
        urls={fileUrls({ projectId, teamToken })}
        mode="agency"
        canComment={false}
        onUpdate={async (c, patch) => setData(await api('PATCH', `${apiBase}/comments/${c.id}`, patch))}
        toolbar={
          <>
            <Link to={linkBase} className="btn btn-sm btn-ghost">
              ← {project.name}
            </Link>
            <select value={screen.id} onChange={(e) => navigate(`${linkBase}/screens/${e.target.value}`)}>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {screen.versions.length > 0 && (
              <select value={version?.id} onChange={(e) => setVersionId(Number(e.target.value))}>
                {screen.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionLabel(v, project.max_rounds)} · {v.original_name}
                  </option>
                ))}
              </select>
            )}
          </>
        }
      />
    </div>
  );
}
