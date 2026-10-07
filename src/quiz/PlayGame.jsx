// What players see on their phones: join with a PIN, answer, and watch their score climb.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { celebrate } from '../confetti.js';
import { AnswerInput, Reveal } from './answers.jsx';
import { Backdrop, CountUp, TimerBar, useCountdown, useLiveFeed } from './GameChrome.jsx';
import { AVATARS, REACTIONS, RESULT_COPY, TYPES, ordinal, pick, resultTone } from './meta.js';
import Scene from './Scenes.jsx';
import { QUIZ_ONLY } from '../appMode.js';
import './quiz.css';

const seatKey = (pin) => `qz-seat-${pin}`;
const loadSeat = (pin) => {
  try {
    return JSON.parse(localStorage.getItem(seatKey(pin)) ?? 'null');
  } catch {
    return null;
  }
};
const saveSeat = (pin, seat) => {
  try {
    localStorage.setItem(seatKey(pin), JSON.stringify(seat));
  } catch {
    /* private mode: the player just can't rejoin after a reload */
  }
};

export function JoinGame() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState(params.get('pin') ?? '');
  const [game, setGame] = useState(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const findGame = async (p = pin) => {
    setError('');
    setBusy(true);
    try {
      const g = await api('GET', `/api/live/${p.trim()}`);
      if (loadSeat(p.trim())) return navigate(`/play/${p.trim()}`);
      setGame({ ...g, pin: p.trim() });
    } catch (e) {
      setError(e.status === 404 ? 'We couldn’t find a game with that PIN.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (/^\d{6}$/.test(params.get('pin') ?? '')) findGame(params.get('pin'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const seat = await api('POST', `/api/live/${game.pin}/join`, { name, avatar });
      saveSeat(game.pin, { ...seat, name, avatar });
      navigate(`/play/${game.pin}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop theme={game?.theme ?? 'aurora'}>
      <div className="qz-center">
        <div className="qz-logo qz-pop">Quiz<span>Arena</span></div>
        {!game ? (
          <form
            className="qz-join qz-card-pop"
            onSubmit={(e) => {
              e.preventDefault();
              findGame();
            }}
          >
            <input
              className="qz-input-big"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Game PIN"
              value={pin}
              maxLength={6}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <button className="qz-btn qz-btn-go qz-btn-block" disabled={pin.length !== 6 || busy}>
              Enter
            </button>
            {error && <p className="qz-error">{error}</p>}
          </form>
        ) : (
          <form className="qz-join qz-card-pop" onSubmit={join}>
            <p className="qz-join-title">Joining <b>{game.title}</b></p>
            <div className="qz-avatar-pick" role="radiogroup" aria-label="Pick an avatar">
              {AVATARS.map((a) => (
                <button type="button" key={a} role="radio" aria-checked={a === avatar} className={a === avatar ? 'is-on' : ''} onClick={() => setAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
            <input className="qz-input-big" placeholder="Nickname" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="qz-btn qz-btn-go qz-btn-block" disabled={!name.trim() || busy}>
              Let’s go! {avatar}
            </button>
            {error && <p className="qz-error">{error}</p>}
          </form>
        )}
        {QUIZ_ONLY && (
          <Link to="/quizzes" className="qz-host-link">
            Hosting a quiz? Sign in →
          </Link>
        )}
      </div>
    </Backdrop>
  );
}

export function PlayGame() {
  const { pin } = useParams();
  const navigate = useNavigate();
  const seat = useMemo(() => loadSeat(pin), [pin]);
  const url = seat ? `/api/live/${pin}/stream?player=${encodeURIComponent(seat.player)}&key=${encodeURIComponent(seat.key)}` : null;
  const { view, gone } = useLiveFeed(url);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // answer sent but not yet confirmed by the feed

  useEffect(() => {
    if (!seat) navigate(`/play?pin=${pin}`, { replace: true });
  }, [seat, pin, navigate]);

  useEffect(() => setPending(null), [view?.index, view?.state]);

  useEffect(() => {
    if (view?.state === 'reveal' && view.result?.fraction === 1) celebrate();
    if (view?.state === 'podium' && view.me?.rank <= 3) setTimeout(celebrate, 3000);
    navigator.vibrate?.(view?.state === 'reveal' ? (view.result?.fraction === 1 ? [40, 30, 40] : 120) : 0);
  }, [view?.state, view?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!seat) return null;
  if (gone) {
    return (
      <Backdrop>
        <div className="qz-center qz-card-pop qz-panel">
          <h1>{gone === 'kicked' ? 'You were removed from the game' : 'This game has ended'}</h1>
          <p>Thanks for playing{seat.name ? `, ${seat.name}` : ''}!</p>
          <Link to="/play" className="qz-btn" onClick={() => localStorage.removeItem(seatKey(pin))}>Join another game</Link>
        </div>
      </Backdrop>
    );
  }
  if (!view) return <Backdrop><div className="qz-center qz-loading">Connecting…</div></Backdrop>;

  const submit = async (answer) => {
    setSending(true);
    setError('');
    setPending(answer);
    try {
      await api('POST', `/api/live/${pin}/answer`, { player: seat.player, key: seat.key, answer });
    } catch (e) {
      setError(e.message);
      setPending(null);
    } finally {
      setSending(false);
    }
  };
  const react = (emoji) => api('POST', `/api/live/${pin}/react`, { player: seat.player, key: seat.key, emoji }).catch(() => {});

  return (
    <Backdrop theme={view.theme} className="qz-player">
      <header className="qz-player-top">
        <span className="qz-me">{view.me.avatar} {view.me.name}</span>
        {view.index >= 0 && view.state !== 'podium' && <span className="qz-progress">{view.index + 1}/{view.total}</span>}
        <span className="qz-score"><CountUp value={view.me.score} /></span>
      </header>
      <main className="qz-player-main">
        {view.state === 'lobby' && (
          <div className="qz-center qz-card-pop qz-panel">
            <div className="qz-me-big">{view.me.avatar}</div>
            <h1>You’re in!</h1>
            <p>Look for your name on the big screen. The game starts soon.</p>
            <p className="qz-muted">{view.playerCount} player{view.playerCount === 1 ? '' : 's'} ready</p>
          </div>
        )}
        {view.state === 'get-ready' && <PlayerGetReady view={view} />}
        {view.state === 'question' && (
          view.answered || pending !== null ? (
            <Waiting answered />
          ) : (
            <PlayerQuestion key={view.index} view={view} onSubmit={submit} disabled={sending} />
          )
        )}
        {(view.state === 'reveal' || view.state === 'leaderboard') && <PlayerResult view={view} />}
        {view.state === 'podium' && <PlayerFinal view={view} />}
        {error && <p className="qz-error">{error}</p>}
      </main>
      {['lobby', 'reveal', 'leaderboard', 'podium'].includes(view.state) && (
        <div className="qz-react-bar" aria-label="Send a reaction to the big screen">
          {REACTIONS.map((r) => (
            <button key={r} onClick={() => react(r)}>{r}</button>
          ))}
        </div>
      )}
    </Backdrop>
  );
}

function PlayerGetReady({ view }) {
  const left = useCountdown(view.remainingMs, view.index);
  const q = view.question;
  return (
    <div className="qz-center qz-getready">
      <span className="qz-type-badge qz-pop">{TYPES[q.type].icon} {TYPES[q.type].label}</span>
      <h2 className="qz-prompt qz-rise">{q.prompt}</h2>
      <div className="qz-ready-count" key={Math.ceil(left / 1000)}>{Math.max(1, Math.ceil(left / 1000))}</div>
    </div>
  );
}

function PlayerQuestion({ view, onSubmit, disabled }) {
  const q = view.question;
  const left = useCountdown(view.remainingMs, `${view.index}-q`);
  return (
    <div className="qz-play">
      <TimerBar left={left} total={q.time * 1000} />
      <div className="qz-play-head">
        <h2 className="qz-prompt-sm">{q.prompt}</h2>
        <span className={`qz-secs ${left < 5000 ? 'is-urgent' : ''}`}>{Math.ceil(left / 1000)}</span>
      </div>
      {q.type !== 'hotspot' && <Scene visual={q.visual} className="qz-visual-sm" />}
      <AnswerInput question={q} onSubmit={onSubmit} disabled={disabled || left <= 0} />
    </div>
  );
}

export function Waiting({ answered }) {
  return (
    <div className="qz-center qz-panel qz-card-pop">
      <div className="qz-orbit" aria-hidden="true"><span /><span /><span /></div>
      <h2>{answered ? 'Locked in!' : 'Time’s up'}</h2>
      <p className="qz-muted">Waiting for everyone else…</p>
    </div>
  );
}

function PlayerResult({ view }) {
  const r = view.result ?? { fraction: 0, points: 0 };
  const tone = r.missed ? 'wrong' : resultTone(r.fraction);
  const headline = r.missed ? 'Out of time!' : pick(RESULT_COPY[tone], view.index + view.me.score);
  return (
    <div className="qz-result-wrap">
      <div className={`qz-result is-${tone}`}>
        <div className="qz-result-icon">{tone === 'correct' ? '✓' : tone === 'partial' ? '◐' : '✕'}</div>
        <h1>{headline}</h1>
        {tone === 'partial' && <p>{Math.round(r.fraction * 100)}% right</p>}
        <div className="qz-result-points">+{r.points.toLocaleString()}</div>
        {r.bonus > 0 && <div className="qz-result-streak">🔥 {view.me.streak} in a row · +{r.bonus} bonus</div>}
        <p className="qz-result-rank">
          You’re in <b>{ordinal(view.me.rank)}</b> place
          {view.ahead && <> · {view.ahead.gap.toLocaleString()} pts behind {view.ahead.name}</>}
        </p>
      </div>
      {view.state === 'reveal' && view.question && (
        <details className="qz-solution" open={tone !== 'correct'}>
          <summary>See the answer</summary>
          <Reveal question={view.question} answer={r.answer} />
          {view.question.explanation && <p className="qz-explain">💡 {view.question.explanation}</p>}
        </details>
      )}
    </div>
  );
}

function PlayerFinal({ view }) {
  const rank = view.me.rank;
  return (
    <div className="qz-center qz-panel qz-card-pop qz-final">
      <div className="qz-final-medal">{['🥇', '🥈', '🥉'][rank - 1] ?? '🎮'}</div>
      <h1>{rank <= 3 ? `${ordinal(rank)} place!` : `You finished ${ordinal(rank)}`}</h1>
      <p className="qz-final-score"><CountUp value={view.me.score} duration={1600} /> points</p>
      <ol className="qz-mini-podium">
        {view.podium.map((p, i) => (
          <li key={p.id}>{['🥇', '🥈', '🥉'][i]} {p.avatar} {p.name} <b>{p.score.toLocaleString()}</b></li>
        ))}
      </ol>
    </div>
  );
}
