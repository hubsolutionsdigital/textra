// Design mockups for "Pin the spot" questions, drawn on an 800×500 grid. Hotspot targets in
// server/quiz-templates.js are fractions of these drawings, so keep the coordinates stable.

const Text = ({ x, y, w, h = 10, cls = 'c-line' }) => <rect x={x} y={y} width={w} height={h} rx={h / 2} className={cls} />;

const Landing = () => (
  <>
    <rect width="800" height="500" className="c-bg" />
    <rect width="800" height="60" className="c-surface" />
    <rect x="30" y="20" width="100" height="20" rx="6" className="c-brand" />
    {[420, 480, 540, 600].map((x) => <Text key={x} x={x} y={25} w={44} />)}
    <rect x="670" y="15" width="100" height="30" rx="8" className="c-outline" />
    <Text x={690} y={26} w={60} h={8} />
    <Text x={60} y={110} w={340} h={30} cls="c-head" />
    <Text x={60} y={150} w={260} h={30} cls="c-head" />
    <Text x={60} y={215} w={330} />
    <Text x={60} y={235} w={290} />
    <rect x="60" y="290" width="170" height="50" rx="12" className="c-cta" />
    <Text x={90} y={310} w={110} h={10} cls="c-on-cta" />
    <Text x={250} y={310} w={90} h={10} cls="c-link" />
    <rect x="470" y="100" width="290" height="260" rx="20" className="c-media" />
    <circle cx="615" cy="215" r="50" className="c-media-2" />
    <path d="M520 330 L590 260 L640 300 L700 230 L740 330 Z" className="c-media-2" />
    {[40, 285, 530].map((x) => (
      <g key={x}>
        <rect x={x} y="390" width="230" height="90" rx="14" className="c-surface" />
        <circle cx={x + 30} cy="420" r="14" className="c-brand-soft" />
        <Text x={x + 54} y={414} w={120} />
        <Text x={x + 20} y={448} w={180} h={8} />
      </g>
    ))}
  </>
);

const Serp = () => (
  <>
    <rect width="800" height="500" className="c-bg" />
    <rect x="40" y="20" width="520" height="50" rx="25" className="c-surface" />
    <circle cx="70" cy="45" r="10" className="c-outline" />
    <Text x={95} y={40} w={200} />
    <Text x={40} y={85} w={160} h={6} />
    {[0, 1].map((i) => {
      const y = 100 + i * 190;
      return (
        <g key={i}>
          <circle cx="52" cy={y + 10} r="10" className="c-brand-soft" />
          <Text x={70} y={y + 2} w={180} h={7} />
          <Text x={70} y={y + 13} w={240} h={6} />
          <Text x={40} y={y + 30} w={i ? 380 : 470} h={18} cls="c-serp-title" />
          <Text x={40} y={y + 65} w={i ? 520 : 570} h={9} />
          <Text x={40} y={y + 80} w={i ? 480 : 540} h={9} />
          <Text x={40} y={y + 95} w={i ? 300 : 360} h={9} />
          {i === 0 && [40, 180, 320].map((x) => <Text key={x} x={x} y={y + 125} w={120} h={10} cls="c-link" />)}
        </g>
      );
    })}
    <rect x="640" y="100" width="140" height="300" rx="14" className="c-surface" />
    <rect x="656" y="116" width="108" height="80" rx="10" className="c-media" />
    <Text x={656} y={210} w={90} h={12} cls="c-head" />
    {[234, 252, 270, 288].map((y) => <Text key={y} x={656} y={y} w={100} h={7} />)}
  </>
);

const App = () => (
  <>
    <rect width="800" height="500" className="c-bg" />
    <rect width="160" height="500" className="c-side" />
    <rect x="20" y="22" width="100" height="18" rx="6" className="c-brand" />
    {[80, 115, 150, 185, 220].map((y, i) => (
      <g key={y}>
        <rect x="14" y={y - 8} width="132" height="28" rx="8" className={i === 0 ? 'c-side-active' : 'c-none'} />
        <rect x="26" y={y} width="12" height="12" rx="3" className="c-side-ink" />
        <Text x={48} y={y + 2} w={70} h={8} cls="c-side-ink" />
      </g>
    ))}
    <Text x={190} y={30} w={180} h={20} cls="c-head" />
    <rect x="460" y="22" width="160" height="36" rx="18" className="c-surface" />
    <rect x="640" y="20" width="132" height="40" rx="10" className="c-cta" />
    <Text x={668} y={35} w={76} h={10} cls="c-on-cta" />
    {[180, 380, 580].map((x) => (
      <g key={x}>
        <rect x={x} y="96" width="190" height="104" rx="14" className="c-surface" />
        <Text x={x + 18} y={116} w={80} h={8} />
        <Text x={x + 18} y={140} w={110} h={22} cls="c-head" />
        <Text x={x + 18} y={176} w={60} h={8} cls="c-link" />
      </g>
    ))}
    <rect x="180" y="220" width="390" height="260" rx="14" className="c-surface" />
    <Text x={200} y={240} w={120} h={10} cls="c-head" />
    <path d="M200 440 L260 380 L320 400 L380 330 L440 350 L500 290 L550 300" className="c-chart" />
    <rect x="590" y="220" width="180" height="260" rx="14" className="c-surface" />
    {[250, 300, 350, 400, 450].map((y) => (
      <g key={y}>
        <circle cx="614" cy={y} r="11" className="c-brand-soft" />
        <Text x={634} y={y - 8} w={110} h={7} />
        <Text x={634} y={y + 4} w={70} h={6} />
      </g>
    ))}
  </>
);

const Checkout = () => (
  <>
    <rect width="800" height="500" className="c-bg" />
    <Text x={40} y={30} w={200} h={22} cls="c-head" />
    {[80, 150, 220].map((y) => (
      <g key={y}>
        <Text x={40} y={y} w={90} h={8} />
        <rect x="40" y={y + 16} width="440" height="40" rx="10" className="c-input" />
      </g>
    ))}
    <rect x="40" y="290" width="18" height="18" rx="4" className="c-outline" />
    <Text x={68} y={295} w={250} h={8} />
    <rect x="40" y="335" width="440" height="56" rx="12" className="c-cta" />
    <Text x={200} y={358} w={120} h={11} cls="c-on-cta" />
    <rect x="40" y="410" width="180" height="30" rx="8" className="c-trust" />
    <path d="M56 420 h12 v14 h-12 z M58 420 v-4 a4 4 0 0 1 8 0 v4" className="c-lock" />
    <Text x={78} y={421} w={120} h={8} cls="c-trust-ink" />
    <rect x="520" y="80" width="240" height="320" rx="16" className="c-surface" />
    <Text x={540} y={100} w={120} h={12} cls="c-head" />
    {[140, 200].map((y) => (
      <g key={y}>
        <rect x="540" y={y} width="44" height="44" rx="8" className="c-media" />
        <Text x={596} y={y + 8} w={100} h={8} />
        <Text x={596} y={y + 24} w={60} h={8} cls="c-link" />
      </g>
    ))}
    <line x1="540" x2="740" y1="300" y2="300" className="c-divider" />
    <Text x={540} y={335} w={60} h={12} cls="c-head" />
    <Text x={660} y={335} w={80} h={12} cls="c-head" />
  </>
);

const MAP = { landing: Landing, serp: Serp, app: App, checkout: Checkout };

/** The picture a hotspot question is played on: a built-in mockup or an uploaded image. */
export default function HotspotCanvas({ canvas, image, children, className = '', ...rest }) {
  const Comp = MAP[canvas] ?? Landing;
  return (
    <div className={`qz-canvas ${className}`} {...rest}>
      {image ? (
        <img src={image} alt="" className="qz-canvas-img" draggable={false} />
      ) : (
        <svg viewBox="0 0 800 500" className="qz-canvas-svg" aria-hidden="true">
          <Comp />
        </svg>
      )}
      {children}
    </div>
  );
}
