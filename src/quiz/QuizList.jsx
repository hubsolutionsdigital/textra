// Quiz Arena home for the agency: quizzes, templates, live games and past results.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import AppHeader from '../components/AppHeader.jsx';
import Modal from '../components/Modal.jsx';
import { timeAgo } from '../util.js';
import { SceneThumb } from './Scenes.jsx';
import './quiz.css';

const STARTERS = [
  { id: 'uiux', emoji: '🎨', title: 'UI/UX Design Showdown', text: 'Laws of UX, accessibility, Gestalt, layout. 10 questions using every drag-and-drop type.', scene: 'browser' },
  { id: 'seo', emoji: '🔎', title: 'SEO Speedrun', text: 'Core Web Vitals, SERP anatomy, technical and on-page SEO. 10 questions.', scene: 'serp' },
  { id: 'sales', emoji: '🤝', title: 'Sales Objection Dojo', text: 'Price, timing, authority, trust and competitor objections, with cartoon 3D characters. 10 questions.', scene: 'objprice' },
  { id: 'blank', emoji: '✨', title: 'Start from scratch', text: 'An empty quiz. Add your own questions and animated graphics.', scene: 'grid' },
];

export default function QuizList() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState(null);
  const [copied, setCopied] = useState(null);

  const load = () => api('GET', '/api/quizzes').then(setData, (e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const create = async (template) => {
    try {
      const { quiz } = await api('POST', '/api/quizzes', { template });
      navigate(`/quizzes/${quiz.id}`);
    } catch (e) {
      setError(e.message);
    }
  };
  const host = async (quiz) => {
    try {
      const { pin } = await api('POST', `/api/quizzes/${quiz.id}/live`);
      navigate(`/live/${pin}`);
    } catch (e) {
      setError(e.message);
    }
  };
  const copyPractice = async (quiz) => {
    await navigator.clipboard?.writeText(`${window.location.origin}/practice/${quiz.practice_token}`);
    setCopied(quiz.id);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <>
      <AppHeader>
        <span>🎮 Quiz Arena</span>
      </AppHeader>
      <main className="container">
        <div className="page-head">
          <div>
            <h1>Quiz Arena</h1>
            <p className="muted">
              Live, Kahoot-style quizzes with drag-and-drop rounds and animated graphics. Players join on their phones
              at <b>{window.location.host}/play</b>.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New quiz</button>
        </div>
        {error && <div className="form-error">{error}</div>}

        {data?.live.length > 0 && (
          <div className="qz-live-list">
            {data.live.map((g) => (
              <Link key={g.pin} to={`/live/${g.pin}`} className="qz-live-row">
                <span className="qz-live-dot" /> <b>{g.title}</b> is live · PIN {g.pin} · {g.players} players
                <span className="grow" />
                <span className="btn btn-sm btn-primary">Open big screen →</span>
              </Link>
            ))}
          </div>
        )}

        {data && data.quizzes.length === 0 && (
          <div className="qz-starters">
            <h2>Start with a ready-made quiz</h2>
            <div className="qz-starter-grid">
              {STARTERS.map((s) => (
                <button key={s.id} className="qz-starter" onClick={() => create(s.id)}>
                  <div className="qz-starter-art qz-theme-aurora"><SceneThumb scene={s.scene} /></div>
                  <strong>{s.emoji} {s.title}</strong>
                  <span className="muted small">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="qz-quiz-grid">
          {data?.quizzes.map((z) => (
            <div key={z.id} className="qz-quiz-card">
              <Link to={`/quizzes/${z.id}`} className={`qz-quiz-cover qz-theme-${z.theme}`}>
                <div className="qz-cover-scene"><SceneThumb scene={z.scenes[0] ?? 'grid'} /></div>
                <span className="qz-cover-count">{z.question_count} Qs</span>
              </Link>
              <div className="qz-quiz-body">
                <h3><Link to={`/quizzes/${z.id}`}>{z.title}</Link></h3>
                <p className="muted small">{z.description || 'No description'}</p>
                <p className="muted small">Edited {timeAgo(z.updated_at)} · played {z.plays}×</p>
                <div className="qz-quiz-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => host(z)}>▶ Host live</button>
                  <Link className="btn btn-sm" to={`/quizzes/${z.id}`}>Edit</Link>
                  <button className="btn btn-sm" onClick={() => copyPractice(z)}>{copied === z.id ? 'Copied ✓' : '🔗 Practice link'}</button>
                  {z.plays > 0 && (
                    <button className="btn btn-sm btn-ghost" onClick={async () => setResults({ quiz: z, ...(await api('GET', `/api/quizzes/${z.id}`)) })}>
                      🏆 Results
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {creating && (
        <Modal onClose={() => setCreating(false)} wide>
          <h2>New quiz</h2>
          <div className="qz-starter-grid">
            {STARTERS.map((s) => (
              <button key={s.id} className="qz-starter" onClick={() => create(s.id)}>
                <div className="qz-starter-art qz-theme-aurora"><SceneThumb scene={s.scene} /></div>
                <strong>{s.emoji} {s.title}</strong>
                <span className="muted small">{s.text}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {results && (
        <Modal onClose={() => setResults(null)}>
          <h2>🏆 {results.quiz.title}</h2>
          {results.games.map((g) => (
            <div key={g.id} className="qz-past-game">
              <p className="muted small">{timeAgo(g.played_at)} · PIN {g.pin} · {g.players.length} players</p>
              <ol>
                {g.players.slice(0, 10).map((p) => (
                  <li key={p.rank}>
                    {p.avatar} {p.name} <span className="muted">· {p.correct} correct</span> <b>{p.score.toLocaleString()}</b>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
