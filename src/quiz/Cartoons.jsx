// Cartoon "3D" scenes for sales questions: glossy clay-style characters with expressions, and
// chunky props (price tag, alarm clock, shield, trophy…). The 3D look comes from gradients for
// light, a darker copy offset underneath for depth, highlights and soft floor shadows.
// Animations are CSS (the .s3-* classes in quiz.css).

import { useId } from 'react';

const W = 320;
const H = 200;

/** Shared gradients, namespaced per drawing so several scenes can share a page. */
function Defs({ u }) {
  const lin = (id, a, b) => (
    <linearGradient id={`${u}-${id}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );
  const rad = (id, a, b, c) => (
    <radialGradient id={`${u}-${id}`} cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stopColor={a} />
      <stop offset="0.55" stopColor={b} />
      <stop offset="1" stopColor={c} />
    </radialGradient>
  );
  return (
    <defs>
      {rad('skin', '#ffe6d1', '#f6b98f', '#d4855a')}
      {rad('skin2', '#e9b892', '#b9794d', '#7f4b2c')}
      {rad('red', '#ffb0b0', '#ef3b4f', '#9c1328')}
      {rad('white', '#ffffff', '#eef1ff', '#c9d0ee')}
      {lin('blue', '#8cc0ff', '#2f5fd0')}
      {lin('rose', '#ff9aa8', '#d6304f')}
      {lin('green', '#8ff0bf', '#16a06a')}
      {lin('purple', '#c7b5ff', '#6b46e0')}
      {lin('suit', '#6f7594', '#262a40')}
      {lin('gold', '#fff3b0', '#d48a00')}
      {lin('teal', '#8ff5e8', '#0b7a6e')}
      {lin('hair', '#6b4a35', '#2b1a10')}
      {lin('hair2', '#ffd36e', '#c47f12')}
    </defs>
  );
}

function Frame({ name, label, children }) {
  const u = useId().replace(/:/g, '');
  return (
    <svg className={`qz-scene qz-scene-${name} qz-cartoon`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <Defs u={u} />
      <ellipse cx="160" cy="192" rx="150" ry="10" fill="rgba(0,0,0,0.18)" />
      {children(u)}
    </svg>
  );
}

const BROWS = {
  happy: ['M-15 -92 Q-9 -97 -3 -92', 'M3 -92 Q9 -97 15 -92'],
  grumpy: ['M-16 -96 L-3 -90', 'M16 -96 L3 -90'],
  unsure: ['M-15 -92 L-3 -92', 'M3 -96 Q9 -101 15 -96'],
  thinking: ['M-15 -95 Q-9 -99 -3 -95', 'M3 -97 Q9 -101 15 -98'],
  wow: ['M-15 -97 Q-9 -102 -3 -97', 'M3 -97 Q9 -102 15 -97'],
};

function Mouth({ mood }) {
  switch (mood) {
    case 'happy':
      return <path d="M-10 -67 Q0 -55 10 -67 Z" fill="#7a1f2b" stroke="#5a1520" strokeWidth="1.5" strokeLinejoin="round" />;
    case 'grumpy':
      return <path d="M-8 -61 Q0 -69 8 -61" fill="none" stroke="#5a1520" strokeWidth="3" strokeLinecap="round" />;
    case 'unsure':
      return <path d="M-7 -64 Q-3 -66 0 -64 T7 -64" fill="none" stroke="#5a1520" strokeWidth="3" strokeLinecap="round" />;
    case 'wow':
      return <ellipse cx="0" cy="-63" rx="5" ry="6" fill="#7a1f2b" />;
    default:
      return <ellipse cx="4" cy="-64" rx="3.5" ry="3" fill="#7a1f2b" />;
  }
}

/**
 * A chunky cartoon person standing at (x, y) (their feet). `pose`: idle, crossed (arms crossed),
 * wave, chin (hand on chin), point, cheer (both arms up), shake (arm out for a handshake).
 */
function Person({ u, x, y, s = 1, shirt = 'blue', skin = 'skin', hair = 'hair', mood = 'happy', pose = 'idle', tie, headset, flip, bob = 's3-bob', delay = 0 }) {
  const fill = (id) => `url(#${u}-${id})`;
  const arm = (d) => <path d={d} fill="none" stroke={fill(shirt)} strokeWidth="12" strokeLinecap="round" />;
  const hand = (cx, cy) => <circle cx={cx} cy={cy} r="7" fill={fill(skin)} />;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx="0" cy="0" rx="30" ry="6" fill="rgba(0,0,0,0.25)" />
      <g className={bob} style={{ animationDelay: `${delay}s` }}>
        {/* body with a darker copy below for depth */}
        <path d="M-29 1 Q-31 -50 0 -54 Q31 -50 29 1 Z" fill="rgba(0,0,0,0.25)" transform="translate(2 3)" />
        <path d="M-29 0 Q-31 -50 0 -54 Q31 -50 29 0 Z" fill={fill(shirt)} />
        <path d="M-19 -8 Q-21 -38 -5 -45" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="5" strokeLinecap="round" />
        {tie && <path d="M0 -50 L-5 -40 L0 -14 L5 -40 Z" fill="#ef3b4f" />}
        {pose === 'crossed' && (
          <g>
            <rect x="-26" y="-36" width="52" height="13" rx="6.5" fill={fill(shirt)} stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
            {hand(-22, -30)}
            {hand(22, -30)}
          </g>
        )}
        {pose === 'idle' && (<g>{arm('M-26 -40 Q-36 -22 -32 -6')}{arm('M26 -40 Q36 -22 32 -6')}{hand(-32, -6)}{hand(32, -6)}</g>)}
        {pose === 'wave' && (
          <g>
            {arm('M-26 -40 Q-36 -22 -32 -6')}
            {hand(-32, -6)}
            <g className="s3-wave">
              {arm('M26 -40 Q42 -52 40 -76')}
              {hand(40, -78)}
            </g>
          </g>
        )}
        {pose === 'chin' && (<g>{arm('M-26 -40 Q-36 -22 -32 -6')}{hand(-32, -6)}{arm('M24 -38 Q30 -46 14 -54')}{hand(10, -56)}</g>)}
        {pose === 'point' && (<g>{arm('M-26 -40 Q-36 -22 -32 -6')}{hand(-32, -6)}<g className="s3-point">{arm('M26 -40 Q44 -44 54 -50')}{hand(56, -51)}</g></g>)}
        {pose === 'cheer' && (
          <g className="s3-cheer">
            {arm('M-26 -40 Q-42 -56 -40 -80')}
            {arm('M26 -40 Q42 -56 40 -80')}
            {hand(-40, -82)}
            {hand(40, -82)}
          </g>
        )}
        {pose === 'shake' && (<g>{arm('M-26 -40 Q-36 -22 -32 -6')}{hand(-32, -6)}<g className="s3-shake-hand">{arm('M26 -36 Q40 -30 50 -32')}{hand(52, -32)}</g></g>)}
        {/* head */}
        <g className="s3-head">
          <circle cx="-25" cy="-78" r="6" fill={fill(skin)} />
          <circle cx="25" cy="-78" r="6" fill={fill(skin)} />
          <circle cx="0" cy="-79" r="27" fill="rgba(0,0,0,0.18)" transform="translate(2 3)" />
          <circle cx="0" cy="-79" r="27" fill={fill(skin)} />
          <path d="M-27 -84 Q-26 -112 0 -108 Q26 -112 27 -84 Q16 -100 2 -97 Q-12 -100 -27 -84 Z" fill={fill(hair)} />
          <path d="M-14 -102 Q-6 -107 4 -105" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="-17" cy="-68" rx="5" ry="3" fill="#ff7a8a" opacity="0.45" />
          <ellipse cx="17" cy="-68" rx="5" ry="3" fill="#ff7a8a" opacity="0.45" />
          <g className="s3-blink" style={{ animationDelay: `${delay + 1}s` }}>
            <ellipse cx="-9" cy="-81" rx="6" ry="7.5" fill="#fff" />
            <ellipse cx="9" cy="-81" rx="6" ry="7.5" fill="#fff" />
            <circle cx={mood === 'thinking' ? -7 : -8} cy={mood === 'thinking' ? -84 : -80} r="3.6" fill="#241a3a" />
            <circle cx={mood === 'thinking' ? 11 : 10} cy={mood === 'thinking' ? -84 : -80} r="3.6" fill="#241a3a" />
            <circle cx="-9" cy="-82" r="1.3" fill="#fff" />
            <circle cx="9" cy="-82" r="1.3" fill="#fff" />
          </g>
          {BROWS[mood].map((d) => <path key={d} d={d} fill="none" stroke="#3b2418" strokeWidth="3" strokeLinecap="round" />)}
          <Mouth mood={mood} />
          {headset && (
            <g>
              <path d="M-27 -80 Q-28 -114 0 -112 Q28 -114 27 -80" fill="none" stroke="#2b2f45" strokeWidth="4" />
              <rect x="-33" y="-88" width="10" height="16" rx="4" fill="#2b2f45" />
              <path d="M-28 -74 Q-26 -60 -10 -60" fill="none" stroke="#2b2f45" strokeWidth="3" />
              <circle cx="-9" cy="-60" r="3" fill="#ef3b4f" />
            </g>
          )}
        </g>
      </g>
    </g>
  );
}

/** A pop-up speech bubble; the tail points down-left (or down-right with `right`). */
function Bubble({ x, y, w, text, right, think, delay = 0 }) {
  const h = 30;
  const tail = right ? `M${x + w - 26} ${y + h - 2} L${x + w - 14} ${y + h + 12} L${x + w - 40} ${y + h - 2} Z` : `M${x + 14} ${y + h - 2} L${x + 12} ${y + h + 12} L${x + 32} ${y + h - 2} Z`;
  return (
    <g className="s3-bubble" style={{ animationDelay: `${delay}s` }}>
      <rect x={x + 2} y={y + 3} width={w} height={h} rx="15" fill="rgba(0,0,0,0.2)" />
      {think ? (
        <>
          <circle cx={x + 18} cy={y + h + 8} r="5" fill="#fff" />
          <circle cx={x + 10} cy={y + h + 18} r="3" fill="#fff" />
        </>
      ) : (
        <path d={tail} fill="#fff" />
      )}
      <rect x={x} y={y} width={w} height={h} rx="15" fill="#fff" />
      <text x={x + w / 2} y={y + 20} textAnchor="middle" className="s3-text">{text}</text>
    </g>
  );
}

// Position on the outer group: a CSS animation's transform would replace a transform attribute.
const Sparkle = ({ x, y, s = 1, delay = 0, color = '#fff' }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path className="s3-twinkle" style={{ animationDelay: `${delay}s` }} d="M0 -8 Q1 -1 8 0 Q1 1 0 8 Q-1 1 -8 0 Q-1 -1 0 -8 Z" fill={color} />
  </g>
);

// ---------- scenes ----------

const ObjPrice = () => (
  <Frame name="objprice" label="A grumpy customer saying it is too expensive, next to a swinging price tag">
    {(u) => (
      <>
        <Person u={u} x={92} y={186} shirt="rose" mood="grumpy" pose="crossed" />
        <Bubble x={20} y={10} w={118} text="Too pricey!" />
        {/* swinging price tag */}
        <line x1="226" y1="0" x2="226" y2="34" stroke="#c9d0ee" strokeWidth="2" />
        <g className="s3-swing">
          <path d="M206 40 L246 40 L256 62 L256 118 Q256 124 250 124 L202 124 Q196 124 196 118 L196 62 Z" fill="#9c6300" transform="translate(4 5)" />
          <path d="M206 40 L246 40 L256 62 L256 118 Q256 124 250 124 L202 124 Q196 124 196 118 L196 62 Z" fill={`url(#${u}-gold)`} />
          <circle cx="226" cy="55" r="6" fill="#5a3a00" />
          <text x="226" y="100" textAnchor="middle" className="s3-big">$$$</text>
          <path d="M202 66 L202 112" stroke="rgba(255,255,255,0.5)" strokeWidth="4" strokeLinecap="round" />
        </g>
        {/* coin stack */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i} className="s3-coin" style={{ animationDelay: `${i * 0.15}s` }}>
            <ellipse cx="282" cy={182 - i * 9} rx="18" ry="7" fill="#b07000" />
            <ellipse cx="282" cy={178 - i * 9} rx="18" ry="7" fill={`url(#${u}-gold)`} />
          </g>
        ))}
        <Sparkle x={262} y={130} delay={0.3} color="#ffe68a" />
      </>
    )}
  </Frame>
);

const ObjTime = () => (
  <Frame name="objtime" label="An unsure customer saying not right now, next to a ringing alarm clock">
    {(u) => (
      <>
        <Person u={u} x={100} y={186} shirt="purple" mood="unsure" pose="idle" hair="hair2" />
        <Bubble x={30} y={10} w={124} text="Not right now…" />
        <g className="s3-ring-shake">
          <circle cx="232" cy="96" r="12" fill={`url(#${u}-gold)`} transform="translate(-30 -40)" />
          <circle cx="232" cy="96" r="12" fill={`url(#${u}-gold)`} transform="translate(30 -40)" />
          <line x1="212" y1="140" x2="202" y2="160" stroke="#9c1328" strokeWidth="7" strokeLinecap="round" />
          <line x1="252" y1="140" x2="262" y2="160" stroke="#9c1328" strokeWidth="7" strokeLinecap="round" />
          <circle cx="235" cy="100" r="46" fill="#7d0f20" />
          <circle cx="232" cy="96" r="46" fill={`url(#${u}-red)`} />
          <circle cx="232" cy="96" r="34" fill={`url(#${u}-white)`} />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={232 + Math.cos((i * Math.PI) / 2) * 27} cy={96 + Math.sin((i * Math.PI) / 2) * 27} r="2.5" fill="#241a3a" />)}
          <line x1="232" y1="96" x2="232" y2="74" stroke="#241a3a" strokeWidth="4" strokeLinecap="round" className="s3-hand-fast" />
          <line x1="232" y1="96" x2="248" y2="96" stroke="#241a3a" strokeWidth="4" strokeLinecap="round" className="s3-hand-slow" />
          <circle cx="232" cy="96" r="4" fill="#ef3b4f" />
          <ellipse cx="214" cy="70" rx="10" ry="5" fill="rgba(255,255,255,0.6)" transform="rotate(-30 214 70)" />
        </g>
        <g className="s3-waves">
          <path d="M290 60 Q300 70 290 80" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <path d="M174 60 Q164 70 174 80" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </g>
        <text x="282" y="170" className="s3-zzz">z</text>
        <text x="294" y="150" className="s3-zzz" style={{ animationDelay: '0.6s' }}>z</text>
      </>
    )}
  </Frame>
);

const ObjCompetitor = () => (
  <Frame name="objcompetitor" label="A customer pointing at a rival product box">
    {(u) => (
      <>
        <Person u={u} x={92} y={186} shirt="green" mood="unsure" pose="point" skin="skin2" />
        <Bubble x={20} y={8} w={140} text="We use Brand X" />
        {/* isometric box */}
        <g className="s3-hop">
          <polygon points="236,96 286,120 236,144 186,120" fill="#c9d0ee" />
          <polygon points="186,120 236,144 236,186 186,162" fill="#8b93b8" />
          <polygon points="236,144 286,120 286,162 236,186" fill="#5d6380" />
          <polygon points="236,96 286,120 236,144 186,120" fill={`url(#${u}-white)`} />
          <polygon points="226,101 236,96 286,120 276,125" fill="rgba(239,59,79,0.8)" />
          <polygon points="276,125 286,120 286,162 276,167" fill="rgba(156,19,40,0.9)" />
        </g>
        <Sparkle x={292} y={90} delay={0.2} />
        <Sparkle x={180} y={98} s={0.7} delay={0.9} />
      </>
    )}
  </Frame>
);

const ObjAuthority = () => (
  <Frame name="objauthority" label="A customer saying they need to ask their boss, with the boss behind them">
    {(u) => (
      <>
        <Person u={u} x={236} y={186} s={1.25} shirt="suit" mood="grumpy" pose="crossed" tie bob="s3-bob-slow" delay={0.4} />
        <Person u={u} x={96} y={186} s={0.95} shirt="blue" mood="unsure" pose="idle" hair="hair2" />
        <Bubble x={14} y={14} w={148} text="I'll ask my boss" />
        <g className="s3-crown">
          <path d="M218 32 L222 14 L230 26 L236 10 L242 26 L250 14 L254 32 Z" fill={`url(#${u}-gold)`} stroke="#9c6300" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      </>
    )}
  </Frame>
);

const ObjTrust = () => (
  <Frame name="objtrust" label="A sceptical customer with a magnifying glass next to a trust shield">
    {(u) => (
      <>
        <Person u={u} x={96} y={186} shirt="rose" mood="thinking" pose="idle" skin="skin2" />
        <Bubble x={24} y={10} w={130} text="Who are you?" />
        <g className="s3-glass-scan">
          <circle cx="150" cy="100" r="17" fill="rgba(255,255,255,0.35)" stroke="#2b2f45" strokeWidth="5" />
          <ellipse cx="144" cy="94" rx="6" ry="4" fill="rgba(255,255,255,0.8)" transform="rotate(-30 144 94)" />
          <line x1="162" y1="113" x2="176" y2="128" stroke="#2b2f45" strokeWidth="7" strokeLinecap="round" />
        </g>
        <g className="s3-float">
          <path d="M240 46 L284 62 Q284 128 240 152 Q196 128 196 62 Z" fill="#075a51" transform="translate(4 5)" />
          <path d="M240 46 L284 62 Q284 128 240 152 Q196 128 196 62 Z" fill={`url(#${u}-teal)`} />
          <path d="M206 70 Q206 112 228 132" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="5" strokeLinecap="round" />
          <path d="M222 98 L236 112 L260 84" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" className="s3-check" />
        </g>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(${200 + i * 20} 172) scale(0.8)`}>
            <path
              className="s3-star"
              style={{ animationDelay: `${i * 0.15}s` }}
              d="M0 -9 L2.6 -3 L9 -2.8 L4 1.4 L5.6 8 L0 4.4 L-5.6 8 L-4 1.4 L-9 -2.8 L-2.6 -3 Z"
              fill={`url(#${u}-gold)`}
            />
          </g>
        ))}
      </>
    )}
  </Frame>
);

const Gear = ({ cx, cy, r, cls, color }) => (
  <g className={cls}>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={r * 0.5} strokeDasharray={`${r * 0.42} ${r * 0.42}`} />
    <circle cx={cx} cy={cy} r={r * 0.8} fill={color} />
    <circle cx={cx} cy={cy} r={r * 0.3} fill="#fff" />
  </g>
);

const ObjThink = () => (
  <Frame name="objthink" label="A customer thinking it over, with gears turning in a thought bubble">
    {(u) => (
      <>
        <Person u={u} x={110} y={186} shirt="purple" mood="thinking" pose="chin" />
        <g className="s3-cloud">
          <circle cx="160" cy="72" r="6" fill="#fff" />
          <circle cx="172" cy="56" r="9" fill="#fff" />
          <path d="M190 54 Q180 20 214 18 Q236 0 258 16 Q292 12 290 42 Q310 62 280 76 Q262 96 236 82 Q206 92 196 74 Q176 70 190 54 Z" fill="#fff" />
          <Gear cx={222} cy={48} r={16} cls="s3-spin" color="#6b46e0" />
          <Gear cx={252} cy={60} r={11} cls="s3-spin-back" color="#ef3b4f" />
          <Gear cx={260} cy={33} r={8} cls="s3-spin" color="#16a06a" />
        </g>
        <text x="200" y="130" className="s3-hmm">Hmm…</text>
        <text x="252" y="168" className="s3-question">?</text>
      </>
    )}
  </Frame>
);

const SalesCall = () => (
  <Frame name="salescall" label="A cheerful salesperson with a headset next to a ringing phone">
    {(u) => (
      <>
        <Person u={u} x={100} y={186} shirt="blue" mood="happy" pose="wave" headset />
        <Bubble x={30} y={8} w={118} text="Hi! Got 2 mins?" />
        <g className="s3-phone">
          <rect x="208" y="58" width="64" height="110" rx="14" fill="#1a1f33" transform="translate(5 5)" />
          <rect x="208" y="58" width="64" height="110" rx="14" fill={`url(#${u}-suit)`} />
          <rect x="214" y="68" width="52" height="86" rx="8" fill={`url(#${u}-green)`} />
          <circle cx="240" cy="98" r="14" fill="#fff" opacity="0.9" />
          <path d="M233 92 q3 -4 6 0 l-2 3 q2 4 6 6 l3 -2 q4 3 0 6 q-9 2 -14 -8 Z" fill="#16a06a" />
          <rect x="222" y="124" width="36" height="6" rx="3" fill="rgba(255,255,255,0.7)" />
          <rect x="228" y="136" width="24" height="5" rx="2.5" fill="rgba(255,255,255,0.5)" />
          <path d="M214 74 L214 140" stroke="rgba(255,255,255,0.3)" strokeWidth="3" strokeLinecap="round" />
        </g>
        {[0, 1, 2].map((i) => (
          <path key={i} className="s3-signal" style={{ animationDelay: `${i * 0.3}s` }} d={`M${284 + i * 9} ${84 - i * 6} Q${294 + i * 12} ${110} ${284 + i * 9} ${136 + i * 6}`} fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
        ))}
      </>
    )}
  </Frame>
);

const DealWin = () => (
  <Frame name="dealwin" label="A salesperson and customer celebrating a deal next to a trophy">
    {(u) => (
      <>
        <Person u={u} x={70} y={186} s={0.9} shirt="blue" mood="happy" pose="cheer" headset />
        <Person u={u} x={160} y={186} s={0.9} shirt="rose" mood="wow" pose="cheer" skin="skin2" hair="hair2" delay={0.3} />
        <g className="s3-trophy">
          <rect x="236" y="166" width="56" height="16" rx="4" fill="#5a3a00" />
          <rect x="246" y="148" width="36" height="20" rx="3" fill={`url(#${u}-gold)`} />
          <rect x="258" y="124" width="12" height="26" fill="#d48a00" />
          <path d="M232 64 Q232 58 238 58 L290 58 Q296 58 296 64 Q296 120 264 126 Q232 120 232 64 Z" fill="#9c6300" transform="translate(3 4)" />
          <path d="M232 64 Q232 58 238 58 L290 58 Q296 58 296 64 Q296 120 264 126 Q232 120 232 64 Z" fill={`url(#${u}-gold)`} />
          <path d="M232 70 Q212 72 216 92 Q220 106 238 106" fill="none" stroke="#d48a00" strokeWidth="6" />
          <path d="M296 70 Q316 72 312 92 Q308 106 290 106" fill="none" stroke="#d48a00" strokeWidth="6" />
          <path d="M244 68 Q242 100 258 114" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="5" strokeLinecap="round" />
          <text x="265" y="98" textAnchor="middle" className="s3-trophy-text">1</text>
        </g>
        <Sparkle x={228} y={46} delay={0} />
        <Sparkle x={302} y={40} s={1.3} delay={0.4} color="#ffe68a" />
        <Sparkle x={210} y={120} s={0.8} delay={0.8} />
        {['#ff4fd8', '#22d3ee', '#ffd23f', '#16a06a', '#7c5cff', '#ef3b4f'].map((c, i) => (
          <rect key={c} className="s3-confetti" style={{ animationDelay: `${i * 0.35}s` }} x={30 + i * 34} y="-6" width="6" height="10" rx="1.5" fill={c} />
        ))}
        <Bubble x={86} y={12} w={84} text="Deal! 🎉" />
      </>
    )}
  </Frame>
);

export const CARTOONS = {
  salescall: SalesCall,
  objprice: ObjPrice,
  objtime: ObjTime,
  objcompetitor: ObjCompetitor,
  objauthority: ObjAuthority,
  objtrust: ObjTrust,
  objthink: ObjThink,
  dealwin: DealWin,
};
