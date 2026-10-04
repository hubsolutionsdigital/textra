// Solo practice from a shareable link: same questions and drag-and-drop, at your own pace.
// Answers are checked by the server, so the page never holds the solutions.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { celebrate } from '../confetti.js';
import { AnswerInput, Reveal } from './answers.jsx';
import { Backdrop, CountUp, TimerBar, useCountdown } from './GameChrome.jsx';
import { RESULT_COPY, TYPES, pick, resultTone } from './meta.js';
import Scene from './Scenes.jsx';
import './quiz.css';

export default function Practice() {
  const { token } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(-1);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);
  const [log, setLog] = useState([]);
  const [startedAt, setStartedAt] = useState(0);
  const [timed, setTimed] = useState(true);

  useEffect(() => {
    api('GET', `/api/practice/${token}`).then(setQuiz, (e) => setError(e.message));
  }, [token]);

  const q = quiz?.questions[index];
  const done = quiz && index >= quiz.questions.length;

  const check = async (answer) => {
    const r = await api('POST', `/api/practice/${token}/check`, { index, answer, elapsed: Date.now() - startedAt });
    setResult({ ...r, answer });
    setScore((s) => s + r.points);
    setLog((l) => [...l, r.fraction]);
    if (r.fraction === 1) celebrate();
  };
  const go = (i) => {
    setResult(null);
    setIndex(i);
    setStartedAt(Date.now());
  };
  useEffect(() => {
    if (done && log.filter((f) => f === 1).length / log.length >= 0.7) celebrate();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <Backdrop>
        <div className="qz-center qz-panel qz-card-pop"><h1>Hmm…</h1><p>{error}</p></div>
      </Backdrop>
    );
  }
  if (!quiz) return <Backdrop><div className="qz-center qz-loading">Loading…</div></Backdrop>;

  return (
    <Backdrop theme={quiz.theme} className="qz-player qz-practice">
      <header className="qz-player-top">
        <span className="qz-me">🎯 Practice</span>
        {index >= 0 && !done && <span className="qz-progress">{index + 1}/{quiz.questions.length}</span>}
        <span className="qz-score"><CountUp value={score} /></span>
      </header>
      <main className="qz-player-main">
        {index < 0 && (
          <div className="qz-center qz-panel qz-card-pop">
            <div className="qz-logo">Quiz<span>Arena</span></div>
            <h1>{quiz.title}</h1>
            {quiz.description && <p>{quiz.description}</p>}
            <p className="qz-muted">{quiz.questions.length} questions · {[...new Set(quiz.questions.map((x) => TYPES[x.type].icon))].join(' ')}</p>
            <label className="qz-toggle">
              <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Play against the clock
            </label>
            <button className="qz-btn qz-btn-go qz-btn-block" onClick={() => go(0)}>Start ▶</button>
          </div>
        )}
        {q && !result && <PracticeQuestion key={index} q={q} timed={timed} onSubmit={check} />}
        {q && result && (
          <div className="qz-result-wrap">
            <PracticeResult result={result} index={index} />
            <div className="qz-solution">
              <Reveal question={result.reveal} answer={result.answer} />
              {result.reveal.explanation && <p className="qz-explain">💡 {result.reveal.explanation}</p>}
            </div>
            <button className="qz-btn qz-btn-go qz-btn-block" onClick={() => go(index + 1)} autoFocus>
              {index + 1 < quiz.questions.length ? 'Next question →' : 'See my score 🏁'}
            </button>
          </div>
        )}
        {done && (
          <div className="qz-center qz-panel qz-card-pop qz-final">
            <div className="qz-final-medal">{stars(log)}</div>
            <h1>{log.filter((f) => f === 1).length} of {log.length} spot on</h1>
            <p className="qz-final-score"><CountUp value={score} duration={1600} /> points</p>
            <div className="qz-practice-log">
              {log.map((f, i) => <span key={i} className={`is-${resultTone(f)}`} title={`Question ${i + 1}`}>{i + 1}</span>)}
            </div>
            <button className="qz-btn qz-btn-go qz-btn-block" onClick={() => { setScore(0); setLog([]); go(0); }}>Play again ↻</button>
          </div>
        )}
      </main>
    </Backdrop>
  );
}

const stars = (log) => {
  const acc = log.reduce((s, f) => s + f, 0) / Math.max(1, log.length);
  return acc >= 0.9 ? '⭐⭐⭐' : acc >= 0.6 ? '⭐⭐' : acc >= 0.3 ? '⭐' : '🌱';
};

function PracticeQuestion({ q, timed, onSubmit }) {
  const [sending, setSending] = useState(false);
  const left = useCountdown(timed ? q.time * 1000 : 0, q.id);
  const expired = timed && left <= 0;
  useEffect(() => {
    if (expired && !sending) {
      setSending(true);
      onSubmit(null);
    }
  }, [expired]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="qz-play">
      {timed && <TimerBar left={left} total={q.time * 1000} />}
      <div className="qz-play-head">
        <h2 className="qz-prompt-sm">{q.prompt}</h2>
        {timed && <span className={`qz-secs ${left < 5000 ? 'is-urgent' : ''}`}>{Math.ceil(left / 1000)}</span>}
      </div>
      {q.type !== 'hotspot' && <Scene visual={q.visual} className="qz-visual-sm" />}
      <AnswerInput
        question={q}
        disabled={sending}
        onSubmit={async (a) => {
          setSending(true);
          try {
            await onSubmit(a);
          } catch {
            setSending(false);
          }
        }}
      />
    </div>
  );
}

function PracticeResult({ result, index }) {
  const tone = resultTone(result.fraction);
  return (
    <div className={`qz-result is-${tone}`}>
      <div className="qz-result-icon">{tone === 'correct' ? '✓' : tone === 'partial' ? '◐' : '✕'}</div>
      <h1>{result.answer === null ? 'Out of time!' : pick(RESULT_COPY[tone], index)}</h1>
      {tone === 'partial' && <p>{Math.round(result.fraction * 100)}% right</p>}
      <div className="qz-result-points">+{result.points.toLocaleString()}</div>
    </div>
  );
}
