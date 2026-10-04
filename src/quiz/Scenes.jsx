// Animated graphics for questions. Each scene is an SVG animated with CSS (see .qz-scene in
// quiz.css), so they loop smoothly, scale to any size and cost nothing to download.
// Animations pause for people who prefer reduced motion.

const W = 320;
const H = 200;

function Frame({ name, children, label }) {
  return (
    <svg className={`qz-scene qz-scene-${name}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

const Browser = () => (
  <Frame name="browser" label="A web page building itself">
    <rect x="20" y="16" width="280" height="168" rx="12" className="s-card" />
    <rect x="20" y="16" width="280" height="24" rx="12" className="s-bar" />
    <circle cx="36" cy="28" r="4" className="s-dot1" />
    <circle cx="50" cy="28" r="4" className="s-dot2" />
    <circle cx="64" cy="28" r="4" className="s-dot3" />
    <g className="s-build">
      <rect x="36" y="52" width="60" height="10" rx="5" className="s-ink b1" />
      <rect x="196" y="52" width="88" height="10" rx="5" className="s-soft b1" />
      <rect x="36" y="76" width="140" height="16" rx="6" className="s-ink b2" />
      <rect x="36" y="98" width="110" height="8" rx="4" className="s-soft b3" />
      <rect x="36" y="116" width="64" height="20" rx="10" className="s-accent b4" />
      <rect x="196" y="76" width="88" height="62" rx="10" className="s-accent2 b3" />
      <rect x="36" y="150" width="76" height="24" rx="8" className="s-soft b5" />
      <rect x="122" y="150" width="76" height="24" rx="8" className="s-soft b5" />
      <rect x="208" y="150" width="76" height="24" rx="8" className="s-soft b5" />
    </g>
    <path className="s-cursor" d="M0 0 L0 16 L4 12 L7 19 L10 18 L7 11 L12 11 Z" />
  </Frame>
);

const Serp = () => (
  <Frame name="serp" label="Search results appearing">
    <rect x="30" y="18" width="260" height="30" rx="15" className="s-card" />
    <circle cx="50" cy="33" r="7" className="s-stroke" />
    <line x1="55" y1="38" x2="60" y2="43" className="s-stroke" />
    <rect x="68" y="28" width="150" height="10" rx="5" className="s-ink s-type" />
    <rect x="221" y="26" width="2" height="14" className="s-caret" />
    {[0, 1, 2].map((i) => (
      <g key={i} className={`s-result r${i}`}>
        <rect x="30" y={64 + i * 44} width="260" height="38" rx="8" className={i === 0 ? 's-glow' : 's-none'} />
        <rect x="40" y={70 + i * 44} width="80" height="5" rx="2.5" className="s-soft" />
        <rect x="40" y={79 + i * 44} width={170 - i * 20} height="8" rx="4" className="s-accent" />
        <rect x="40" y={91 + i * 44} width={220 - i * 30} height="5" rx="2.5" className="s-soft" />
      </g>
    ))}
  </Frame>
);

const Mobile = () => (
  <Frame name="mobile" label="A phone app scrolling">
    <rect x="112" y="6" width="96" height="188" rx="18" className="s-card" />
    <rect x="144" y="12" width="32" height="6" rx="3" className="s-ink" />
    <clipPath id="qz-phone">
      <rect x="118" y="24" width="84" height="146" rx="6" />
    </clipPath>
    <g clipPath="url(#qz-phone)">
      <g className="s-scroll">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <rect x="122" y={28 + i * 50} width="76" height="42" rx="8" className={i % 2 ? 's-soft' : 's-accent2'} />
            <rect x="128" y={34 + i * 50} width="40" height="6" rx="3" className="s-ink" />
            <rect x="128" y={46 + i * 50} width="60" height="4" rx="2" className="s-soft-on" />
          </g>
        ))}
      </g>
    </g>
    <rect x="118" y="172" width="84" height="16" rx="6" className="s-bar" />
    <circle cx="134" cy="180" r="3" className="s-soft" />
    <circle cx="160" cy="180" r="3" className="s-soft" />
    <circle cx="186" cy="180" r="3" className="s-soft" />
    <circle cx="134" cy="180" r="4" className="s-accent s-tab" />
    <g className="s-float1">
      <circle cx="62" cy="70" r="20" className="s-accent" />
      <path d="M54 70 l6 6 l11 -12" className="s-check" />
    </g>
    <g className="s-float2">
      <rect x="236" y="110" width="58" height="34" rx="10" className="s-accent2" />
      <rect x="244" y="118" width="30" height="5" rx="2.5" className="s-ink" />
      <rect x="244" y="128" width="40" height="5" rx="2.5" className="s-soft-on" />
    </g>
  </Frame>
);

const PALETTE = ['#ff5d8f', '#ffb547', '#3ddc97', '#4cc9f0', '#8b5cf6'];
const Palette = () => (
  <Frame name="palette" label="Colour swatches">
    <g className="s-wheel" style={{ transformOrigin: '80px 100px' }}>
      {PALETTE.map((c, i) => {
        const a = (i / PALETTE.length) * Math.PI * 2;
        return <circle key={c} cx={80 + Math.cos(a) * 38} cy={100 + Math.sin(a) * 38} r="20" fill={c} opacity=".9" />;
      })}
      <circle cx="80" cy="100" r="14" className="s-card" />
    </g>
    {PALETTE.map((c, i) => (
      <g key={c} className="s-swatch" style={{ animationDelay: `${i * 0.18}s` }}>
        <rect x={150 + i * 30} y="70" width="24" height="44" rx="8" fill={c} />
        <rect x={150 + i * 30} y="120" width="24" height="5" rx="2.5" className="s-soft" />
      </g>
    ))}
    <rect x="150" y="140" width="144" height="26" rx="8" className="s-card" />
    <text x="160" y="158" className="s-label">Aa 4.5 : 1</text>
    <circle cx="276" cy="153" r="7" className="s-ok" />
  </Frame>
);

const Typography = () => (
  <Frame name="typography" label="Type weights changing">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <line key={i} x1="16" x2="304" y1={50 + i * 22} y2={50 + i * 22} className="s-baseline" />
    ))}
    <text x="34" y="138" className="s-aa">Aa</text>
    <g className="s-specimen">
      <text x="190" y="70" className="s-t1">Heading</text>
      <text x="190" y="100" className="s-t2">Subheading</text>
      <text x="190" y="124" className="s-t3">Body text reads best</text>
      <text x="190" y="142" className="s-t3">at 45–75 characters.</text>
    </g>
  </Frame>
);

const Speed = () => (
  <Frame name="speed" label="A page speed gauge">
    <path d="M60 150 A100 100 0 0 1 260 150" className="s-track" />
    <path d="M60 150 A100 100 0 0 1 126 56" className="s-arc s-red" />
    <path d="M126 56 A100 100 0 0 1 194 56" className="s-arc s-amber" />
    <path d="M194 56 A100 100 0 0 1 260 150" className="s-arc s-green" />
    <g className="s-needle" style={{ transformOrigin: '160px 150px' }}>
      <line x1="160" y1="150" x2="160" y2="66" className="s-needle-line" />
    </g>
    <circle cx="160" cy="150" r="9" className="s-ink" />
    {['LCP', 'INP', 'CLS'].map((t, i) => (
      <g key={t} className="s-chip" style={{ animationDelay: `${0.6 + i * 0.3}s` }}>
        <rect x={86 + i * 52} y="168" width="44" height="22" rx="11" className="s-card" />
        <text x={108 + i * 52} y="183" className="s-chip-text">{t}</text>
      </g>
    ))}
  </Frame>
);

const Growth = () => (
  <Frame name="growth" label="Rankings climbing">
    {[0, 1, 2, 3].map((i) => (
      <line key={i} x1="30" x2="300" y1={40 + i * 40} y2={40 + i * 40} className="s-baseline" />
    ))}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x={44 + i * 42} y={160 - (i + 1) * 18} width="24" height={(i + 1) * 18} rx="5" className="s-bar-grow s-accent2" style={{ animationDelay: `${i * 0.12}s` }} />
    ))}
    <path d="M40 150 C 90 140, 110 110, 150 100 S 230 60, 290 30" className="s-line" />
    <g className="s-rocket">
      <circle r="9" className="s-accent" />
      <text y="4" className="s-mini" textAnchor="middle">#1</text>
    </g>
  </Frame>
);

const Grid = () => (
  <Frame name="grid" label="Blocks snapping to a layout grid">
    {Array.from({ length: 12 }, (_, i) => (
      <rect key={i} x={22 + i * 23.5} y="14" width="18" height="172" rx="3" className="s-col" style={{ animationDelay: `${i * 0.05}s` }} />
    ))}
    <rect x="22" y="26" width="276" height="22" rx="6" className="s-ink s-snap a" />
    <rect x="22" y="60" width="159" height="60" rx="8" className="s-accent s-snap b" />
    <rect x="186" y="60" width="112" height="60" rx="8" className="s-accent2 s-snap c" />
    <rect x="22" y="132" width="88" height="42" rx="8" className="s-soft s-snap d" />
    <rect x="116" y="132" width="88" height="42" rx="8" className="s-soft s-snap e" />
    <rect x="210" y="132" width="88" height="42" rx="8" className="s-soft s-snap f" />
  </Frame>
);

const Funnel = () => (
  <Frame name="funnel" label="Visitors flowing through a funnel">
    <path d="M70 30 H250 L200 100 V160 H120 V100 Z" className="s-card" />
    <path d="M86 52 H234" className="s-baseline" />
    <path d="M110 80 H210" className="s-baseline" />
    {Array.from({ length: 9 }, (_, i) => (
      <circle key={i} r="5" cx={90 + (i % 5) * 34} cy="20" className={`s-drop ${i % 3 === 0 ? 's-accent' : 's-accent2'}`} style={{ animationDelay: `${i * 0.33}s`, '--x': `${90 + (i % 5) * 34 - 160}px` }} />
    ))}
    <rect x="132" y="170" width="56" height="20" rx="10" className="s-ok s-goal" />
    <text x="160" y="184" className="s-chip-text s-on-ok">Goal</text>
  </Frame>
);

const Crawler = () => (
  <Frame name="crawler" label="A crawler scanning a page">
    <rect x="40" y="16" width="240" height="168" rx="12" className="s-card" />
    {Array.from({ length: 7 }, (_, i) => (
      <rect key={i} x="60" y={34 + i * 20} width={[180, 140, 200, 120, 170, 150, 190][i]} height="8" rx="4" className="s-soft s-scan-line" style={{ animationDelay: `${i * 0.35}s` }} />
    ))}
    <g className="s-bot">
      <circle cx="0" cy="0" r="18" className="s-glass" />
      <line x1="13" y1="13" x2="26" y2="26" className="s-stroke s-thick" />
      <circle cx="-5" cy="-3" r="2.5" className="s-ink" />
      <circle cx="5" cy="-3" r="2.5" className="s-ink" />
      <path d="M-5 5 Q0 9 5 5" className="s-stroke" />
    </g>
  </Frame>
);

const NODES = [[60, 60], [160, 40], [260, 70], [100, 150], [210, 150], [160, 100]];
const EDGES = [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [0, 1], [1, 2], [3, 4], [0, 3], [2, 4]];
const Links = () => (
  <Frame name="links" label="A network of links">
    {EDGES.map(([a, b], i) => (
      <line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} className="s-edge" />
    ))}
    {EDGES.slice(0, 5).map(([a, b], i) => (
      <circle key={i} r="4" className="s-pulse s-accent" style={{ animationDelay: `${i * 0.4}s`, offsetPath: `path('M${NODES[a][0]} ${NODES[a][1]} L${NODES[b][0]} ${NODES[b][1]}')` }} />
    ))}
    {NODES.map(([x, y], i) => (
      <g key={i} className={i === 5 ? 's-hub' : 's-node'} style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.2}s` }}>
        <circle cx={x} cy={y} r={i === 5 ? 20 : 12} className={i === 5 ? 's-accent' : 's-card'} />
        {i === 5 && <text x={x} y={y + 4} className="s-mini" textAnchor="middle">DA</text>}
      </g>
    ))}
  </Frame>
);

const Cursor = () => (
  <Frame name="cursor" label="A cursor clicking a button">
    <rect x="40" y="30" width="240" height="140" rx="14" className="s-card" />
    <rect x="64" y="52" width="120" height="12" rx="6" className="s-ink" />
    <rect x="64" y="72" width="170" height="7" rx="3.5" className="s-soft" />
    <rect x="64" y="86" width="140" height="7" rx="3.5" className="s-soft" />
    <g className="s-btn" style={{ transformOrigin: '119px 128px' }}>
      <rect x="64" y="112" width="110" height="32" rx="16" className="s-accent" />
      <rect x="88" y="124" width="62" height="8" rx="4" className="s-on-accent" />
    </g>
    <circle cx="140" cy="130" r="6" className="s-ripple" />
    <path className="s-cursor s-cursor-click" d="M0 0 L0 18 L5 13 L8 21 L12 19 L8 12 L14 12 Z" />
  </Frame>
);

const MAP = {
  browser: Browser,
  serp: Serp,
  mobile: Mobile,
  palette: Palette,
  typography: Typography,
  speed: Speed,
  growth: Growth,
  grid: Grid,
  funnel: Funnel,
  crawler: Crawler,
  links: Links,
  cursor: Cursor,
};

/** A question's visual: an uploaded image, an animated scene, or nothing. */
export default function Scene({ visual, className = '' }) {
  if (visual?.image) {
    return (
      <div className={`qz-visual ${className}`}>
        <img src={visual.image} alt="" className="qz-visual-img" />
      </div>
    );
  }
  const Comp = MAP[visual?.scene];
  if (!Comp) return null;
  return (
    <div className={`qz-visual ${className}`}>
      <Comp />
    </div>
  );
}

export function SceneThumb({ scene }) {
  const Comp = MAP[scene];
  return Comp ? <Comp /> : <div className="qz-scene-none">∅</div>;
}
