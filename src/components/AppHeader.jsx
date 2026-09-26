import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function AppHeader({ children }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="app-header">
      <Link to="/projects" className="brand">
        💬 Review Portal
      </Link>
      <div className="header-crumbs">{children}</div>
      <div className="header-user">
        <Link to="/settings/email" className="btn btn-ghost btn-sm hide-sm">
          ✉️ Email settings
        </Link>
        <span className="muted">{user?.name}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await api('POST', '/api/auth/logout');
            setUser(null);
            navigate('/login');
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
