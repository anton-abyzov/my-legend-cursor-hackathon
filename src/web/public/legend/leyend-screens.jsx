// leyend-screens.jsx — the flow screens (ChainZoku-inspired)
// Exported: WelcomeScreen, QuizScreen, SeekScreen, RevealScreen, QuestScreen,
//           CompleteScreen, ShareScreen, JournalScreen

function Chevron({ dir = 'left' }) {
  return (
    <svg width="11" height="18" viewBox="0 0 11 18" fill="none" style={{ transform: dir === 'right' ? 'scaleX(-1)' : 'none' }}>
      <path d="M9 1L2 9l7 8" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>);

}
function Check() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3 3 6-7.5" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function TopBar({ onBack, label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 30, marginBottom: 18 }}>
      <div style={{ width: 40, display: 'flex' }}>{onBack && <button className="ly-icon-btn" onClick={onBack} aria-label="Back"><Chevron /></button>}</div>
      {label && <div className="ly-eyebrow" style={{ margin: 0 }}>{label}</div>}
      <div style={{ width: 40, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>);

}

// ───────────────────────── Welcome ─────────────────────────
function WelcomeScreen({ onBegin, onSignIn }) {
  return (
    <Screen blobs intense top={62} bottom={48} contentStyle={{ justifyContent: 'space-between' }}>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div className="ly-reticle"><Compass size={104} primary="var(--primary)" ink="var(--ink)" ring="var(--secondary)" faint="var(--primary)" spin /></div>
        <img src="assets/legend-logo.png" alt="Legend" className="ly-logo ly-float" style={{ marginTop: 26 }} />
        <div className="ly-eyebrow" style={{ marginTop: 18, justifyContent: 'center' }}><span className="ly-tick" />Take a side. Live a legend.</div>
        <p className="ly-note" style={{ textAlign: 'center', maxWidth: 280, marginTop: 14 }}>The universe deals you a quest. You decide if you have the nerve to live it.</p>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, alignItems: 'center', margin: "40px 0px 0px" }}>
        <Btn onClick={onBegin} arrow>Mint your legend</Btn>
        <a className="ly-link" href="https://github.com/anton-abyzov/my-legend-cursor-hackathon/releases/latest" target="_blank" rel="noopener noreferrer">Download desktop app</a>
        <button className="ly-link" onClick={onSignIn}>I already walk a path</button>
      </div>
    </Screen>);

}

// ───────────────────────── Sign in ─────────────────────────
function SignInScreen({ onContinue, onBack }) {
  const [name, setName] = React.useState('');
  const submit = () => { const v = name.trim(); if (v) onContinue(v); };
  return (
    <Screen blobs top={60} bottom={44} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar onBack={onBack} label="Welcome back" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="ly-eyebrow"><span className="ly-tick" />Welcome back</div>
        <h1 className="ly-h1" style={{ marginTop: 10 }}>{'Reclaim your\npath'}</h1>
        <p className="ly-note">Speak the name on your legend to return to your constellation.</p>
        <div className="ly-field" style={{ marginTop: 24 }}>
          <span className="ly-field-caret">&gt;</span>
          <input className="ly-input" autoFocus value={name} placeholder="The name on your legend" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
      </div>
      <Btn onClick={submit} disabled={!name.trim()} arrow style={{ marginTop: 38 }}>Enter your path</Btn>
    </Screen>);

}

// ───────────────────────── Quiz ─────────────────────────
function QuizScreen({ onComplete, onBack }) {
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState({});
  const [legend, setLegend] = React.useState('');
  const [age, setAge] = React.useState(QUIZ.find((q) => q.kind === 'slider')?.default || 26);
  const q = QUIZ[step];
  const last = step === QUIZ.length - 1;
  const answered = q.kind === 'slider' ? true : q.kind === 'text' ? q.optional || legend.trim() : answers[q.id] != null;

  const choose = (opt, idx) => setAnswers((a) => ({ ...a, [q.id]: opt.label, [q.id + '_i']: idx }));
  const next = () => {
    if (!answered) return;
    if (last) {
      const final = { ...answers, age };
      if (legend.trim()) final.legend = legend.trim();
      onComplete(final);
    } else setStep((s) => s + 1);
  };
  const back = () => {if (step === 0) onBack && onBack();else setStep((s) => s - 1);};

  return (
    <Screen top={60} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <button className="ly-icon-btn" onClick={back} aria-label="Back"><Chevron /></button>
        <PageDots total={QUIZ.length} index={step} />
        <div style={{ width: 34 }} />
      </div>

      <div key={step} className="ly-step-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 6 }}>
        <div className="ly-eyebrow"><NumLabel n={step + 1} of={QUIZ.length} /></div>
        <h1 className="ly-h1" style={{ marginTop: 10 }}>{q.prompt}</h1>
        <p className="ly-note">{q.note}</p>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {q.kind === 'slider' &&
          <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
                <span style={{ fontFamily: 'var(--heading)', fontWeight: 400, fontSize: 92, lineHeight: 0.9, letterSpacing: '0.01em', color: 'var(--ink)' }}>{age}</span>
                <span className="ly-num" style={{ fontSize: 14 }}>{q.unit}</span>
              </div>
              <input className="ly-slider" type="range" min={q.min} max={q.max} value={age} onChange={(e) => setAge(+e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <span className="ly-num">{q.min}</span><span className="ly-num">{q.max}</span>
              </div>
            </div>
          }
          {q.kind === 'choice' && q.options.map((opt, idx) => {
            const sel = answers[q.id + '_i'] === idx;
            return (
              <button key={idx} className={`ly-option${sel ? ' is-sel' : ''}`} onClick={() => choose(opt, idx)}>
                <span className="ly-num" style={{ marginRight: 14 }}>{String(idx + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{opt.label}</span>
                <span className={`ly-radio${sel ? ' is-sel' : ''}`}>{sel && <Check />}</span>
              </button>);

          })}
          {q.kind === 'binary' &&
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {q.options.map((opt, idx) => {
              const sel = answers[q.id + '_i'] === idx;
              return (
                <button key={idx} className={`ly-binary${sel ? ' is-sel' : ''}`} onClick={() => choose(opt, idx)}>{opt.label}</button>);

            })}
            </div>
          }
          {q.kind === 'text' &&
          <div className="ly-field">
              <span className="ly-field-caret">&gt;</span>
              <input className="ly-input" autoFocus value={legend} placeholder={q.placeholder} onChange={(e) => setLegend(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} />
            </div>
          }
        </div>
      </div>

      <Btn onClick={next} disabled={!answered} arrow style={{ marginTop: 38 }}>{last ? 'Consult the universe' : q.kind === 'text' ? 'Skip for now' : 'Continue'}</Btn>
    </Screen>);

}

// ───────────────────────── Seek (trigger) ─────────────────────────
function SeekScreen({ triggerType, answers, exclude, onReveal, onBack }) {
  const sub = triggerType === 'card' ? 'Lay your hand on the spread. One card will rise.' :
  triggerType === 'phone' ? 'A signal is reaching for you across the dark.' :
  'Cast the die. Where it lands, your path begins.';
  return (
    <Screen blobs top={60} bottom={44} contentStyle={{ justifyContent: 'space-between' }}>
      <TopBar onBack={onBack} label="The Omen" />
      <div style={{ textAlign: 'center', marginTop: 2 }}>
        <h1 className="ly-h1" style={{ fontSize: 33 }}>Ask, and the<br />universe answers</h1>
        <p className="ly-note" style={{ maxWidth: 280, margin: '12px auto 0', textAlign: 'center' }}>{sub}</p>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TriggerStage type={triggerType} onReveal={onReveal} answers={answers} exclude={exclude} />
      </div>
      <div style={{ height: 6 }} />
    </Screen>);

}

// ───────────────────────── Reveal ─────────────────────────
function RevealScreen({ quest, onAccept, onReroll }) {
  return (
    <Screen blobs intense top={68} bottom={44} center contentStyle={{ justifyContent: 'center', textAlign: 'center', alignItems: 'center' }}>
      <div className="ly-reveal-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="ly-eyebrow" style={{ justifyContent: 'center' }}><span className="ly-tick" />{quest.omen}</div>
        <div style={{ position: 'relative', margin: '20px 0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="ly-glow" />
          <Sigil style={{ fontSize: 70, color: 'var(--primary)', position: 'relative', textShadow: '0 0 24px var(--glow)' }}>{quest.sigil}</Sigil>
        </div>
        <h1 className="ly-display" style={{ marginTop: 8, maxWidth: 330 }}>{quest.title}</h1>
        <div style={{ margin: '16px 0 18px' }}><ScaleMeter scale={quest.scale} label={SCALES[quest.scale]} /></div>
        <p className="ly-essence" style={{ maxWidth: 320 }}>{quest.essence}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 32, width: '100%' }}>
          <Btn onClick={onAccept} arrow>Accept the quest</Btn>
          <button className="ly-link" onClick={onReroll}>Ask again</button>
        </div>
      </div>
    </Screen>);

}

// ───────────────────────── Quest in progress ─────────────────────────
function QuestScreen({ quest, done, onToggle, onComplete, onBack }) {
  const count = done.filter(Boolean).length;
  return (
    <Screen top={60} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar onBack={onBack} label="Active Quest" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Sigil style={{ fontSize: 38, color: 'var(--primary)', textShadow: '0 0 18px var(--glow)' }}>{quest.sigil}</Sigil>
        <h1 className="ly-h1" style={{ fontSize: 28, lineHeight: 1.04 }}>{quest.title}</h1>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <Tag><ScaleMeter scale={quest.scale} label={SCALES[quest.scale]} /></Tag>
        <Tag style={{ textTransform: 'capitalize' }}>{quest.theme}</Tag>
      </div>
      <p className="ly-essence" style={{ marginTop: 18 }}>{quest.essence}</p>

      <div className="ly-eyebrow" style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
        <span>The Rituals</span><span>{String(count).padStart(2, '0')} / {String(quest.rituals.length).padStart(2, '0')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
        {quest.rituals.map((r, i) =>
        <button key={i} className={`ly-ritual${done[i] ? ' is-done' : ''}`} onClick={() => onToggle(i)}>
            <span className={`ly-radio${done[i] ? ' is-sel' : ''}`}>{done[i] && <Check />}</span>
            <span>{r}</span>
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 18 }} />
      <Btn onClick={onComplete} disabled={count === 0} arrow>{count === quest.rituals.length ? 'Seal this legend' : 'I have lived this'}</Btn>
    </Screen>);

}

// ───────────────────────── Proof of legend ─────────────────────────
const PROOF_ACCEPT = 'image/*,video/*,.png,.jpg,.jpeg,.gif,.webp,.heic,.mp4,.mov,.m4v,.webm,.avi,.mkv';

function isVideoFile(file) {
  return (file.type && file.type.startsWith('video/')) || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name || '');
}

function isImageFile(file) {
  return (file.type && file.type.startsWith('image/')) || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name || '');
}

// Read one picked file into a { src, kind } proof item. Images are downscaled to
// a jpeg data URL; videos are kept as-is (data URL) so they can play in previews.
function readProofFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    if (isVideoFile(file)) {
      reader.onload = (ev) => resolve({ src: ev.target.result, kind: 'video' });
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = (ev) => {
      const image = new Image();
      image.onload = () => {
        const max = 900, sc = Math.min(1, max / Math.max(image.width, image.height));
        const c = document.createElement('canvas');
        c.width = Math.round(image.width * sc); c.height = Math.round(image.height * sc);
        c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
        let out;
        try { out = c.toDataURL('image/jpeg', 0.82); } catch (err) { out = ev.target.result; }
        resolve({ src: out, kind: 'image' });
      };
      image.onerror = () => resolve({ src: ev.target.result, kind: 'image' });
      image.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Normalize proof (array of items, or a legacy single data-url string) to items.
function proofItems(proof) {
  if (Array.isArray(proof)) return proof.filter(Boolean);
  if (proof) return [{ src: proof, kind: 'image' }];
  return [];
}

function proofForDisplay(proof, outputUrl) {
  const items = proofItems(proof);
  if (items.length) return items;
  if (outputUrl) return [{ src: outputUrl, kind: 'video' }];
  return [];
}

function lySharePageUrl(jobId) {
  const bp = LY_BASE || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${bp}/s/${jobId}`;
}

function ProofMedia({ item, alt }) {
  if (!item) return null;
  if (item.kind === 'video') {
    return <video src={item.src} muted loop autoPlay playsInline />;
  }
  return <img src={item.src} alt={alt || 'your proof'} />;
}

function ProofScreen({ quest, onSubmit, onBack }) {
  const [items, setItems] = React.useState([]);
  const inputRef = React.useRef(null);
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    Promise.all(files.map(readProofFile)).then((results) => {
      const next = results.filter(Boolean);
      if (next.length) setItems((prev) => prev.concat(next));
    });
  };
  return (
    <Screen top={60} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar onBack={onBack} label="Proof of Legend" />
      <div className="ly-eyebrow"><span className="ly-tick" />Prove you lived it</div>
      <h1 className="ly-h1" style={{ marginTop: 10, fontSize: 31 }}>{quest.title}</h1>
      <p className="ly-essence" style={{ marginTop: 12, fontSize: 16 }}>{quest.essence}</p>
      <div className="ly-eyebrow" style={{ marginTop: 20 }}>Your proof</div>
      <p className="ly-note" style={{ marginTop: 6 }}>{quest.proof || 'Capture the moment. Upload photos or videos as proof it was real.'}</p>

      <input ref={inputRef} type="file" accept={PROOF_ACCEPT} capture="environment" multiple onChange={onFiles} style={{ display: 'none' }} />
      <div className={`ly-upload${items.length ? ' has-img' : ''}`} onClick={() => inputRef.current && inputRef.current.click()} style={{ marginTop: 22 }}>
        {items.length ? (
          <React.Fragment>
            <div className="ly-proof-grid">
              {items.map((it, i) => (
                <div className="ly-proof-cell" key={i}>
                  {it.kind === 'video'
                    ? <video src={it.src} muted loop autoPlay playsInline className="ly-proof-thumb" />
                    : <img src={it.src} alt={`proof ${i + 1}`} className="ly-proof-thumb" />}
                </div>
              ))}
            </div>
            <div className="ly-upload-redo"><span className="ly-num">↺ Tap to add more · {items.length} selected</span></div>
          </React.Fragment>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div className="ly-upload-plus">+</div>
            <div className="ly-eyebrow" style={{ justifyContent: 'center', marginTop: 14 }}>Tap to upload</div>
            <div className="ly-note" style={{ textAlign: 'center', margin: '4px auto 0' }}>Photos or videos — pick as many as you like</div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 18 }} />
      <Btn onClick={() => onSubmit(items.length ? items : null)} disabled={!items.length} arrow style={{ marginTop: 18 }}>Seal this legend</Btn>
      <button className="ly-link" onClick={() => onSubmit(null)} style={{ margin: '12px auto 0', display: 'block' }}>Keep this one private</button>
    </Screen>);

}

// ───────────────────────── Completion ─────────────────────────
function CompleteScreen({ quest, tagline, proof, outputUrl, onShare, onJournal }) {
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const media = proofForDisplay(proof, outputUrl);
  return (
    <Screen blobs intense top={70} bottom={44} center contentStyle={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      {[...Array(8)].map((_, k) => <span key={k} className="ly-mote" style={{ left: `${8 + k * 11}%`, animationDelay: `${k * 0.45}s` }} />)}
      <div className="ly-reveal-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="ly-glow" />
          {media.length ? (
            <div className="ly-polaroid">
              <ProofMedia item={media[0]} />
              <span className="ly-polaroid-badge"><Sigil style={{ fontSize: 20, color: 'var(--primary)' }}>{quest.sigil}</Sigil></span>
            </div>
          ) : (
            <div className="ly-seal"><Sigil style={{ fontSize: 42, color: 'var(--primary)' }}>{quest.sigil}</Sigil></div>
          )}
        </div>
        <div className="ly-eyebrow" style={{ marginTop: 24, justifyContent: 'center' }}><span className="ly-tick" />Quest lived · {today}</div>
        <h1 className="ly-display" style={{ marginTop: 10, maxWidth: 330 }}>{quest.title}</h1>
        <p className="ly-essence" style={{ maxWidth: 300, marginTop: 14 }}>{tagline ? `“${tagline}”` : 'Another thread woven into your legend.'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 34, width: '100%' }}>
          <Btn onClick={onShare} arrow>Share your legend</Btn>
          <button className="ly-link" onClick={onJournal}>Return to your path</button>
        </div>
      </div>
    </Screen>);

}

// ───────────────────────── Share (collectible card) ─────────────────────────
function ShareScreen({ quest, tagline, completed, proof, outputUrl, jobId, publicView, onBack, toast }) {
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const edition = String(completed || 0).padStart(3, '0');
  const media = proofForDisplay(proof, outputUrl);
  const actions = ['Share to Stories', 'Copy link', 'Save image'];

  const onAction = async (label, i) => {
    if (i === 1 && jobId) {
      const url = lySharePageUrl(jobId);
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      } catch (_) {
        toast('Could not copy link');
      }
      return;
    }
    if (i === 1) {
      toast('No share link yet');
      return;
    }
    toast(i === 2 ? 'Saved to gallery' : 'Shared to story');
  };

  return (
    <Screen top={60} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar onBack={publicView ? null : onBack} label="Share" />
      <div className="ly-share-card">
        <Starfield />
        <div className="ly-share-holo" />
        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <img src="assets/legend-logo.png" alt="Legend" className="ly-logo-sm" />
            <span className="ly-num">Nº {edition}</span>
          </div>
          <div className="ly-share-media">
            {media.length ? <ProofMedia item={media[0]} /> : <Sigil style={{ fontSize: 64, color: 'var(--primary)', textShadow: '0 0 26px var(--glow)' }}>{quest.sigil}</Sigil>}
            <span className="ly-share-media-tag">A quest, lived</span>
          </div>
          <div style={{ textAlign: 'center', padding: '2px 0 4px' }}>
            <div className="ly-h1" style={{ fontSize: 26, lineHeight: 1.02 }}>{quest.title}</div>
            {!media.length && <p className="ly-essence" style={{ fontSize: 14.5, maxWidth: 250, margin: '12px auto 0' }}>{quest.essence}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="ly-num">{tagline ? tagline.slice(0, 22) : 'A TRAVELER'}</span>
            <span className="ly-num">{today}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        {actions.map((a, i) =>
        <Btn key={a} variant={i === 0 ? 'cta' : 'ghost'} onClick={() => onAction(a, i)}>{a}</Btn>
        )}
      </div>
      {publicView && (
        <button className="ly-link" onClick={() => { window.location.href = (LY_BASE || '') + '/'; }} style={{ margin: '14px auto 0', display: 'block' }}>Start your own legend</button>
      )}
    </Screen>);

}

// ───────────────────────── Journal (hub) ─────────────────────────
function JournalScreen({ tagline, completed, active, onSeek, onOpenActive }) {
  return (
    <Screen blobs top={62} bottom={92} contentStyle={{ justifyContent: 'flex-start' }}>
      <div className="ly-eyebrow"><span className="ly-tick" />Your Path</div>
      <h1 className="ly-h1" style={{ fontSize: 34, marginTop: 8 }}>{tagline ? tagline : 'Your legend\nso far'}</h1>

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <div className="ly-stat">
          <div className="ly-stat-n">{String(completed.length).padStart(2, '0')}</div>
          <div className="ly-eyebrow" style={{ margin: 0 }}>Quests lived</div>
        </div>
        <div className="ly-stat">
          <div className="ly-stat-n">{String(completed.length + (active ? 1 : 0)).padStart(2, '0')}</div>
          <div className="ly-eyebrow" style={{ margin: 0 }}>Threads begun</div>
        </div>
      </div>

      <div className="ly-eyebrow" style={{ marginTop: 28 }}>Your Constellation</div>
      <div className="ly-timeline">
        {active &&
        <div className="ly-node" onClick={onOpenActive} style={{ cursor: 'pointer' }}>
            <span className="ly-node-dot is-active"><Sigil style={{ fontSize: 16, color: '#000' }}>{active.sigil}</Sigil></span>
            <div className="ly-node-card is-active">
              <div className="ly-eyebrow" style={{ margin: 0, color: 'var(--primary)' }}>In progress</div>
              <div className="ly-node-title">{active.title}</div>
              <div className="ly-note" style={{ margin: '7px 0 0', fontSize: 13 }}>{active.essence}</div>
              <div className="ly-eyebrow" style={{ marginTop: 11, color: 'var(--primary)' }}>Prove you lived it →</div>
            </div>
          </div>
        }
        {completed.length === 0 && !active &&
        <div className="ly-node">
            <span className="ly-node-dot" />
            <div className="ly-node-card" style={{ opacity: 0.75 }}>
              <div className="ly-node-title" style={{ color: 'var(--ink-soft)' }}>Your story begins here.</div>
            </div>
          </div>
        }
        {completed.map((c, i) =>
        <div className="ly-node" key={i}>
            <span className="ly-node-dot"><Sigil style={{ fontSize: 15, color: 'var(--primary)' }}>{c.sigil}</Sigil></span>
            <div className="ly-node-card">
              <div className="ly-eyebrow" style={{ margin: 0 }}>{c.date}</div>
              <div className="ly-node-title">{c.title}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 12 }} />
      <div className="ly-dock"><Btn onClick={onSeek} arrow>Seek a new quest</Btn></div>
    </Screen>);

}

// ═══════════════════════════════════════════════════════════════
//  Legend render pipeline — Upload → Cooking → Verify (AI grade)
// ═══════════════════════════════════════════════════════════════

const LY_CFG = (typeof window !== 'undefined' && window.LEGEND_CFG) || { basePath: '' };
const LY_BASE = LY_CFG.basePath || '';
function lyApiPath(p) { return `${LY_BASE}${p}`; }

function lyBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

// Map a hardcoded Legend quest + quiz answers onto the server's job body.
function lyPersona(answers) {
  const age = Number(answers && answers.age);
  if (!age) return 'Gen Z';
  if (age <= 27) return 'Gen Z';
  if (age <= 43) return 'Millennial';
  return 'Gen X';
}
function lyQuestBody(quest, answers) {
  const fd = new FormData();
  fd.append('title', quest.title);
  fd.append('sideQuest', quest.title);
  fd.append('questSlug', quest.id);
  fd.append('persona', lyPersona(answers));
  fd.append('style', 'raw proof');
  fd.append('aspect', 'vertical');
  fd.append('targetDuration', '18');
  // This is the CLAIM the verifier checks the footage against.
  fd.append('prompt', `The user claims they completed this side quest: "${quest.title}". ${quest.essence || ''} Verify the uploaded footage genuinely shows this action happening.`);
  const diff = { 1: 'easy', 2: 'medium', 3: 'hard' }[quest.scale];
  if (diff) fd.append('questDifficulty', diff);
  fd.append('questXp', String((quest.scale || 0) * 100));
  return fd;
}

// ───────────────────────── Upload (photo + video proof) ─────────────────────────
function UploadScreen({ quest, answers, onCooking, onBack }) {
  const [files, setFiles] = React.useState([]);
  const [previewUrl, setPreviewUrl] = React.useState(null);
  const [previewKind, setPreviewKind] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [progress, setProgress] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onPick = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setErr(null);
    setFiles(picked);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const first = picked[0];
    setPreviewKind(isVideoFile(first) ? 'video' : 'image');
    setPreviewUrl(URL.createObjectURL(first));
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const begin = () => {
    if (!files.length || busy) return;
    setBusy(true); setErr(null); setProgress(0);
    const fd = lyQuestBody(quest, answers);
    for (const f of files) fd.append('videos', f);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', lyApiPath('/api/quests'));
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300) {
        onCooking(body.job.id);
      } else {
        setErr(body.message || body.error || 'Upload failed');
        setBusy(false);
      }
    };
    xhr.onerror = () => { setErr('Upload failed'); setBusy(false); };
    xhr.ontimeout = () => { setErr('Upload failed'); setBusy(false); };
    xhr.send(fd);
  };

  return (
    <Screen top={60} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar onBack={onBack} label="Proof of Legend" />
      <div className="ly-eyebrow"><span className="ly-tick" />Bring back the footage</div>
      <h1 className="ly-h1" style={{ marginTop: 10, fontSize: 31 }}>{quest.title}</h1>
      <p className="ly-note" style={{ marginTop: 8 }}>{quest.proof || 'Upload your raw photos or clips. The AI will verify they prove the quest.'}</p>

      <input ref={inputRef} type="file" accept={PROOF_ACCEPT} multiple onChange={onPick} style={{ display: 'none' }} />
      <div className={`ly-upload ly-upload-video${files.length ? ' has-img' : ''}`} onClick={() => inputRef.current && inputRef.current.click()} style={{ marginTop: 20 }}>
        {previewUrl ? (
          <React.Fragment>
            {previewKind === 'video'
              ? <video src={previewUrl} muted playsInline preload="metadata" />
              : <img src={previewUrl} alt="" />}
            <div className="ly-upload-scrim" />
            <div className="ly-upload-redo"><span className="ly-num">↺ Tap to choose other media</span></div>
          </React.Fragment>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div className="ly-upload-clap">🎬</div>
            <div className="ly-eyebrow" style={{ justifyContent: 'center', marginTop: 14 }}>Tap to add photos or clips</div>
            <div className="ly-note" style={{ textAlign: 'center', margin: '4px auto 0' }}>Mix images and video — we cut the best of it</div>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <div className="ly-eyebrow" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{files.length} file{files.length === 1 ? '' : 's'}</span><span>{lyBytes(totalSize)}</span>
          </div>
          {files.slice(0, 4).map((f, i) => (
            <div className="ly-clip-row" key={i}>
              <span className="ly-clip-ix"><span className="ly-num">{String(i + 1).padStart(2, '0')}</span></span>
              <span className="ly-clip-name">{f.name}{isImageFile(f) ? ' · photo' : isVideoFile(f) ? ' · clip' : ''}</span>
              <span className="ly-num">{lyBytes(f.size)}</span>
            </div>
          ))}
          {files.length > 4 && <div className="ly-note" style={{ margin: 0 }}>+ {files.length - 4} more</div>}
        </div>
      )}

      {err && <p className="ly-note" style={{ color: 'var(--primary)', marginTop: 14 }}>{err}</p>}

      {busy && (
        <div style={{ marginTop: 18 }}>
          <div className="ly-bar">
            <div className="ly-bar-fill" style={{ width: progress + '%' }}>
              <div className="ly-bar-shine" />
            </div>
          </div>
          <div className="ly-eyebrow" style={{ marginTop: 8 }}>
            {progress >= 100
              ? 'Sending to the verifier…'
              : <span>Uploading <span className="ly-num">{progress}%</span> · <span className="ly-num">{lyBytes(progress / 100 * totalSize)}</span> / <span className="ly-num">{lyBytes(totalSize)}</span></span>}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 18 }} />
      <Btn onClick={begin} disabled={!files.length || busy} arrow style={{ marginTop: 18 }}>{busy ? (progress >= 100 ? 'Verifying…' : `Uploading ${progress}%…`) : 'Verify my proof'}</Btn>
    </Screen>);

}

// ───────────────────────── Cooking (parallel render) ─────────────────────────
const LY_STAGES = [
  { key: 'upload', label: 'Ingest' },
  { key: 'verify', label: 'Verify' },
];

function CookingScreen({ jobId, quest, onVerify, onRetry, onBack }) {
  const [job, setJob] = React.useState(null);
  const [pct, setPct] = React.useState(6);
  const [failed, setFailed] = React.useState(null);
  const timerRef = React.useRef(null);
  const easeRef = React.useRef(null);
  const procStart = React.useRef(null);
  const targetRef = React.useRef(6);
  const aliveRef = React.useRef(true);

  // Derive a smooth pseudo-progress target from job status + elapsed time.
  const computeTarget = (j) => {
    if (!j) return 6;
    if (j.status === 'queued') return 8;
    if (j.status === 'complete') return 100;
    if (j.status === 'failed') return targetRef.current;
    // processing — asymptotic ramp 15% → 90%
    if (!procStart.current) procStart.current = Date.now();
    const elapsed = (Date.now() - procStart.current) / 1000;
    return 15 + (90 - 15) * (1 - Math.exp(-elapsed / 38));
  };

  React.useEffect(() => {
    aliveRef.current = true;
    const poll = async () => {
      try {
        const res = await fetch(lyApiPath(`/api/quests/${jobId}`), { credentials: 'same-origin' });
        const body = await res.json();
        if (!aliveRef.current) return;
        if (!res.ok) throw new Error(body.message || body.error || 'Lost the signal');
        const j = body.job;
        setJob(j);
        targetRef.current = computeTarget(j);
        if (j.status === 'complete') {
          setPct(100);
          setTimeout(() => { if (aliveRef.current) onVerify(j); }, 650);
          return;
        }
        if (j.status === 'failed') {
          setFailed(j.error || 'The verifier collapsed mid-check.');
          return;
        }
        timerRef.current = setTimeout(poll, 2200);
      } catch (e) {
        if (!aliveRef.current) return;
        timerRef.current = setTimeout(poll, 2600);
      }
    };
    poll();
    // ease the displayed number toward the moving target
    easeRef.current = setInterval(() => {
      setPct((p) => {
        const t = targetRef.current;
        if (Math.abs(t - p) < 0.4) return t;
        return p + (t - p) * 0.12;
      });
    }, 110);
    return () => {
      aliveRef.current = false;
      clearTimeout(timerRef.current);
      clearInterval(easeRef.current);
    };
  }, [jobId]);

  const stageState = (key) => {
    const stages = job && job.progress && job.progress.stages;
    if (Array.isArray(stages)) {
      const st = stages.find((s) => s && s.key === key);
      if (st && st.status) return st.status;
    }
    // fallback heuristic from overall pct
    if (key === 'upload') return pct > 18 ? 'done' : 'active';
    if (key === 'verify') return pct >= 99 ? 'done' : pct > 18 ? 'active' : 'pending';
    return 'pending';
  };

  if (failed) {
    return (
      <Screen blobs top={64} bottom={44} center contentStyle={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div className="ly-reveal-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Sigil style={{ fontSize: 54, color: 'var(--primary)', textShadow: '0 0 24px var(--glow)' }}>⚠</Sigil>
          <div className="ly-eyebrow" style={{ marginTop: 18, justifyContent: 'center' }}><span className="ly-tick" />The check broke</div>
          <h1 className="ly-h1" style={{ marginTop: 8, fontSize: 30 }}>The verifier faltered</h1>
          <p className="ly-note" style={{ textAlign: 'center', maxWidth: 300, marginTop: 10 }}>{String(failed).split('\n')[0].slice(0, 220)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 30, width: '100%' }}>
            <Btn onClick={onRetry} arrow>Try another take</Btn>
            <button className="ly-link" onClick={onBack}>Back to your path</button>
          </div>
        </div>
      </Screen>);

  }

  const shown = Math.round(Math.min(100, Math.max(0, pct)));
  return (
    <Screen blobs intense top={60} bottom={40} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar label="The Verdict" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 4 }}>
        <div className="ly-cook-orb">
          <div className="ly-cook-ring is-spin" />
          <div className="ly-cook-pct">{shown}%</div>
        </div>
        <div className="ly-eyebrow" style={{ marginTop: 18, justifyContent: 'center' }}><span className="ly-tick" />Verifying your proof</div>
        <h1 className="ly-h1" style={{ marginTop: 8, fontSize: 28 }}>{quest.title}</h1>
        <p className="ly-note" style={{ textAlign: 'center', maxWidth: 300, marginTop: 8 }}>The universe is watching your footage to judge whether you truly lived this quest. Stay with it.</p>
      </div>

      <div className="ly-bar" style={{ marginTop: 22 }}>
        <div className="ly-bar-fill" style={{ width: `${shown}%` }}>{shown > 4 && shown < 100 && <span className="ly-bar-shine" />}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
        {LY_STAGES.map((s) => {
          const st = stageState(s.key);
          return (
            <div className="ly-stage-row" key={s.key}>
              <span className={`ly-stage-dot${st === 'active' ? ' is-active' : ''}${st === 'done' ? ' is-done' : ''}`} />
              <span style={{ color: st === 'pending' ? 'var(--ink-faint)' : 'var(--ink)' }}>{s.label}</span>
            </div>);

        })}
      </div>

      <div style={{ flex: 1, minHeight: 12 }} />
    </Screen>);

}

// ───────────────────────── Verify (AI proof gate) ─────────────────────────
const LY_DECISION = {
  pass:   { label: 'VERIFIED',  glyph: '✓', color: '#3ad29f', tone: 'Proof accepted' },
  flag:   { label: 'NEEDS REVIEW', glyph: '?', color: '#f5c451', tone: 'Sent for a human look' },
  reject: { label: 'NOT VERIFIED', glyph: '✕', color: 'var(--primary)', tone: 'Proof rejected' },
};

function VerificationVerdict({ verification }) {
  const decision = (verification && verification.decision) || 'flag';
  const meta = LY_DECISION[decision] || LY_DECISION.flag;
  const confidencePct = Math.round((Number(verification && verification.confidence) || 0) * 100);

  return (
    <div className="ly-verify-flip" style={{ marginTop: 14 }}>
      <div className="ly-verify-flip-head">AI verification</div>
      <div className="ly-grade" style={{ marginTop: 10, borderColor: meta.color }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 30, lineHeight: 1, color: meta.color }} aria-hidden="true">{meta.glyph}</span>
          <div>
            <div className="ly-grade-verdict" style={{ color: meta.color }}>{meta.label}</div>
            <div className="ly-num" style={{ marginTop: 2 }}>{confidencePct}% confidence</div>
          </div>
        </div>
        {verification && verification.reason && (
          <p className="ly-note" style={{ marginTop: 10 }}>{verification.reason}</p>
        )}
        {verification && verification.evidence && (
          <p className="ly-verify-flip-note" style={{ marginTop: 8 }}><strong>Evidence:</strong> {verification.evidence}</p>
        )}
        {decision !== 'pass' && verification && verification.missing && (
          <p className="ly-verify-flip-note" style={{ marginTop: 6 }}><strong>Missing:</strong> {verification.missing}</p>
        )}
      </div>
    </div>);

}

function VerifyScreen({ job, quest, proof, onSeal, onRetry }) {
  const result = (job && job.result) || {};
  const verification = (job && job.verification) || null;
  const decision = (verification && verification.decision) || 'flag';
  // Prefer the in-session raw proof (instant, local), fall back to the server
  // copy (needed for shared/public views). The server URL is base-path aware.
  const local = proofForDisplay(proof, result.proofUrl)[0] || null;
  const mediaSrc = (local && local.src) || result.proofUrl || null;
  const mediaKind = (local && local.kind) || result.proofKind || 'video';

  return (
    <Screen top={58} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar label="The Verdict" />
      <div className="ly-eyebrow"><span className="ly-tick" />The universe has watched it</div>
      <h1 className="ly-h1" style={{ marginTop: 8, fontSize: 29 }}>{quest.title}</h1>

      {mediaSrc ? (
        mediaKind === 'image'
          ? <img className="ly-verify-video" style={{ marginTop: 16 }} src={mediaSrc} alt="Your proof" />
          : <video className="ly-verify-video" style={{ marginTop: 16 }} src={mediaSrc} controls playsInline preload="metadata" />
      ) : (
        <div className="ly-verify-video" style={{ marginTop: 16, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="ly-num">Proof unavailable</span>
        </div>
      )}

      <VerificationVerdict verification={verification} />

      <div style={{ flex: 1, minHeight: 18 }} />
      {decision === 'pass' ? (
        <Btn onClick={() => onSeal(job)} arrow style={{ marginTop: 18 }}>Seal this legend</Btn>
      ) : (
        <Btn onClick={onRetry} arrow style={{ marginTop: 18 }}>Try another take</Btn>
      )}
      <button className="ly-link" onClick={decision === 'pass' ? onRetry : () => onSeal(job)} style={{ margin: '12px auto 0', display: 'block' }}>
        {decision === 'pass' ? 'Try another take' : 'Keep anyway'}
      </button>
    </Screen>);

}

Object.assign(window, { WelcomeScreen, SignInScreen, QuizScreen, SeekScreen, RevealScreen, QuestScreen, ProofScreen, CompleteScreen, ShareScreen, JournalScreen, TopBar, UploadScreen, CookingScreen, VerifyScreen, lyApiPath, lySharePageUrl, proofForDisplay });