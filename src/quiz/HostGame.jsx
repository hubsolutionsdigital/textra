// The big screen the host presents: lobby with PIN and QR code, questions, reveals, leaderboard, podium.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { celebrate } from '../confetti.js';
import { AccuracyRing, HostQuestion, Reveal } from './answers.jsx';
import { Backdrop, Leaderboard, Podium, Reactions, TimerRing, useCountdown, useLiveFeed } from './GameChrome.jsx';
import { TYPES } from './meta.js';
import Scene from './Scenes.jsx';
import './quiz.css';

export default function HostGame() {
  const { pin } = useParams();
  const navigate = useNavigate();
  const { view, gone } = useLiveFeed(`/api/live/${pin}/stream?host=1`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (action, body) => {
    setBusy(true);
    setError('');
    try {
      await api('POST', `/api/live/${pin}/host/${action}`, body);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Space / → moves the game on, like a slide deck.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, button')) return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        act('next');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (view?.state === 'podium') {
      const t = setTimeout(celebrate, 3200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [view?.state]);

  if (gone || (!view && error)) {
    return (
      <Backdrop>
        <div className="qz-center qz-card-pop">
          <h1>Game over</h1>
          <p>This game has ended.</p>
          <Link to="/quizzes" className="qz-btn">Back to Quiz Arena</Link>
        </div>
      </Backdrop>
    );
  }
  if (!view) return <Backdrop><div className="qz-center qz-loading">Loading game…</div></Backdrop>;

  const next = {
    lobby: view.playerCount ? 'Start game ▶' : 'Waiting for players…',
    question: 'Skip timer ⏭',
    reveal: view.isLast ? 'Final results 🏆' : 'Leaderboard →',
    leaderboard: 'Next question →',
  }[view.state];

  return (
    <Backdrop theme={view.theme} className="qz-host">
      <header className="qz-host-top">
        <Link to="/quizzes" className="qz-chip-btn" title="Back to Quiz Arena">✕</Link>
        <div className="qz-host-title">
          <strong>{view.title}</strong>
          {view.index >= 0 && view.state !== 'podium' && <span>Question {view.index + 1} of {view.total}</span>}
        </div>
        <div className="qz-host-pin">PIN <b>{view.pin}</b></div>
        <span className="qz-host-count">👥 {view.playerCount}</span>
      </header>

      <main className="qz-host-main">
        {view.state === 'lobby' && <Lobby view={view} onKick={(id) => act('kick', { player: id })} />}
        {view.state === 'get-ready' && <GetReady view={view} />}
        {view.state === 'question' && <Asking view={view} />}
        {view.state === 'reveal' && <Revealed view={view} />}
        {view.state === 'leaderboard' && (
          <div className="qz-stage">
            <h1 className="qz-big-title">Leaderboard</h1>
            <Leaderboard key={view.index} rows={view.leaderboard} />
          </div>
        )}
        {view.state === 'podium' && (
          <div className="qz-stage">
            <h1 className="qz-big-title qz-pop">🏆 Champions</h1>
            <Podium top={view.leaderboard.slice(0, 3)} />
            {view.leaderboard.length > 3 && (
              <ol className="qz-rest" start={4}>
                {view.leaderboard.slice(3).map((p) => (
                  <li key={p.id}>{p.avatar} {p.name} <b>{p.score.toLocaleString()}</b></li>
                ))}
              </ol>
            )}
          </div>
        )}
      </main>

      <footer className="qz-host-bottom">
        {error && <span className="qz-error">{error}</span>}
        <span className="grow" />
        {view.state === 'podium' ? (
          <button
            className="qz-btn"
            onClick={async () => {
              await act('end');
              navigate('/quizzes');
            }}
          >
            Finish & close game
          </button>
        ) : (
          next && (
            <button className="qz-btn qz-btn-go" disabled={busy || (view.state === 'lobby' && !view.playerCount)} onClick={() => act('next')}>
              {next}
            </button>
          )
        )}
      </footer>
      <Reactions items={view.reactions} />
    </Backdrop>
  );
}

function Lobby({ view, onKick }) {
  const joinUrl = `${window.location.origin}/play?pin=${view.pin}`;
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: '#14102bff', light: '#ffffffff' } }).then(setQr, () => {});
  }, [joinUrl]);
  return (
    <div className="qz-lobby">
      <div className="qz-join-card qz-card-pop">
        <div>
          <p className="qz-join-label">Join at <b>{window.location.host}/play</b> with Game PIN:</p>
          <div className="qz-pin">
            {view.pin.split('').map((d, i) => (
              <span key={i} style={{ animationDelay: `${i * 90}ms` }}>{d}</span>
            ))}
          </div>
        </div>
        {qr && <img src={qr} alt={`QR code to join game ${view.pin}`} className="qz-qr" />}
      </div>
      <div className="qz-lobby-players">
        {view.players.length === 0 ? (
          <p className="qz-waiting">
            Waiting for players<span className="qz-dots"><i>.</i><i>.</i><i>.</i></span>
          </p>
        ) : (
          view.players.map((p, i) => (
            <button key={p.id} className="qz-bubble" style={{ '--i': i % 7 }} title="Click to remove" onClick={() => onKick(p.id)}>
              <span className="qz-bubble-avatar">{p.avatar}</span>
              {p.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function GetReady({ view }) {
  const left = useCountdown(view.remainingMs, view.index);
  const q = view.question;
  return (
    <div className="qz-stage qz-getready">
      <span className="qz-type-badge qz-pop">{TYPES[q.type].icon} {TYPES[q.type].label}{q.points === 2 && ' · ×2 points'}{q.points === 0 && ' · no points'}</span>
      <h1 className="qz-prompt qz-rise">{q.prompt}</h1>
      <div className="qz-ready-count" key={Math.ceil(left / 1000)}>{Math.max(1, Math.ceil(left / 1000))}</div>
      <div className="qz-ready-bar"><span style={{ animationDuration: `${view.remainingMs}ms` }} /></div>
    </div>
  );
}

function Asking({ view }) {
  const q = view.question;
  const left = useCountdown(view.remainingMs, `${view.index}-q`);
  const hasVisual = (q.visual?.scene && q.visual.scene !== 'none') || q.visual?.image;
  return (
    <div className="qz-stage">
      <h1 className="qz-prompt">{q.prompt}</h1>
      <div className="qz-asking">
        <TimerRing left={left} total={q.time * 1000} size="lg" />
        <div className="qz-asking-mid">
          {hasVisual && q.type !== 'hotspot' && <Scene visual={q.visual} className="qz-visual-lg" />}
          {q.type !== 'choice' && q.type !== 'truefalse' && (
            <p className="qz-hint">{TYPES[q.type].icon} {TYPES[q.type].hint} Answer on your device.</p>
          )}
        </div>
        <div className="qz-answers-in">
          <b key={view.answeredCount} className="qz-pop">{view.answeredCount}</b>
          <span>answers</span>
        </div>
      </div>
      <HostQuestion question={q} />
    </div>
  );
}

function Revealed({ view }) {
  const q = view.question;
  const s = view.stats;
  const showRing = !['choice', 'truefalse'].includes(q.type);
  return (
    <div className="qz-stage">
      <h1 className="qz-prompt">{q.prompt}</h1>
      <div className={`qz-reveal-wrap ${showRing ? 'has-ring' : ''}`}>
        <div className="qz-reveal-main">
          <Reveal question={q} stats={s} />
        </div>
        {showRing && <AccuracyRing stats={s} />}
      </div>
      {q.explanation && <p className="qz-explain qz-rise">💡 {q.explanation}</p>}
    </div>
  );
}
