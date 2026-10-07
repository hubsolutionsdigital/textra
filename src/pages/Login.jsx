import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { HOME, QUIZ_ONLY } from '../appMode.js';

export default function Login() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || HOME} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('POST', `/api/auth/${mode}`, form);
      setUser(d.user);
      navigate(location.state?.from || HOME, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">{QUIZ_ONLY ? '🎮 Quiz Arena' : '💬 Design Review Portal'}</div>
        <h1>{mode === 'login' ? 'Welcome back' : QUIZ_ONLY ? 'Create your host account' : 'Create your studio account'}</h1>
        <p className="muted">
          {QUIZ_ONLY
            ? 'Build live quizzes with drag-and-drop rounds and animated graphics. Only hosts need an account; players join with a PIN.'
            : 'Share UI/UX PDFs with clients, collect guided feedback and run revision rounds. Only your team needs an account, and clients just open the link.'}
        </p>
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <label>
              {QUIZ_ONLY ? 'Your name or team' : 'Agency / studio name'}
              <input value={form.name} onChange={set('name')} required autoFocus />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={set('email')} required autoFocus={mode === 'login'} />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={set('password')} required minLength={8} />
          </label>
          {error && (
            <div className="form-error">
              {error}
              {mode === 'login' && (
                <div className="small">
                  Forgot your password? Whoever runs the portal can reset it with{' '}
                  <code>npm run reset-password -- your@email.com</code>
                </div>
              )}
            </div>
          )}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button className="link-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
