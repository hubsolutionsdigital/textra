import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, fileUrls } from '../api.js';
import { FeedbackTab, RoundStepper } from './ProjectAdmin.jsx';
import { stageInfo } from '../stage.js';

/**
 * Opened from the "round submitted" email: the agency team reviews client comments and
 * marks them done without signing in. The link itself is the credential.
 */
export default function TeamReview() {
  const { teamToken } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const apiBase = `/api/team/${teamToken}`;

  const load = useCallback(() => api('GET', apiBase).then(setData, (e) => setError(e.message)), [apiBase]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <div className="page-loading">{error || 'Loading…'}</div>;
  const { project, screens, comments } = data;
  const s = stageInfo(project);
  const round = Number(params.get('round')) || project.current_round;

  return (
    <>
      <header className="app-header">
        <span className="brand">💬 Review Portal</span>
        <div className="header-crumbs">Team feedback · {project.name}</div>
      </header>
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
        <div className="next-step">
          <div className="next-emoji">✅</div>
          <div>
            <strong>Work through the client’s feedback</strong>
            <p className="muted">
              Mark each comment <strong>Done</strong> once it’s changed in the design, or <strong>Discussed</strong> if
              you’ve agreed not to change it. The client sees these updates on their review link, and replies show up
              for them too.
            </p>
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        <FeedbackTab
          project={project}
          screens={screens}
          comments={comments}
          urls={fileUrls({ teamToken })}
          initialRound={round}
          screenHref={(sc) => `/t/${teamToken}/screens/${sc.id}`}
          mutate={async (method, url, body) => {
            setError('');
            try {
              setData(await api(method, `${apiBase}${url}`, body));
            } catch (err) {
              setError(err.message);
              throw err;
            }
          }}
        />
      </main>
    </>
  );
}
