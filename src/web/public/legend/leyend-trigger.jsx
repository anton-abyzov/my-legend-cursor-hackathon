// leyend-trigger.jsx — the three tactile "trigger" rituals
// Each calls onReveal(quest) when the ritual completes.
// Exported: DiceTrigger, CardTrigger, PhoneTrigger, TriggerStage

const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

// pip layouts for a six-sided die (positions on a 3x3 grid)
const PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
function DieFace({ n, transform }) {
  return (
    <div className="ly-die-face" style={{ transform }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(3,1fr)', width: '100%', height: '100%', padding: 12, boxSizing: 'border-box' }}>
        {Array.from({ length: 9 }).map((_, k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {PIPS[n].includes(k) && <span style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 9px var(--glow), inset 0 -1px 2px rgba(0,0,0,0.35)' }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// orientation that brings face N to the front
const DIE_TARGET = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };

function DiceTrigger({ onReveal, answers, exclude }) {
  const [inner, setInner] = React.useState({ x: -16, y: 26 });
  const [rolling, setRolling] = React.useState(false);
  const [landed, setLanded] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const tRef = React.useRef([]);
  React.useEffect(() => () => tRef.current.forEach(clearTimeout), []);

  const cast = () => {
    if (rolling) return;
    buzz(18);
    setRolling(true); setLanded(false); setResult(null);
    const num = 1 + Math.floor(Math.random() * 6);
    const [bx, by] = DIE_TARGET[num];
    const spins = 4 + (Math.random() < 0.5 ? 0 : 1);
    setInner({ x: bx + 360 * spins, y: by + 360 * spins });
    tRef.current.push(setTimeout(() => { setLanded(true); setResult(num); buzz([16, 50, 26]); }, 1850));
    tRef.current.push(setTimeout(() => onReveal(pickQuest(answers, exclude)), 2950));
  };

  const faces = [
    { n: 1, t: 'rotateY(0deg) translateZ(56px)' },
    { n: 6, t: 'rotateY(180deg) translateZ(56px)' },
    { n: 3, t: 'rotateY(90deg) translateZ(56px)' },
    { n: 4, t: 'rotateY(-90deg) translateZ(56px)' },
    { n: 2, t: 'rotateX(90deg) translateZ(56px)' },
    { n: 5, t: 'rotateX(-90deg) translateZ(56px)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      <div style={{ position: 'relative', perspective: 780, width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {landed && <div className="ly-die-flash" />}
        <div style={{ transform: 'rotateX(-15deg) rotateY(18deg)', transformStyle: 'preserve-3d' }}>
          <div className={`ly-die ${rolling ? 'ly-die-rolling' : 'ly-die-idle'}${landed ? ' ly-die-landed' : ''}`}
            style={{ transform: `rotateX(${inner.x}deg) rotateY(${inner.y}deg)` }}>
            {faces.map(f => <DieFace key={f.n} n={f.n} transform={f.t} />)}
          </div>
        </div>
      </div>
      <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {landed && (
          <div className="ly-eyebrow ly-fade-in" style={{ justifyContent: 'center' }}>
            The die lands on
            <span style={{ color: 'var(--primary)', marginLeft: 8, fontFamily: 'var(--heading)', fontSize: 19, lineHeight: 1 }}>{result}</span>
          </div>
        )}
      </div>
      <Btn onClick={cast} disabled={rolling} full={false} style={{ minWidth: 210 }}>
        {landed ? 'Reading the omen…' : rolling ? 'Tumbling…' : 'Cast the die'}
      </Btn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card spread — pick one, it floats up and flips
// ─────────────────────────────────────────────────────────────
function CardTrigger({ onReveal, answers, exclude }) {
  const [picked, setPicked] = React.useState(null);
  const [flipped, setFlipped] = React.useState(false);
  const tRef = React.useRef([]);
  React.useEffect(() => () => tRef.current.forEach(clearTimeout), []);
  const N = 5;
  const choose = (k) => {
    if (picked !== null) return;
    buzz(16);
    setPicked(k);
    tRef.current.push(setTimeout(() => { setFlipped(true); buzz(24); }, 520));
    tRef.current.push(setTimeout(() => onReveal(pickQuest(answers, exclude)), 2050));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, width: '100%' }}>
      <div style={{ position: 'relative', width: 300, height: 280, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {Array.from({ length: N }).map((_, k) => {
          const mid = (N - 1) / 2;
          const off = k - mid;
          const isPick = picked === k;
          const gone = picked !== null && !isPick;
          const base = {
            position: 'absolute', bottom: 0, transformOrigin: '50% 110%',
            transition: 'transform .6s cubic-bezier(.34,1.4,.5,1), opacity .5s ease',
          };
          let transform = `translateX(${off * 46}px) rotate(${off * 9}deg) translateY(${Math.abs(off) * 10}px)`;
          if (isPick) transform = 'translateX(0) translateY(-150px) rotate(0deg) scale(1.18)';
          if (gone) transform = `translateX(${off * 70}px) translateY(60px) rotate(${off * 14}deg) scale(.9)`;
          return (
            <div key={k} className="ly-card-flip" onClick={() => choose(k)}
              style={{ ...base, transform, opacity: gone ? 0 : 1, zIndex: isPick ? 10 : 5 - Math.abs(off), cursor: picked === null ? 'pointer' : 'default' }}>
              <div className="ly-card-inner" style={{ transform: isPick && flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                {/* back */}
                <div className="ly-card-side ly-card-back">
                  <div style={{ position: 'absolute', inset: 8, borderRadius: 10, border: '1px solid var(--card-line)' }} />
                  <Compass size={62} primary="var(--primary)" ink="var(--card-ink)" ring="var(--secondary)" faint="var(--primary)" />
                </div>
                {/* front (revealed) */}
                <div className="ly-card-side ly-card-front">
                  <div style={{ position: 'absolute', inset: 8, borderRadius: 10, border: '1px solid var(--primary)' }} />
                  <Compass size={58} primary="var(--primary)" ink="var(--ink)" ring="var(--secondary)" />
                  <div style={{ fontFamily: 'var(--heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', fontSize: 16, color: 'var(--ink)', marginTop: 12, textAlign: 'center', lineHeight: 1.15 }}>A path has<br />chosen you</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ly-eyebrow" style={{ opacity: picked === null ? 1 : 0, transition: 'opacity .3s', margin: 0, justifyContent: 'center' }}>
        Trust your hand · choose a card
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Phone omen — a signal from the universe; tap to receive
// ─────────────────────────────────────────────────────────────
function PhoneTrigger({ onReveal, answers, exclude }) {
  const [state, setState] = React.useState('calling'); // calling → receiving
  const tRef = React.useRef([]);
  React.useEffect(() => () => tRef.current.forEach(clearTimeout), []);
  const receive = () => {
    if (state !== 'calling') return;
    buzz([10, 30, 10, 30, 60]);
    setState('receiving');
    tRef.current.push(setTimeout(() => onReveal(pickQuest(answers, exclude)), 1900));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 38 }}>
      <div onClick={receive} style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: state === 'calling' ? 'pointer' : 'default' }}>
        {[0, 1, 2].map(k => (
          <span key={k} className={state === 'receiving' ? 'ly-ripple ly-ripple-fast' : 'ly-ripple'}
            style={{ animationDelay: `${k * 0.9}s` }} />
        ))}
        <div className={state === 'receiving' ? 'ly-orb ly-orb-on' : 'ly-orb'}>
          <Compass size={84} primary="var(--bg)" ink="var(--bg)" ring="var(--bg)" faint="var(--bg)" spin={state === 'receiving'} />
        </div>
      </div>
      <div style={{ textAlign: 'center', minHeight: 48 }}>
        {state === 'calling' ? (
          <React.Fragment>
            <div style={{ fontFamily: 'var(--heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.01em', fontSize: 22, color: 'var(--ink)', lineHeight: 1.15 }}>The universe<br />is calling</div>
            <div className="ly-eyebrow" style={{ marginTop: 10, justifyContent: 'center' }}>Tap the signal to receive</div>
          </React.Fragment>
        ) : (
          <div style={{ fontFamily: 'var(--heading)', fontWeight: 800, textTransform: 'uppercase', fontSize: 22, color: 'var(--primary)' }} className="ly-fade-in">Receiving omen…</div>
        )}
      </div>
    </div>
  );
}

function TriggerStage({ type, onReveal, answers, exclude }) {
  if (type === 'card') return <CardTrigger onReveal={onReveal} answers={answers} exclude={exclude} />;
  if (type === 'phone') return <PhoneTrigger onReveal={onReveal} answers={answers} exclude={exclude} />;
  return <DiceTrigger onReveal={onReveal} answers={answers} exclude={exclude} />;
}

Object.assign(window, { DiceTrigger, CardTrigger, PhoneTrigger, TriggerStage });
