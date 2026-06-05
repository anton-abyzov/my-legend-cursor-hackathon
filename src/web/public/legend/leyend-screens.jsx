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
        <button className="ly-link" onClick={onSignIn}>I already walk a path</button>
      </div>
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
function ProofScreen({ quest, onSubmit, onBack }) {
  const [img, setImg] = React.useState(null);
  const inputRef = React.useRef(null);
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const image = new Image();
      image.onload = () => {
        const max = 900, sc = Math.min(1, max / Math.max(image.width, image.height));
        const c = document.createElement('canvas');
        c.width = Math.round(image.width * sc); c.height = Math.round(image.height * sc);
        c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
        try { setImg(c.toDataURL('image/jpeg', 0.82)); } catch (err) { setImg(ev.target.result); }
      };
      image.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  return (
    <Screen top={60} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar onBack={onBack} label="Proof of Legend" />
      <div className="ly-eyebrow"><span className="ly-tick" />Prove you lived it</div>
      <h1 className="ly-h1" style={{ marginTop: 10, fontSize: 31 }}>{quest.title}</h1>
      <p className="ly-essence" style={{ marginTop: 12, fontSize: 16 }}>{quest.essence}</p>
      <div className="ly-eyebrow" style={{ marginTop: 20 }}>Your proof</div>
      <p className="ly-note" style={{ marginTop: 6 }}>{quest.proof || 'Capture the moment. Upload a photo as proof it was real.'}</p>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <div className={`ly-upload${img ? ' has-img' : ''}`} onClick={() => inputRef.current && inputRef.current.click()} style={{ marginTop: 22 }}>
        {img ? (
          <React.Fragment>
            <img src={img} alt="your proof" />
            <div className="ly-upload-redo"><span className="ly-num">↺ Tap to retake</span></div>
          </React.Fragment>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div className="ly-upload-plus">+</div>
            <div className="ly-eyebrow" style={{ justifyContent: 'center', marginTop: 14 }}>Tap to upload</div>
            <div className="ly-note" style={{ textAlign: 'center', margin: '4px auto 0' }}>A photo or screen-grab</div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 18 }} />
      <Btn onClick={() => onSubmit(img)} disabled={!img} arrow style={{ marginTop: 18 }}>Seal this legend</Btn>
      <button className="ly-link" onClick={() => onSubmit(null)} style={{ margin: '12px auto 0', display: 'block' }}>Keep this one private</button>
    </Screen>);

}

// ───────────────────────── Completion ─────────────────────────
function CompleteScreen({ quest, tagline, proof, onShare, onJournal }) {
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <Screen blobs intense top={70} bottom={44} center contentStyle={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      {[...Array(8)].map((_, k) => <span key={k} className="ly-mote" style={{ left: `${8 + k * 11}%`, animationDelay: `${k * 0.45}s` }} />)}
      <div className="ly-reveal-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="ly-glow" />
          {proof ? (
            <div className="ly-polaroid">
              <img src={proof} alt="your proof" />
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
function ShareScreen({ quest, tagline, completed, proof, onBack, toast }) {
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const edition = String(completed || 0).padStart(3, '0');
  const actions = ['Share to Stories', 'Copy link', 'Save image'];
  return (
    <Screen top={60} bottom={38} contentStyle={{ justifyContent: 'flex-start' }}>
      <TopBar onBack={onBack} label="Share" />
      <div className="ly-share-card">
        <Starfield />
        <div className="ly-share-holo" />
        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <img src="assets/legend-logo.png" alt="Legend" className="ly-logo-sm" />
            <span className="ly-num">Nº {edition}</span>
          </div>
          <div className="ly-share-media">
            {proof ? <img src={proof} alt="your proof" /> : <Sigil style={{ fontSize: 64, color: 'var(--primary)', textShadow: '0 0 26px var(--glow)' }}>{quest.sigil}</Sigil>}
            <span className="ly-share-media-tag">A quest, lived</span>
          </div>
          <div style={{ textAlign: 'center', padding: '2px 0 4px' }}>
            <div className="ly-h1" style={{ fontSize: 26, lineHeight: 1.02 }}>{quest.title}</div>
            {!proof && <p className="ly-essence" style={{ fontSize: 14.5, maxWidth: 250, margin: '12px auto 0' }}>{quest.essence}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="ly-num">{tagline ? tagline.slice(0, 22) : 'A TRAVELER'}</span>
            <span className="ly-num">{today}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
        {actions.map((a, i) =>
        <Btn key={a} variant={i === 0 ? 'cta' : 'ghost'} onClick={() => toast(i === 1 ? 'Link copied' : i === 2 ? 'Saved to gallery' : 'Shared to story')}>{a}</Btn>
        )}
      </div>
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

Object.assign(window, { WelcomeScreen, QuizScreen, SeekScreen, RevealScreen, QuestScreen, ProofScreen, CompleteScreen, ShareScreen, JournalScreen, TopBar });