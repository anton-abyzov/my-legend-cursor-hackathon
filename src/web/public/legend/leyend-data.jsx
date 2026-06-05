// leyend-data.jsx — Neo-Tokyo design tokens, content, and the compass reticle
// Exported: PALETTES, TYPES, QUIZ, QUESTS, SCALES, pickQuest, Compass, Sigil

// ─────────────────────────────────────────────────────────────
// Palettes — one deep navy-black world, three neon temperaments
// (ChainZoku-inspired: hot red-pink, icy blue, acid yellow-green)
// ─────────────────────────────────────────────────────────────
const BASE = {
  dark: true,
  bg: '#181c2e', bg2: '#1e2338',
  surface: 'rgba(255,255,255,0.045)', surfaceAlt: 'rgba(255,255,255,0.08)', surfaceSolid: '#222740',
  ink: '#FFFFFF', inkSoft: '#9298bb', inkFaint: 'rgba(146,152,187,0.55)',
  line: 'rgba(255,255,255,0.09)', star: 'rgba(255,255,255,0.42)',
};
const PALETTES = {
  'Aura': { ...BASE,
    primary: '#ff80cf', secondary: '#7b3fd8', highlight: '#d7df23',
    glow: 'rgba(255,128,207,0.42)', blobA: '#ff80cf', blobB: '#7b3fd8',
  },
  'Violet': { ...BASE,
    primary: '#7b3fd8', secondary: '#ff80cf', highlight: '#d7df23',
    glow: 'rgba(123,63,216,0.48)', blobA: '#7b3fd8', blobB: '#ff80cf',
  },
  'Volt': { ...BASE,
    primary: '#d7df23', secondary: '#7b3fd8', highlight: '#ff80cf',
    glow: 'rgba(215,223,35,0.36)', blobA: '#d7df23', blobB: '#ff80cf',
  },
};

// ─────────────────────────────────────────────────────────────
// Type pairings — Bebas Neue display + geometric sans + mono
// ─────────────────────────────────────────────────────────────
const TYPES = {
  'Bebas':   { display: "'Bebas Neue', system-ui, sans-serif",   heading: "'Bebas Neue', system-ui, sans-serif", body: "'Space Grotesk', system-ui, sans-serif", mono: "'Space Mono', ui-monospace, monospace", dScale: 1.0,  warp: false },
  'Stencil': { display: "'Black Ops One', system-ui, sans-serif", heading: "'Bebas Neue', system-ui, sans-serif", body: "'Space Grotesk', system-ui, sans-serif", mono: "'Space Mono', ui-monospace, monospace", dScale: 0.62, warp: false },
};

// ─────────────────────────────────────────────────────────────
// Onboarding quiz — Age · Gender · Heights · Love · Your legend
// ─────────────────────────────────────────────────────────────
const QUIZ = [
  {
    id: 'age', kind: 'slider', prompt: 'Your age',
    note: 'How many cycles have you run?',
    min: 16, max: 80, default: 26, unit: 'YRS',
  },
  {
    id: 'gender', kind: 'choice', prompt: 'Your gender',
    note: 'Identity is yours to declare.',
    options: [{ label: 'Woman' }, { label: 'Man' }, { label: 'Non-binary' }, { label: 'I decline to say' }],
  },
  {
    id: 'heights', kind: 'binary', prompt: 'Are you afraid of heights?',
    note: 'Be honest. No one is watching.',
    options: [{ label: 'Yes' }, { label: 'No' }],
  },
  {
    id: 'love', kind: 'binary', prompt: 'Are you afraid to love?',
    note: 'Every legend guards a heart.',
    options: [{ label: 'Yes' }, { label: 'No' }],
  },
  {
    id: 'legend', kind: 'text', optional: true, prompt: 'What is your legend?',
    note: 'Optional. Speak it, or leave it unwritten.',
    placeholder: 'I am the one who…',
  },
];

// ─────────────────────────────────────────────────────────────
// Quest pool · scale 1 = a single thread · 2 = a full run · 3 = an odyssey
// Each quest is one provable act. No sub-steps.
// ─────────────────────────────────────────────────────────────
const SCALES = { 1: 'Single thread', 2: 'A full run', 3: 'An odyssey' };

const QUESTS = [
  { id: 'unspoken', title: 'Speak the Unspoken', sigil: '✦', theme: 'connection', scale: 1,
    omen: 'The signal points toward the heart.',
    essence: 'Tell someone you love that you love them, out loud, before the day goes dark.',
    proof: 'Catch the moment, or the face that heard it.' },
  { id: 'stranger', title: "The Stranger's Hour", sigil: '✶', theme: 'connection', scale: 2,
    omen: 'A door you have never opened is online.',
    essence: 'Walk into a place you have never entered and learn the name of one stranger.',
    proof: 'Take a photo with the stranger you met.' },
  { id: 'compliment', title: 'The Honest Word', sigil: '❖', theme: 'connection', scale: 1,
    omen: 'Someone nearby needs to hear it today.',
    essence: 'Give a complete stranger a genuine compliment, and mean every word of it.',
    proof: 'Capture the smile that follows.' },
  { id: 'pottery', title: 'Shape the Clay', sigil: '◍', theme: 'wonder', scale: 1,
    omen: 'Your hands are restless for making.',
    essence: 'Go to a pottery class and make your own bowl or cup from raw clay.',
    proof: 'Photograph the thing you made, crooked edges and all.' },
  { id: 'tourist', title: 'Stranger in Your Own City', sigil: '⟡', theme: 'wonder', scale: 2,
    omen: 'Your city is hiding in plain sight.',
    essence: 'Spend a day as a tourist where you live. Do every touristy thing you always skip.',
    proof: 'Take the most shameless tourist photo you can.' },
  { id: 'sunrise', title: 'Chase the Light', sigil: '☾', theme: 'stillness', scale: 1,
    omen: 'The sky owes you a quiet moment.',
    essence: 'Watch a full sunrise or sunset, with no screen between you and it.',
    proof: 'Photograph the sky at its best.' },
  { id: 'climb', title: 'Find the Top', sigil: '◈', theme: 'courage', scale: 2,
    omen: 'Something tall is daring you upward.',
    essence: 'Go to a bouldering gym and finish a climb harder than you think you can.',
    proof: 'Get a shot of you on the wall, mid-climb.' },
  { id: 'skater', title: 'Push and Glide', sigil: '◇', theme: 'courage', scale: 2,
    omen: 'The board has been calling your name.',
    essence: 'Get on a skateboard and learn to ride it. Bonus nerve if a friend rolls with you.',
    proof: 'Film the ride, or the very first push.' },
  { id: 'tree', title: 'Plant What Outlives You', sigil: '✷', theme: 'change', scale: 1,
    omen: 'The earth is ready for your mark.',
    essence: 'Plant a tree. Prepare the soil, water it, and choose a place it can grow for years.',
    proof: 'Photograph the tree the day you planted it.' },
  { id: 'half', title: 'Thirteen Miles', sigil: '✺', theme: 'courage', scale: 3,
    omen: 'Your legs are stronger than your doubt.',
    essence: 'Train for, and finish, a half marathon.',
    proof: 'Capture the finish line. The medal is optional.' },
  { id: 'dance', title: 'Learn the Steps', sigil: '✧', theme: 'connection', scale: 1,
    omen: 'Music is asking your body to answer.',
    essence: 'Join a dance class and learn one dance, salsa, swing, whatever moves you.',
    proof: 'Film a few seconds of you dancing.' },
  { id: 'laststop', title: 'End of the Line', sigil: '✸', theme: 'wonder', scale: 2,
    omen: 'A route you do not know is waiting.',
    essence: 'Board a bus whose line you have never ridden, take it to the last stop, and explore.',
    proof: 'Photograph wherever the line leaves you.' },
  { id: 'magic', title: 'One Good Trick', sigil: '✤', theme: 'courage', scale: 1,
    omen: 'A little wonder is yours to give.',
    essence: 'Learn one magic trick, then perform it for a stranger.',
    proof: 'Catch their reaction on camera.' },
  { id: 'fish', title: 'Outwait the Water', sigil: '◎', theme: 'stillness', scale: 2,
    omen: 'The water is keeping something for you.',
    essence: 'Go to a lake, river, or pier and catch a fish of any kind.',
    proof: 'Photograph your catch before you let it go.' },
  { id: 'shelter', title: 'Be Trusted by an Animal', sigil: '❉', theme: 'stillness', scale: 1,
    omen: 'A creature is waiting to trust you.',
    essence: 'Visit an animal shelter and spend real time with the animals there.',
    proof: 'Take a photo with your new friend.' },
];

// Pick a quest, biased toward the heart the traveler is guarding.
function pickQuest(answers, exclude = []) {
  const theme = answers && answers.love === 'Yes' ? 'connection' : null;
  let pool = QUESTS.filter(q => !exclude.includes(q.id));
  if (!pool.length) pool = QUESTS.slice();
  const themed = theme ? pool.filter(q => q.theme === theme) : [];
  const src = themed.length ? themed : pool;
  return src[Math.floor(Math.random() * src.length)];
}

// ─────────────────────────────────────────────────────────────
// Compass reticle — geometric pinwheel rose, doubles as a HUD target
// ─────────────────────────────────────────────────────────────
function Compass({ size = 120, primary = '#FF2D55', ink = '#FFFFFF', ring, faint, spin = false, style = {} }) {
  ring = ring || ink; faint = faint || primary;
  const R = 38, i = 9, r2 = 21, j = 5;
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} style={{ display: 'block', overflow: 'visible', ...style }}
      className={spin ? 'ly-spin' : undefined}>
      <circle cx="0" cy="0" r="47" fill="none" stroke={ring} strokeWidth="1" strokeOpacity="0.45" />
      <circle cx="0" cy="0" r="42" fill="none" stroke={ring} strokeWidth="0.6" strokeOpacity="0.28" />
      {[0, 90, 180, 270].map(d => (
        <line key={d} x1="0" y1="-47" x2="0" y2="-43" stroke={primary} strokeWidth="1.6" transform={`rotate(${d})`} strokeLinecap="round" />
      ))}
      <g opacity="0.6">
        <polygon points={`0,0 ${r2*0.707},${-r2*0.707} ${j},${-j}`} fill={faint} />
        <polygon points={`0,0 ${r2*0.707},${r2*0.707} ${j},${j}`} fill={ink} />
        <polygon points={`0,0 ${-r2*0.707},${r2*0.707} ${-j},${j}`} fill={faint} />
        <polygon points={`0,0 ${-r2*0.707},${-r2*0.707} ${-j},${-j}`} fill={ink} />
      </g>
      {/* North */}
      <polygon points={`0,0 0,${-R} ${i},${-i}`} fill={primary} />
      <polygon points={`0,0 0,${-R} ${-i},${-i}`} fill={ink} />
      {/* East */}
      <polygon points={`0,0 ${R},0 ${i},${-i}`} fill={ink} />
      <polygon points={`0,0 ${R},0 ${i},${i}`} fill={primary} />
      {/* South */}
      <polygon points={`0,0 0,${R} ${i},${i}`} fill={ink} />
      <polygon points={`0,0 0,${R} ${-i},${i}`} fill={primary} />
      {/* West */}
      <polygon points={`0,0 ${-R},0 ${-i},${i}`} fill={ink} />
      <polygon points={`0,0 ${-R},0 ${-i},${-i}`} fill={primary} />
      <circle cx="0" cy="0" r="4.4" fill={ring} />
      <circle cx="0" cy="0" r="2" fill={primary} />
    </svg>
  );
}

function Sigil({ children, style = {} }) {
  return <span style={{ fontFamily: 'Georgia, serif', lineHeight: 1, ...style }}>{children}</span>;
}

Object.assign(window, { BASE, PALETTES, TYPES, QUIZ, QUESTS, SCALES, pickQuest, Compass, Sigil });
