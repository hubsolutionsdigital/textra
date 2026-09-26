import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import AppHeader from '../components/AppHeader.jsx';
import Modal from '../components/Modal.jsx';
import { stageInfo } from '../stage.js';
import { plural } from '../util.js';

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('GET', '/api/projects').then((d) => setProjects(d.projects), (e) => setError(e.message));
  }, []);

  return (
    <>
      <AppHeader />
      <main className="container">
        <div className="page-head">
          <div>
            <h1>Projects</h1>
            <p className="muted">Each project gets one link your client uses for every round of feedback.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New project
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        {projects && projects.length === 0 && (
          <div className="empty-state">
            <div className="empty-emoji">🎨</div>
            <h2>No projects yet</h2>
            <p className="muted">Create a project, upload your UI/UX PDFs and send the link to your client.</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              Create your first project
            </button>
          </div>
        )}
        <div className="project-grid">
          {projects?.map((p) => {
            const s = stageInfo(p);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
                <div className="project-card-top">
                  <h3>{p.name}</h3>
                  <span className={`badge badge-${s.tone}`}>{s.label}</span>
                </div>
                <div className="muted">{p.client_name || 'No client name'}</div>
                <div className="round-dots">
                  {Array.from({ length: p.max_rounds }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i + 1 < p.current_round || (i + 1 === p.current_round && p.stage !== 'review')
                          ? 'done'
                          : i + 1 === p.current_round
                            ? 'current'
                            : ''
                      }
                    />
                  ))}
                  <span className={p.stage === 'approved' ? 'done final' : 'final'}>✓</span>
                </div>
                <div className="project-card-meta">
                  <span>{plural(p.screen_count, 'page')}</span>
                  <span>{plural(p.open_comment_count, 'open comment')}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </>
  );
}

function NewProject({ onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '',
    client_name: '',
    max_rounds: 3,
    welcome_message: '',
    notify_emails: user?.email ?? '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      const d = await api('POST', '/api/projects', form);
      navigate(`/projects/${d.project.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>New project</h2>
      <form className="stack" onSubmit={submit}>
        <label>
          Project name
          <input value={form.name} onChange={set('name')} placeholder="e.g. Acme website redesign" required autoFocus />
        </label>
        <label>
          Client / company name
          <input value={form.client_name} onChange={set('client_name')} placeholder="e.g. Acme Co." />
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
            Separate addresses with commas. Each email has a link to the client’s comments where your team can mark
            them done.
          </span>
        </label>
        <label>
          Revision rounds included
          <input type="number" min={1} max={10} value={form.max_rounds} onChange={set('max_rounds')} />
        </label>
        <label>
          Welcome message for the client <span className="muted">(optional)</span>
          <textarea
            rows={3}
            value={form.welcome_message}
            onChange={set('welcome_message')}
            placeholder="Hi team! Here are the first designs for your new website…"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Create project</button>
        </div>
      </form>
    </Modal>
  );
}
