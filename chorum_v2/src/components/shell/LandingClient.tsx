'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'

export function LandingClient() {
    const [currentSlide, setCurrentSlide] = useState(0)
    const totalSlides = 3

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % totalSlides)
        }, 12000)
        return () => clearInterval(timer)
    }, [])

    const goToSlide = (index: number) => setCurrentSlide(index)
    const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % totalSlides)
    const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides)
    const handleSignIn = () => signIn('google', { callbackUrl: '/chat' })

    return (
        <div className="landing-body">
            <nav className="landing-nav">
                <div className="nav-inner">
                    <a href="#" className="nav-wordmark">chorum<span>.</span></a>
                    <div className="nav-links">
                        <a href="#scenarios">Scenarios</a>
                        <a href="#features">Features</a>
                        <a href="#how-it-works">How It Works</a>
                        <Link href="https://github.com/callmesparky42/ChorumAI">GitHub</Link>
                        <button onClick={handleSignIn} className="btn-nav">Sign In</button>
                    </div>
                </div>
            </nav>

            {/* ── HERO ── */}
            <section className="hero">
                <div className="hero-content">
                    <span className="hero-label">AI Memory — Visible, Portable, Yours</span>
                    <h1>AI that learns<br /><span className="highlight">what works.</span></h1>
                    <p className="hero-subtitle">
                        Chorum extracts patterns from your conversations, shows you exactly what it learned,
                        and gets smarter over time. Your memory, your rules.
                    </p>
                    <div className="hero-ctas">
                        <button onClick={handleSignIn} className="btn-primary">Get Started</button>
                        <a href="#scenarios" className="btn-secondary">See How It Works</a>
                    </div>
                </div>
            </section>

            {/* ── INVERSION STATEMENT ── */}
            <section className="inversion">
                <div className="inversion-inner">
                    <p className="inversion-statement">
                        "Other AI tools learn in the dark.<br />
                        <em>Chorum learns in the open.</em>"
                    </p>
                </div>
            </section>

            {/* ── SCENARIOS ── */}
            <section className="scenarios" id="scenarios">
                <div className="scenarios-inner">
                    <div className="scenarios-header">
                        <span className="section-label">Real Problems, Real Solutions</span>
                        <h2>Sound Familiar?</h2>
                    </div>

                    <div className="scenarios-carousel">
                        <div className="carousel-arrows">
                            <button className="carousel-arrow" onClick={prevSlide}>←</button>
                            <button className="carousel-arrow" onClick={nextSlide}>→</button>
                        </div>

                        <div className="scenarios-track" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>

                            {/* Scenario 1: The Context Problem */}
                            <div className="scenario-card">
                                <div className="scenario-content">
                                    <div className="scenario-text">
                                        <span className="scenario-problem">The Context Problem</span>
                                        <h3>"Always use Zod for validation." You've told Claude this 47 times this month.</h3>
                                        <p>
                                            Every new conversation starts at zero. Your patterns, your preferences,
                                            your architectural decisions — forgotten. You spend the first five messages
                                            of every chat re-establishing context that should already exist.
                                        </p>
                                        <div className="scenario-solution">
                                            <strong>With Chorum:</strong> It learns your patterns automatically — no "remember this" commands.
                                            Tell it once. Chorum surfaces it when it matters and stays quiet when it doesn't.
                                        </div>
                                    </div>
                                    <div className="scenario-image">
                                        <div style={{ fontFamily: 'monospace', background: 'var(--hg-surface)', padding: '1.5rem', border: '1px solid var(--hg-border)', textAlign: 'left', fontSize: '0.82rem', lineHeight: '1.8', width: '100%' }}>
                                            <div style={{ color: 'var(--hg-accent)' }}>// learned: typescript-validation</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)' }}>// used 47x · confidence: 0.94</div>
                                            <div style={{ color: 'var(--hg-border-subtle)', marginTop: '0.5rem' }}>---</div>
                                            <div style={{ color: 'var(--hg-text-primary)', marginTop: '0.5rem' }}>"Always use Zod for runtime validation.</div>
                                            <div style={{ color: 'var(--hg-text-primary)' }}>Parse, don't validate. Schema-first."</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '1rem' }}>→ auto-injected when context matches</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '0.25rem', fontSize: '0.75rem' }}>domain: coding · type: preference</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Scenario 2: The Visibility Problem */}
                            <div className="scenario-card">
                                <div className="scenario-content">
                                    <div className="scenario-text">
                                        <span className="scenario-problem">The Visibility Problem</span>
                                        <h3>"What did it learn from that conversation?" You have no idea.</h3>
                                        <p>
                                            Every AI memory tool claims to learn from you. None of them show you what.
                                            You're training a system you can't inspect, can't correct, and can't trust.
                                            When it gives bad advice, you don't know why — and it'll do it again.
                                        </p>
                                        <div className="scenario-solution">
                                            <strong>With Chorum:</strong> After every response, you see exactly which memories shaped it.
                                            Pin what's useful. Mute what isn't. Ask "why did you say that?" — and get a real answer.
                                        </div>
                                    </div>
                                    <div className="scenario-image">
                                        <div style={{ background: 'var(--hg-bg)', border: '1px solid var(--hg-border)', width: '100%' }}>
                                            <div style={{ padding: '0.6rem 1rem', background: 'var(--hg-surface)', borderBottom: '1px solid var(--hg-border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--hg-text-tertiary)' }}>
                                                <span style={{ color: 'var(--hg-accent)' }}>♫ Conductor Trace</span>
                                                <span>3 items · 847 tokens</span>
                                            </div>
                                            <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--hg-border)', fontSize: '0.8rem', color: 'var(--hg-text-secondary)' }}>
                                                Chorum remembered 3 things
                                            </div>
                                            {[
                                                { tag: 'Rule', tagColor: '#f87171', tagBg: 'rgba(239,68,68,0.12)', label: 'Pinned', text: 'Always auth API routes before processing', pinned: true },
                                                { tag: 'Preference', tagColor: '#c084fc', tagBg: 'rgba(168,85,247,0.12)', label: '', text: 'Use Result<T,E> for error handling', pinned: false },
                                                { tag: 'Decision', tagColor: '#6ee7b7', tagBg: 'rgba(52,211,153,0.12)', label: '', text: 'Drizzle ORM for all DB operations', pinned: false },
                                            ].map((item) => (
                                                <div key={item.tag + item.text} style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--hg-border)', background: item.pinned ? 'var(--hg-accent-muted)' : 'transparent', borderLeft: item.pinned ? '2px solid var(--hg-accent)' : undefined }}>
                                                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.2rem', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', background: item.tagBg, color: item.tagColor }}>{item.tag}</span>
                                                        {item.label && <span style={{ fontSize: '0.68rem', color: 'var(--hg-accent)' }}>Pinned</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--hg-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</div>
                                                </div>
                                            ))}
                                            <div style={{ padding: '0.5rem 1rem', background: 'var(--hg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--hg-text-tertiary)' }}>
                                                <span>Memory Depth</span>
                                                <span style={{ color: 'var(--hg-accent)', background: 'var(--hg-accent-muted)', padding: '0.15rem 0.5rem' }}>Balanced</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Scenario 3: The Lock-In Problem */}
                            <div className="scenario-card">
                                <div className="scenario-content">
                                    <div className="scenario-text">
                                        <span className="scenario-problem">The Lock-In Problem</span>
                                        <h3>Six months of Claude conversations. Now you want to try GPT. What happens to all that context?</h3>
                                        <p>
                                            Your conversation history lives in their silos. Your patterns are trapped in
                                            each provider's separate universe. Switching means starting over.
                                            You're not a customer — you're a hostage.
                                        </p>
                                        <div className="scenario-solution">
                                            <strong>With Chorum:</strong> Your knowledge graph is encrypted, exportable, and yours.
                                            Switch providers without losing a single insight. Models are interchangeable — your memory isn't.
                                        </div>
                                    </div>
                                    <div className="scenario-image">
                                        <div style={{ fontFamily: 'monospace', background: 'var(--hg-surface)', padding: '1.5rem', border: '1px solid var(--hg-border)', textAlign: 'left', fontSize: '0.82rem', lineHeight: '1.8', width: '100%' }}>
                                            <div style={{ color: 'var(--hg-accent-warm)' }}>$ chorum export --project "my-startup"</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '0.5rem' }}>{'>'} passphrase: ********</div>
                                            <div style={{ color: 'var(--hg-text-secondary)', marginTop: '0.5rem' }}>✓ 142 patterns</div>
                                            <div style={{ color: 'var(--hg-text-secondary)' }}>✓ 38 decisions</div>
                                            <div style={{ color: 'var(--hg-text-secondary)' }}>✓ 12 rules</div>
                                            <div style={{ color: 'var(--hg-accent)', marginTop: '0.5rem' }}>✓ my-startup-2026.chorum</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '0.75rem', fontSize: '0.75rem' }}>AES-256-GCM · 2.3 MB · yours forever</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="carousel-dots">
                            {[0, 1, 2].map((index) => (
                                <button
                                    key={index}
                                    className={`carousel-dot ${currentSlide === index ? 'active' : ''}`}
                                    onClick={() => goToSlide(index)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── DIFFERENTIATORS (replaces paradigm table) ── */}
            <section className="paradigm">
                <div className="paradigm-inner" style={{ maxWidth: '1100px' }}>
                    <span className="section-label">Why Chorum</span>
                    <h2>What Makes It Different</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1px', background: 'var(--hg-border)', border: '1px solid var(--hg-border)', marginTop: '2rem' }}>
                        {[
                            {
                                title: 'Learning you can see',
                                body: 'Most AI memory is a black box. Chorum shows you exactly what it learned, why it surfaced something, and how confident it is. Disagree? Fix it with a tap.',
                            },
                            {
                                title: 'Memory that stays fresh',
                                body: 'Stale patterns fade. Useful ones get stronger. You\'re never getting advice from six months ago that no longer applies.',
                            },
                            {
                                title: 'Domain-aware context',
                                body: 'Coding patterns don\'t leak into your fiction writing. Your trading thesis doesn\'t appear when you\'re debugging. Chorum understands the difference.',
                            },
                            {
                                title: 'Portable by design',
                                body: 'Your knowledge is encrypted, exportable, and yours. Switch providers, switch platforms — your memory comes with you.',
                            },
                            {
                                title: 'Human always in the loop',
                                body: 'Chorum proposes changes based on what it observes. You approve or reject. Nothing updates without your say.',
                            },
                        ].map((d) => (
                            <div key={d.title} className="feature-card" style={{ background: 'var(--hg-bg)' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '0.6rem' }}>{d.title}</h3>
                                <p style={{ fontSize: '0.88rem' }}>{d.body}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section className="features" id="features">
                <div className="features-inner">
                    <div className="features-header">
                        <span className="section-label">Capabilities</span>
                        <h2>AI that learns how you work.</h2>
                    </div>
                    <div className="features-grid">
                        {[
                            ['01', 'Smart Memory', 'Chorum extracts patterns, decisions, and rules from your conversations — automatically. No manual note-taking. No "remember this" commands. It just learns.'],
                            ['02', 'Visible Learning', 'See what Chorum remembered after every response. Pin what matters. Mute what doesn\'t. You\'re not training a black box — you\'re building a knowledge system you can trust.'],
                            ['03', 'Fresh Context', 'Learnings earn confidence over time. New patterns start tentative. Proven ones grow stronger. Stale advice fades away. Your context stays relevant.'],
                            ['04', 'Domain Modes', 'Coding, writing, research, trading — Chorum understands the difference. Each domain has its own extraction rules and memory types. No cross-contamination.'],
                            ['05', 'Works Everywhere', 'Chat interface, VS Code, Claude Desktop, CLI. Same memory, every surface. Chorum is a backend, not just an app.'],
                            ['06', 'Your Data, Your Rules', 'Encrypted at rest. Exportable anytime. Self-hostable if you want. No lock-in, no hostage data, no "we own your context" fine print.'],
                        ].map(([num, title, desc]) => (
                            <div key={num} className="feature-card">
                                <div className="feature-number">{num}</div>
                                <h3>{title}</h3>
                                <p>{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className="architecture" id="how-it-works">
                <div className="architecture-inner">
                    <div className="architecture-header">
                        <span className="section-label">Under the Hood</span>
                        <h2>How Chorum Works</h2>
                        <p>Four layers working together so your AI gets smarter without getting in your way.</p>
                    </div>

                    <div className="arch-stack">

                        {/* Layer 1: Knowledge Graph */}
                        <div className="arch-layer-expanded">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon memory">◈</div>
                                <div className="arch-layer-title">
                                    <h3>Your Knowledge Graph</h3>
                                    <span>Everything Chorum learns lives here — tagged, searchable, exportable</span>
                                </div>
                            </div>
                            <div className="arch-layer-body">
                                <div className="arch-detail">
                                    <h4>Automatic Extraction</h4>
                                    <p>After every conversation, Chorum identifies patterns, decisions, and rules. No tagging, no commands. It reads what happened and records what matters.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Confidence System</h4>
                                    <p>Every learning starts tentative. When it keeps proving useful, confidence grows. When it stops being relevant, it fades. Your context stays current.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Domain Separation</h4>
                                    <p>Coding advice stays with coding. Writing notes stay with writing. Tag your knowledge however makes sense — Chorum keeps it organized and surfaces it in context.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Encrypted at Rest</h4>
                                    <p>AES-256-GCM encryption. Export anytime. Self-host if you want. Your knowledge graph is yours — not a feature of someone else's platform.</p>
                                </div>
                            </div>
                        </div>

                        {/* Layer 2: The Conductor */}
                        <div className="arch-layer-expanded conductor-layer">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon conductor">♫</div>
                                <div className="arch-layer-title">
                                    <h3>The Conductor</h3>
                                    <span>Learning you can see — and steer</span>
                                </div>
                            </div>
                            <div className="conductor-split">
                                <div className="conductor-explanation">
                                    <p>
                                        Every AI tool claims to learn from you. None of them show you what they
                                        learned or let you correct it when they're wrong.
                                    </p>
                                    <p>
                                        The Conductor is different. After every response, you see exactly
                                        which memories shaped it — not "context applied," but the actual
                                        items, with controls to keep what's useful and mute what isn't.
                                    </p>
                                    <div className="conductor-pills">
                                        <span className="conductor-pill">Pin what matters</span>
                                        <span className="conductor-pill">Mute what doesn't</span>
                                        <span className="conductor-pill">Tune memory depth</span>
                                        <span className="conductor-pill">Feedback that learns</span>
                                    </div>
                                    <div className="conductor-audiences">
                                        <p><strong>For developers:</strong> Full observability — scores, retrieval reasons, confidence curves, domain signals.</p>
                                        <p><strong>For everyone else:</strong> "Chorum remembered 3 things" with a tap to see them and a tap to fix them.</p>
                                    </div>
                                </div>
                                <div className="conductor-mock">
                                    <div className="mock-header">
                                        <div className="mock-header-left">
                                            <span className="mock-icon">♫</span>
                                            <span>Conductor Trace</span>
                                        </div>
                                        <span className="mock-meta">3 items · 847 tokens</span>
                                    </div>
                                    <div className="mock-collapsed">
                                        <span>Chorum remembered 3 things</span>
                                        <svg className="mock-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                    <div className="mock-items">
                                        <div className="mock-item pinned">
                                            <div className="mock-item-content">
                                                <div className="mock-item-tags">
                                                    <span className="mock-tag rule">Rule</span>
                                                    <span className="mock-pinned-label">Pinned</span>
                                                </div>
                                                <p>Always authenticate API routes before processing</p>
                                            </div>
                                        </div>
                                        <div className="mock-item">
                                            <div className="mock-item-content">
                                                <div className="mock-item-tags"><span className="mock-tag preference">Preference</span></div>
                                                <p>Use Result&lt;T,E&gt; pattern for error handling</p>
                                            </div>
                                        </div>
                                        <div className="mock-item">
                                            <div className="mock-item-content">
                                                <div className="mock-item-tags"><span className="mock-tag decision">Decision</span></div>
                                                <p>Drizzle ORM for all database operations</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mock-footer">
                                        <span>Memory Depth</span>
                                        <div className="mock-lens-buttons">
                                            <button className="mock-lens">Precise</button>
                                            <button className="mock-lens active">Balanced</button>
                                            <button className="mock-lens">Thorough</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Layer 3: Smart Injection */}
                        <div className="arch-layer-expanded">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon router">⊕</div>
                                <div className="arch-layer-title">
                                    <h3>Smart Injection</h3>
                                    <span>The right context, at the right time — not everything, always</span>
                                </div>
                            </div>
                            <div className="arch-layer-body">
                                <div className="arch-detail">
                                    <h4>Reads the Room</h4>
                                    <p>Chorum doesn't dump everything it knows into every conversation. Coding question? You get your coding patterns. Writing session? Your voice and style notes appear.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Learns What Helps</h4>
                                    <p>Thumbs up a suggestion that helped? Chorum remembers. Thumbs down something that missed? It learns that too. Over time, the same mistakes stop happening.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Auto-Failover</h4>
                                    <p>Claude down? Rate-limited? Chorum routes to your next provider with full context intact. Your work never stops. Providers are interchangeable — your memory isn't.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Ask Why</h4>
                                    <p>Every suggestion can be traced back to what Chorum learned and when. You're never left wondering where something came from.</p>
                                </div>
                            </div>
                        </div>

                        {/* Layer 4: Any Provider */}
                        <div className="arch-layer-expanded">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon providers">⋮</div>
                                <div className="arch-layer-title">
                                    <h3>Any Provider, Any Interface</h3>
                                    <span>Same knowledge, everywhere you work</span>
                                </div>
                            </div>
                            <div className="arch-layer-body">
                                <div className="arch-detail">
                                    <h4>Cloud Providers</h4>
                                    <p>Anthropic (Claude), OpenAI (GPT), Google (Gemini), Perplexity. Bring your own API keys. Each provider's strengths, available on demand.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Local Models</h4>
                                    <p>First-class Ollama support. Run Llama, Mistral, or any model locally. Zero cost, full privacy, offline capable.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Every Surface</h4>
                                    <p>Chat interface, VS Code, Claude Desktop, CLI. Chorum is a backend, not just an app. Your knowledge follows you wherever you work.</p>
                                </div>
                                <div className="arch-detail">
                                    <h4>Cross-Model Review</h4>
                                    <p>Have Claude write code, GPT review it for security holes. Different models, different strengths — same memory keeping it coherent.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="arch-flow-note">
                        <h4>Request Flow</h4>
                        <div className="arch-flow-steps">
                            <span>Your prompt</span>
                            <span className="arrow">→</span>
                            <span>Read the room</span>
                            <span className="arrow">→</span>
                            <span>Score memories</span>
                            <span className="arrow">→</span>
                            <span>Inject context</span>
                            <span className="arrow">→</span>
                            <span>Route to provider</span>
                            <span className="arrow">→</span>
                            <span>Response + learn</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="cta-section">
                <div className="cta-inner">
                    <h2>Take back your context.</h2>
                    <p>Your memory, your rules.</p>
                    <div className="hero-ctas">
                        <button onClick={handleSignIn} className="btn-primary">Get Started</button>
                        <Link href="https://chorumdocs.vercel.app" className="btn-secondary">View Documentation</Link>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="landing-footer">
                <div className="footer-inner">
                    <div className="footer-left">
                        <a href="#" className="nav-wordmark">chorum<span>.</span></a>
                        <div className="footer-links">
                            <Link href="https://github.com/callmesparky42/ChorumAI">GitHub</Link>
                            <Link href="https://chorumdocs.vercel.app">Docs</Link>
                        </div>
                    </div>
                    <div className="footer-right">
                        <div className="charity-note">
                            <span style={{ color: '#e25555' }}>♥</span> 50% of donations support World Central Kitchen
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
