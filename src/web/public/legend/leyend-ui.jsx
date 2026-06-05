// leyend-ui.jsx — shared visual atoms (ChainZoku-inspired)
// Exported: Starfield, Blobs, Grain, Screen, Eyebrow, Btn, PageDots, ScaleMeter, Tag, NumLabel, useToast

// scattered-dot starfield tile
const STAR_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cg fill='white'%3E%3Ccircle cx='14' cy='30' r='1'/%3E%3Ccircle cx='60' cy='12' r='.7'/%3E%3Ccircle cx='110' cy='44' r='1.2'/%3E%3Ccircle cx='168' cy='20' r='.8'/%3E%3Ccircle cx='200' cy='70' r='1'/%3E%3Ccircle cx='36' cy='84' r='.7'/%3E%3Ccircle cx='88' cy='100' r='1'/%3E%3Ccircle cx='140' cy='120' r='.7'/%3E%3Ccircle cx='190' cy='140' r='1.1'/%3E%3Ccircle cx='20' cy='150' r='.9'/%3E%3Ccircle cx='66' cy='168' r='.7'/%3E%3Ccircle cx='120' cy='188' r='1'/%3E%3Ccircle cx='160' cy='200' r='.8'/%3E%3Ccircle cx='208' cy='178' r='.7'/%3E%3Ccircle cx='44' cy='208' r='1'/%3E%3Ccircle cx='96' cy='56' r='.6'/%3E%3Ccircle cx='150' cy='76' r='.6'/%3E%3C/g%3E%3C/svg%3E";
const GRAIN_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

function Starfield() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div className="ly-stars ly-stars-a" style={{ opacity: 0.5 }} />
      <div className="ly-stars ly-stars-b" style={{ opacity: 0.28 }} />
    </div>
  );
}

// painterly red + ice-blue ink-cloud blobs
function Blobs({ intense = false }) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div className="ly-blob" style={{ top: intense ? '-6%' : '-16%', left: '-22%', width: 360, height: 360, background: 'var(--blobA)', opacity: intense ? 0.5 : 0.32 }} />
      <div className="ly-blob" style={{ top: intense ? '6%' : '-4%', right: '-26%', width: 320, height: 320, background: 'var(--blobB)', opacity: intense ? 0.42 : 0.26 }} />
      {intense && <div className="ly-blob" style={{ bottom: '6%', left: '8%', width: 300, height: 300, background: 'var(--blobA)', opacity: 0.22 }} />}
    </div>
  );
}

function Grain() {
  return <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', backgroundImage: `url("${GRAIN_URL}")`, backgroundSize: '160px', opacity: 0.05, mixBlendMode: 'overlay' }} />;
}

// full-screen shell
function Screen({ children, center = false, blobs = false, intense = false, top = 66, bottom = 46, pad = 22, style = {}, contentStyle = {} }) {
  return (
    <div className="ly-screen" style={style}>
      <Starfield />
      {blobs && <Blobs intense={intense} />}
      <Grain />
      <div style={{
        position: 'relative', zIndex: 2, minHeight: '100%', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
        justifyContent: center ? 'center' : 'flex-start',
        padding: `${top}px ${pad}px ${bottom}px`, ...contentStyle,
      }}>
        {children}
      </div>
    </div>
  );
}

// mono eyebrow with a leading tick
function Eyebrow({ children, tick = true, style = {} }) {
  return (
    <div className="ly-eyebrow" style={style}>
      {tick && <span className="ly-tick" />}{children}
    </div>
  );
}

function Btn({ children, onClick, variant = 'cta', full = true, disabled = false, arrow = false, style = {} }) {
  return (
    <button className={`ly-btn ly-btn-${variant}${disabled ? ' is-disabled' : ''}`} onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ width: full ? '100%' : undefined, ...style }}>
      {children}{arrow && <span className="ly-btn-arrow">→</span>}
    </button>
  );
}

function PageDots({ total, index }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, k) => (
        <span key={k} style={{ width: k === index ? 20 : 6, height: 6, borderRadius: 9999, background: k <= index ? 'var(--highlight)' : 'var(--line-strong)', transition: 'all .35s cubic-bezier(.4,0,.2,1)' }} />
      ))}
    </div>
  );
}

function ScaleMeter({ scale = 1, label }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {[1, 2, 3].map(n => (
          <span key={n} style={{ width: 6, height: 6, borderRadius: '50%', border: '1.4px solid var(--primary)', background: n <= scale ? 'var(--primary)' : 'transparent' }} />
        ))}
      </span>
      {label && <span className="ly-eyebrow" style={{ margin: 0 }}>{label}</span>}
    </div>
  );
}

function Tag({ children, active = false, style = {} }) {
  return <span className={`ly-tag${active ? ' is-active' : ''}`} style={style}>{children}</span>;
}

// mono section number, e.g. 01 / 05
function NumLabel({ n, of, style = {} }) {
  return <span className="ly-num" style={style}>{String(n).padStart(2, '0')}{of ? <span style={{ opacity: 0.5 }}> / {String(of).padStart(2, '0')}</span> : null}</span>;
}

function useToast() {
  const [msg, setMsg] = React.useState(null);
  const show = React.useCallback((m) => {
    setMsg(m); clearTimeout(window.__lyToastT);
    window.__lyToastT = setTimeout(() => setMsg(null), 2200);
  }, []);
  const node = (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 96, zIndex: 80, display: 'flex', justifyContent: 'center', pointerEvents: 'none', opacity: msg ? 1 : 0, transform: msg ? 'translateY(0)' : 'translateY(8px)', transition: 'all .3s ease' }}>
      {msg && (
        <div style={{ background: 'var(--highlight)', color: '#000', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '11px 18px', borderRadius: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>{msg}</div>
      )}
    </div>
  );
  return [show, node];
}

Object.assign(window, { Starfield, Blobs, Grain, Screen, Eyebrow, Btn, PageDots, ScaleMeter, Tag, NumLabel, useToast });
