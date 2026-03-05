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
                    <a href="#" className="nav-wordmark">
                        chorum<span>.</span>
                    </a>
                    <div className="nav-links">
                        <a href="#scenarios">Scenarios</a>
                        <a href="#features">Features</a>
                        <a href="#architecture">Architecture</a>
                        <Link href="https://github.com/callmesparky42/ChorumAI">GitHub</Link>
                        <button onClick={handleSignIn} className="btn-nav">Sign In</button>
                    </div>
                </div>
            </nav>

            <section className="hero">
                <div className="hero-content">
                    <span className="hero-label">The Sovereign Context Layer for AI</span>
                    <h1>Your Context.<br /><span className="highlight">Their Chorus.</span></h1>
                    <p className="hero-subtitle">
                        One interface, every AI model. Your memory stays with you: encrypted, portable, sovereign.
                        Self-hosted, your rules.
                    </p>
                    <div className="hero-ctas">
                        <button onClick={handleSignIn} className="btn-primary">
                            Get Started
                        </button>
                        <a href="#scenarios" className="btn-secondary">
                            See How It Works
                        </a>
                    </div>
                </div>
            </section>

            <section className="inversion">
                <div className="inversion-inner">
                    <p className="inversion-statement">
                        "We don't use their memory.<br />
                        <em>We are the memory.</em>"
                    </p>
                </div>
            </section>

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

                        <div
                            className="scenarios-track"
                            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                        >
                            {/* Scenario 1: Provider Outage */}
                            <div className="scenario-card">
                                <div className="scenario-content">
                                    <div className="scenario-text">
                                        <span className="scenario-problem">The Outage Problem</span>
                                        <h3>You have Claude, you have GPT, and maybe Perplexity. What happens when one goes down?</h3>
                                        <p>
                                            You're mid-flow, deep in a debugging session. Then Claude goes down.
                                            You switch to GPT, but now you're starting from scratch.
                                            All that context? Gone. Your momentum? Dead.
                                        </p>
                                        <div className="scenario-solution">
                                            <strong>With Chorum:</strong> Configure your providers once. When one goes down, Chorum automatically routes to the next—with your full conversation context intact. Your work never stops.
                                        </div>
                                    </div>
                                    <div className="scenario-image">
                                        <div style={{ fontFamily: 'monospace', background: 'var(--hg-surface)', padding: '1.5rem', border: '1px solid var(--hg-border)', textAlign: 'left', fontSize: '0.82rem', lineHeight: '1.9', width: '100%' }}>
                                            <div style={{ color: 'var(--hg-text-tertiary)' }}># provider failover</div>
                                            <div style={{ color: 'var(--hg-accent)', marginTop: '0.5rem' }}>→ claude-3-5-sonnet</div>
                                            <div style={{ color: 'var(--hg-destructive)', marginTop: '0.25rem' }}>  ✗ rate limit (429)</div>
                                            <div style={{ color: 'var(--hg-accent-warm)', marginTop: '0.5rem' }}>→ gpt-4o</div>
                                            <div style={{ color: 'var(--hg-success)', marginTop: '0.25rem' }}>  ✓ routing with context</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '1rem', borderTop: '1px dashed var(--hg-border)', paddingTop: '0.75rem', fontSize: '0.75rem' }}>847 tokens injected • 0ms gap</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Scenario 2: The Context Problem */}
                            <div className="scenario-card">
                                <div className="scenario-content">
                                    <div className="scenario-text">
                                        <span className="scenario-problem">The Context Problem</span>
                                        <h3>"Always use Zod for validation." You've told Claude this 47 times this month.</h3>
                                        <p>
                                            Every new conversation starts at zero. Your patterns, your preferences, your project's architectural decisions—forgotten.
                                            You spend the first 5 messages of every chat re-establishing context that should already exist.
                                        </p>
                                        <div className="scenario-solution">
                                            <strong>With Chorum:</strong> The Conductor learns your patterns and automatically injects them when they matter. Tell Claude once. Chorum remembers forever—and knows when to surface it.
                                        </div>
                                    </div>
                                    <div className="scenario-image">
                                        <div style={{ fontFamily: 'monospace', background: 'var(--hg-surface)', padding: '1.5rem', border: '1px solid var(--hg-border)', textAlign: 'left', fontSize: '0.82rem', lineHeight: '1.8', width: '100%' }}>
                                            <div style={{ color: 'var(--hg-accent)' }}>// typescript-validation</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)' }}>// usageCount: 47 | confidence: 0.94</div>
                                            <div style={{ color: 'var(--hg-border-subtle)', marginTop: '0.5rem' }}>---</div>
                                            <div style={{ color: 'var(--hg-text-primary)', marginTop: '0.5rem' }}>"Always use Zod for runtime validation.</div>
                                            <div style={{ color: 'var(--hg-text-primary)' }}>Parse, don't validate. Schema-first."</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '1rem' }}>→ auto-injected when context matches</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Scenario 3: The Lock-In Problem */}
                            <div className="scenario-card">
                                <div className="scenario-content">
                                    <div className="scenario-text">
                                        <span className="scenario-problem">The Lock-In Problem</span>
                                        <h3>Six months of Claude conversations. Now you want to try GPT-5. What happens to all that context?</h3>
                                        <p>
                                            Your conversation history lives in their silos. Your project context is trapped in each provider's separate universe.
                                            Switching means starting over. You're not a customer—you're a hostage.
                                        </p>
                                        <div className="scenario-solution">
                                            <strong>With Chorum:</strong> Your memory is yours. Encrypted at rest, portable by design. Export your entire context in one click. Switch providers without losing a single insight.
                                        </div>
                                    </div>
                                    <div className="scenario-image">
                                        <div style={{ fontFamily: 'monospace', background: 'var(--hg-surface)', padding: '1.5rem', border: '1px solid var(--hg-border)', textAlign: 'left', fontSize: '0.82rem', lineHeight: '1.8', width: '100%' }}>
                                            <div style={{ color: 'var(--hg-accent-warm)' }}>$ chorum export --project "my-startup"</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '0.5rem' }}>{'>'} passphrase: ********</div>
                                            <div style={{ color: 'var(--hg-text-secondary)', marginTop: '0.5rem' }}>✓ 142 patterns</div>
                                            <div style={{ color: 'var(--hg-text-secondary)' }}>✓ 38 decisions</div>
                                            <div style={{ color: 'var(--hg-text-secondary)' }}>✓ 12 invariants</div>
                                            <div style={{ color: 'var(--hg-accent)', marginTop: '0.5rem' }}>✓ my-startup-2026.chorum</div>
                                            <div style={{ color: 'var(--hg-text-tertiary)', marginTop: '0.75rem', fontSize: '0.75rem' }}>AES-256-GCM • 2.3 MB</div>
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

            <section className="paradigm">
                <div className="paradigm-inner">
                    <span className="section-label">The Inversion</span>
                    <h2>Old World → Chorum</h2>
                    <table className="paradigm-table">
                        <thead>
                            <tr>
                                <th>Before</th>
                                <th>With Chorum</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>Ads injected into your conversations</td><td>Zero ads. Zero tracking. Zero "personalization."</td></tr>
                            <tr><td>Your context locked in each provider's silo</td><td>Your context portable across all providers</td></tr>
                            <tr><td>Memory stored in their plaintext logs</td><td>Memory encrypted at rest, your keys</td></tr>
                            <tr><td>Hit a rate limit, lose your thread</td><td>Hit a limit, seamless failover with full context</td></tr>
                            <tr><td>One model's opinion</td><td>Peer review across models</td></tr>
                            <tr><td>They decide what you can access</td><td>You decide: cloud, local, or both</td></tr>
                            <tr><td>Export? What export?</td><td>One-click export, encrypted or plaintext</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="features" id="features">
                <div className="features-inner">
                    <div className="features-header">
                        <span className="section-label">Capabilities</span>
                        <h2>One conversation. Every AI.</h2>
                    </div>
                    <div className="features-grid">
                        {[
                            ['01', 'Sovereign Memory Layer', 'Your context learns and evolves. Patterns, decisions, and invariants extracted from conversations. Cross-provider continuity. Confidence scoring ensures the right context surfaces at the right time. Encrypted at rest with AES-256-GCM. You control the keys.'],
                            ['02', 'Multi-Voice Chorus', 'Claude for reasoning, GPT for code, Gemini for speed, local Llama for privacy. Same conversation, different voices as needed. The router picks the right model for the task.'],
                            ['03', 'Automatic Continuity', "Hit Claude's rate limit? Chorum fails over to GPT with full context. Provider down? Automatic reroute. Your work never stops."],
                            ['04', 'Cross-Provider Peer Review', 'Have Claude write code and GPT review it for security. Request architectural review from a different model. Automated pair programming across providers.'],
                            ['05', 'Privacy by Default', 'Self-hosted. API keys secured locally. PII auto-redacted before sending. Complete audit logs you control.'],
                            ['06', 'Local Model Integration', 'First-class Ollama support. Seamless cloud-to-local switching. When you need privacy, offline access, or zero-cost inference: same interface, same memory.'],
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

            <section className="architecture" id="architecture">
                <div className="architecture-inner">
                    <div className="architecture-header">
                        <span className="section-label">Under the Hood</span>
                        <h2>The Sovereign Stack</h2>
                        <p>Four layers working together: your memory stays sovereign, the Conductor lets you see and steer it, the router optimizes every request, and the providers become interchangeable performers.</p>
                    </div>

                    <div className="arch-stack">
                        <div className="arch-layer-expanded">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon memory">◈</div>
                                <div className="arch-layer-title">
                                    <h3>Sovereign Memory Layer</h3>
                                    <span>Your context, encrypted and portable</span>
                                </div>
                            </div>
                            <div className="arch-layer-body">
                                <div className="arch-detail"><h4>Relevance Gating</h4><p>Query classification determines token budget (<code>0–8K</code>). Semantic similarity scores each memory item. Only relevant context gets injected—not your entire history.</p></div>
                                <div className="arch-detail"><h4>Local Embeddings</h4><p>All embedding generation via <code>all-MiniLM-L6-v2</code>. No API calls, no data leakage, ~2ms latency per query classification.</p></div>
                                <div className="arch-detail"><h4>Encrypt at Rest</h4><p>AES-256-GCM encryption with PBKDF2 key derivation. Content encrypted, embeddings in cleartext index (lossy projections). Decrypt only selected items.</p></div>
                                <div className="arch-detail"><h4>Learning Types</h4><p><strong>Patterns</strong> (coding conventions), <strong>Decisions</strong> (architectural choices), <strong>Invariants</strong> (rules that must never break), <strong>Facts</strong> (project context).</p></div>
                            </div>
                        </div>

                        <div className="arch-layer-expanded conductor-layer">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon conductor">♫</div>
                                <div className="arch-layer-title">
                                    <h3>The Conductor</h3>
                                    <span>Sovereign context with learning you can see</span>
                                </div>
                            </div>
                            <div className="conductor-split">
                                <div className="conductor-explanation">
                                    <p>Every AI tool claims to learn from you. None of them show you what they learned or let you correct it when they're wrong.</p>
                                    <p>The Conductor is different. After every response, you see exactly which memories shaped it — the actual items, with controls to pin what matters and mute what doesn't.</p>
                                    <div className="conductor-pills">
                                        <span className="conductor-pill">Pin what matters</span>
                                        <span className="conductor-pill">Mute what doesn't</span>
                                        <span className="conductor-pill">Tune memory depth</span>
                                        <span className="conductor-pill">Feedback that learns</span>
                                    </div>
                                    <div className="conductor-audiences">
                                        <p><strong>For developers:</strong> Full observability: scores, retrieval reasons, decay curves, co-occurrence bonuses.</p>
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

                        <div className="arch-layer-expanded">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon router">⊕</div>
                                <div className="arch-layer-title">
                                    <h3>Intelligent Router</h3>
                                    <span>Context preservation, capability matching, auto-fallback</span>
                                </div>
                            </div>
                            <div className="arch-layer-body">
                                <div className="arch-detail"><h4>Task Inference</h4><p>Analyzes your prompt to determine task type: coding, research, creative, analysis. Routes to the model with the best capability match while preserving your context.</p></div>
                                <div className="arch-detail"><h4>Learning & Adaptation</h4><p>Tracks which models work best for your specific use cases. Continuously adapts routing to match your workflow patterns.</p></div>
                                <div className="arch-detail"><h4>Fallback Chains</h4><p>Define your preference order. If Claude is down or rate-limited, automatic failover to GPT → Gemini → local Ollama. Context preserved across the switch.</p></div>
                                <div className="arch-detail"><h4>Quality Scoring</h4><p>Track which models perform best for your specific use cases. The router learns your preferences and patterns over time.</p></div>
                            </div>
                        </div>

                        <div className="arch-layer-expanded">
                            <div className="arch-layer-header">
                                <div className="arch-layer-icon providers">⋮</div>
                                <div className="arch-layer-title">
                                    <h3>Provider Chorus</h3>
                                    <span>Interchangeable performers, unified interface</span>
                                </div>
                            </div>
                            <div className="arch-layer-body">
                                <div className="arch-detail"><h4>Cloud Providers</h4><p>Anthropic (Claude), OpenAI (GPT), Google (Gemini), Perplexity. Bring your own API keys. Each provider's strengths available on demand.</p></div>
                                <div className="arch-detail"><h4>Local Models</h4><p>First-class Ollama integration. Run Llama, Mistral, or any GGUF model locally. Zero cost, full privacy, offline capable.</p></div>
                                <div className="arch-detail"><h4>Unified Response</h4><p>Regardless of which provider answers, responses are normalized. Cost tracked. Usage logged. Memory updated. Conversation continues seamlessly.</p></div>
                                <div className="arch-detail"><h4>Phone a Friend</h4><p>Request peer review from a different provider. Claude writes, GPT reviews for security. Cross-provider validation with confidence scoring.</p></div>
                            </div>
                        </div>
                    </div>

                    <div className="arch-flow-note">
                        <h4>Request Flow</h4>
                        <div className="arch-flow-steps">
                            <span>Your prompt</span>
                            <span className="arrow">→</span>
                            <span>Query classification</span>
                            <span className="arrow">→</span>
                            <span>Conductor scoring</span>
                            <span className="arrow">→</span>
                            <span>Context injection</span>
                            <span className="arrow">→</span>
                            <span>Route to provider</span>
                            <span className="arrow">→</span>
                            <span>Response + learning</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="cta-section">
                <div className="cta-inner">
                    <h2>Take back your context.</h2>
                    <p>Your memory, your rules.</p>
                    <div className="hero-ctas">
                        <button onClick={handleSignIn} className="btn-primary">
                            Get Started
                        </button>
                        <Link href="https://chorumdocs.vercel.app" className="btn-secondary">
                            View Documentation
                        </Link>
                    </div>
                </div>
            </section>

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
