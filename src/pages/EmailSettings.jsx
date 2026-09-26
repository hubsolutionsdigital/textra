import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import AppHeader from '../components/AppHeader.jsx';
import { formatDate } from '../util.js';

const PROVIDERS = [
  { id: 'zoho', name: 'Zoho Mail', emoji: '📮' },
  { id: 'gmail', name: 'Gmail / Google Workspace', emoji: '✉️' },
  { id: 'smtp', name: 'Other (SMTP)', emoji: '⚙️' },
];

const HELP = {
  zoho: (
    <ol>
      <li>
        Pick the <strong>data centre</strong> that matches where you log in: <em>mail.zoho.com</em> is United States,{' '}
        <em>mail.zoho.eu</em> is Europe, <em>mail.zoho.in</em> is India, and so on.
      </li>
      <li>
        Choose <strong>Business</strong> if your address is on your own domain (you@yourstudio.com), or{' '}
        <strong>Personal</strong> for an @zoho.com address.
      </li>
      <li>
        If two-factor authentication is on (recommended), create an app password in Zoho:{' '}
        <strong>
          accounts.zoho.com → Security → App Passwords → Generate New Password
        </strong>
        . Paste it below. Otherwise use your normal Zoho password.
      </li>
      <li>
        If the test fails on a business account, ask your Zoho admin to make sure SMTP access is allowed in the Zoho Mail
        admin console.
      </li>
    </ol>
  ),
  gmail: (
    <ol>
      <li>
        Turn on <strong>2-Step Verification</strong> for the Google account (myaccount.google.com → Security).
      </li>
      <li>
        Go to <strong>myaccount.google.com/apppasswords</strong>, create an app password (name it “Review portal”) and
        copy the 16-character code.
      </li>
      <li>Paste it below. Your normal Gmail password won’t work here.</li>
      <li>Works for @gmail.com and Google Workspace addresses (you@yourstudio.com on Google).</li>
    </ol>
  ),
  smtp: <p>Use the SMTP details from your email provider. Port 465 uses SSL; 587 uses STARTTLS.</p>,
};

export default function EmailSettings() {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api('GET', '/api/mail-settings').then((d) => {
      setLoaded(d);
      const s = d.settings;
      setForm({
        provider: s?.provider ?? 'zoho',
        region: s?.region ?? 'com',
        zoho_account: s?.zoho_account ?? 'business',
        host: s?.host ?? '',
        port: s?.port ?? 465,
        username: s?.username ?? user?.email ?? '',
        from_name: s?.from_name ?? user?.name ?? '',
        password: '',
      });
    }, (e) => setError(e.message));
  }, [user]);

  if (!form) return <div className="page-loading">{error || 'Loading…'}</div>;
  const saved = loaded.settings;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const d = await api('PUT', '/api/mail-settings', form);
      setLoaded({ ...loaded, settings: d.settings });
      setForm({ ...form, password: '' });
      setSuccess(`Connected! We sent a test email to ${d.test_sent_to}. Check your inbox.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader>
        <Link to="/projects">Projects</Link> / <span>Email settings</span>
      </AppHeader>
      <main className="container narrow">
        <h1>Email settings</h1>
        <p className="muted">
          Choose the mailbox that sends “client submitted a round” notifications. Emails go out from this address, and you
          can change it anytime.
        </p>

        {saved ? (
          <div className="next-step success">
            <div className="next-emoji">✅</div>
            <div>
              <strong>
                Sending from {saved.username} via {PROVIDERS.find((p) => p.id === saved.provider)?.name}
              </strong>
              <p className="muted">
                Server {saved.server}
                {saved.verified_at && ` · tested ${formatDate(saved.verified_at)}`}
              </p>
            </div>
          </div>
        ) : (
          <div className="next-step highlight">
            <div className="next-emoji">✉️</div>
            <div>
              <strong>No email account connected yet</strong>
              <p className="muted">
                {loaded.server_default
                  ? 'Notifications currently use the server’s default mail settings. Connect your own mailbox below to send from your address.'
                  : 'Notifications aren’t being sent. Connect Zoho Mail or Gmail below.'}
              </p>
            </div>
          </div>
        )}

        <form className="stack email-form" onSubmit={save}>
          <div className="provider-picker">
            {PROVIDERS.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`provider ${form.provider === p.id ? 'active' : ''}`}
                onClick={() => setForm({ ...form, provider: p.id, port: p.id === 'smtp' ? form.port : 465 })}
              >
                <span className="provider-emoji">{p.emoji}</span>
                {p.name}
              </button>
            ))}
          </div>

          <div className="help-box">{HELP[form.provider]}</div>

          {form.provider === 'zoho' && (
            <div className="grid-2">
              <label>
                Data centre
                <select value={form.region} onChange={set('region')}>
                  {loaded.zoho_regions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account type
                <select value={form.zoho_account} onChange={set('zoho_account')}>
                  <option value="business">Business (your own domain)</option>
                  <option value="personal">Personal (@zoho.com)</option>
                </select>
              </label>
            </div>
          )}

          {form.provider === 'smtp' && (
            <div className="grid-2">
              <label>
                SMTP server
                <input value={form.host} onChange={set('host')} placeholder="smtp.example.com" required />
              </label>
              <label>
                Port
                <select value={form.port} onChange={set('port')}>
                  <option value={465}>465 (SSL)</option>
                  <option value={587}>587 (STARTTLS)</option>
                </select>
              </label>
            </div>
          )}

          <label>
            Email address to send from
            <input type="email" value={form.username} onChange={set('username')} required />
          </label>
          <label>
            {form.provider === 'smtp' ? 'Password' : 'App password'}
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder={saved ? 'Leave blank to keep the saved password' : ''}
              required={!saved}
              autoComplete="new-password"
            />
          </label>
          <label>
            Sender name
            <input value={form.from_name} onChange={set('from_name')} placeholder="Pixel Studio" />
          </label>

          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
          <div className="row">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Connecting & sending test…' : saved ? 'Save & send test email' : 'Connect & send test email'}
            </button>
            <div className="grow" />
            {saved && (
              <button
                type="button"
                className="btn btn-ghost danger"
                onClick={async () => {
                  if (!window.confirm('Disconnect this mailbox? Notifications will stop being sent from it.')) return;
                  await api('DELETE', '/api/mail-settings');
                  setLoaded({ ...loaded, settings: null });
                  setSuccess('');
                }}
              >
                Disconnect
              </button>
            )}
          </div>
          <p className="muted small">
            We log in and send you a test email before saving, so you’ll know right away if something’s wrong. Your
            password is stored encrypted.
          </p>
        </form>
      </main>
    </>
  );
}
