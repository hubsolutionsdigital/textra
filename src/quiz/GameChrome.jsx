// Pieces shared by the big screen, the player's phone and practice mode.

import { useEffect, useRef, useState } from 'react';
import { useFlip } from './dnd.js';
import { ordinal } from './meta.js';

/** Themed animated background: drifting colour blobs and floating answer shapes. */
export function Backdrop({ theme = 'aurora', children, className = '' }) {
  return (
    <div className={`qz-root qz-theme-${theme} ${className}`}>
      <div className="qz-backdrop" aria-hidden="true">
        <span className="qz-blob b1" />
        <span className="qz-blob b2" />
        <span className="qz-blob b3" />
        {['▲', '◆', '●', '■', '▲', '●', '■', '◆'].map((s, i) => (
          <span key={i} className={`qz-floater f${i}`}>{s}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Milliseconds left, ticking locally from the last server update (no clock sync needed). */
export function useCountdown(remainingMs, key) {
  const [left, setLeft] = useState(remainingMs ?? 0);
  useEffect(() => {
    if (!remainingMs) {
      setLeft(0);
      return undefined;
    }
    const end = performance.now() + remainingMs;
    let raf;
    const tick = () => {
      const l = Math.max(0, end - performance.now());
      setLeft(l);
      if (l > 0) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [remainingMs, key]);
  return left;
}

export function TimerRing({ left, total, size = 'md' }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const frac = total ? left / total : 0;
  const secs = Math.ceil(left / 1000);
  return (
    <div className={`qz-timer qz-timer-${size} ${secs <= 5 && left > 0 ? 'is-urgent' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="qz-timer-track" />
        <circle cx="50" cy="50" r={r} className="qz-timer-fill" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - frac) }} />
      </svg>
      <span key={secs} className="qz-timer-num">{secs}</span>
    </div>
  );
}

export function TimerBar({ left, total }) {
  return (
    <div className="qz-timerbar">
      <div className="qz-timerbar-fill" style={{ transform: `scaleX(${total ? left / total : 0})` }} />
    </div>
  );
}

/** Counts a number up when it changes. */
export function CountUp({ value, duration = 900 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString()}</>;
}

/** Top players; rows start at their previous rank and glide to the new one. */
export function Leaderboard({ rows }) {
  const [order, setOrder] = useState(() =>
    rows.slice().sort((a, b) => (a.prevRank || 999) - (b.prevRank || 999)),
  );
  const ref = useFlip(order.map((r) => r.id).join());
  // Live updates arrive often (reactions etc.); only re-sort when the standings actually change.
  const standings = rows.map((r) => `${r.id}:${r.score}`).join();
  const latest = useRef(rows);
  latest.current = rows;
  useEffect(() => {
    const t = setTimeout(() => setOrder(latest.current), 900);
    return () => clearTimeout(t);
  }, [standings]);
  const top = Math.max(1, rows[0]?.score ?? 1);
  return (
    <ol className="qz-board" ref={ref}>
      {order.map((p, i) => {
        const rank = rows.findIndex((r) => r.id === p.id) + 1;
        const moved = p.prevRank ? p.prevRank - rank : 0;
        return (
          <li key={p.id} data-flip={p.id} className="qz-board-row" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="qz-board-rank">{i + 1}</span>
            <span className="qz-board-avatar">{p.avatar}</span>
            <span className="qz-board-name">
              {p.name}
              {p.streak >= 2 && <span className="qz-streak">🔥{p.streak}</span>}
            </span>
            <span className="qz-board-bar" style={{ '--w': p.score / top }} />
            {p.gained > 0 && <span className="qz-gained">+{p.gained}</span>}
            {moved > 0 && <span className="qz-moved up">▲{moved}</span>}
            <span className="qz-board-score">
              <CountUp value={p.score} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Podium({ top, me }) {
  const spots = [top[1], top[0], top[2]];
  const heights = ['62%', '82%', '46%'];
  const places = [2, 1, 3];
  return (
    <div className="qz-podium">
      {spots.map((p, i) =>
        p ? (
          <div key={p.id} className={`qz-step qz-step-${places[i]} ${me === p.id ? 'is-me' : ''}`} style={{ '--h': heights[i], animationDelay: `${[1.2, 2.4, 0.2][i]}s` }}>
            <div className="qz-step-who">
              <span className="qz-step-avatar">{p.avatar}</span>
              <strong>{p.name}</strong>
              <span>{p.score.toLocaleString()} pts</span>
            </div>
            <div className="qz-step-block">
              <span className="qz-medal">{['🥈', '🥇', '🥉'][i]}</span>
              <span className="qz-step-place">{ordinal(places[i])}</span>
            </div>
          </div>
        ) : (
          <div key={i} className="qz-step qz-step-empty" />
        ),
      )}
    </div>
  );
}

const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Emoji reactions floating up the big screen. */
export function Reactions({ items = [] }) {
  return (
    <div className="qz-reactions" aria-hidden="true">
      {items.map((r) => (
        <span key={r.id} className="qz-reaction" style={{ left: `${(hash(r.id) % 80) + 10}%` }}>
          {r.emoji}
          <small>{r.avatar}</small>
        </span>
      ))}
    </div>
  );
}

/**
 * Follows a live game over Server-Sent Events. Returns the latest view plus `gone` once the game
 * has ended or this player was removed.
 */
export function useLiveFeed(url) {
  const [view, setView] = useState(null);
  const [gone, setGone] = useState(null);
  useEffect(() => {
    if (!url) return undefined;
    const es = new EventSource(url);
    es.onmessage = (e) => setView(JSON.parse(e.data));
    es.addEventListener('ended', () => {
      setGone('ended');
      es.close();
    });
    es.addEventListener('kicked', () => {
      setGone('kicked');
      es.close();
    });
    es.onerror = () => {
      // The server answers 4xx once the game is over; EventSource then gives up for good.
      if (es.readyState === EventSource.CLOSED) setGone((g) => g ?? 'lost');
    };
    return () => es.close();
  }, [url]);
  return { view, gone };
}
