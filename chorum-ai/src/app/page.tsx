'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Instrument_Sans } from 'next/font/google'
import './landing.css'

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument',
})

export default function LandingPage() {
  const [currentSlide, setCurrentSlide] = useState(0)
  const totalSlides = 3

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides)
    }, 8000)
    return () => clearInterval(timer)
  }, [totalSlides])

  const goToSlide = (index: number) => {
    setCurrentSlide(index)
  }

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides)
  }

  return (
    <div className={`landing-body ${instrumentSans.className}`}>
      <nav className="landing-nav">
        <div className="nav-inner">
          <Link href="#" className="logo">
            <img src="/chorumai.png" alt="Chorum AI" />
          </Link>
          <div className="nav-links">
            <Link href="#scenarios">Scenarios</Link>
            <Link href="#features">Features</Link>
            <Link href="#architecture">Architecture</Link>
            <Link href="/helpmemigrate">Migrate</Link>
            <Link href="https://github.com/callmesparky42/ChorumAI">GitHub</Link>
            <Link href="/app" className="btn-nav">Get Started</Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <span className="hero-label">The Sovereign Context Layer for AI</span>
          <h1>Your Context.<br /><span className="highlight">Their Chorus.</span></h1>
          <p className="hero-subtitle">
            One interface. Every AI model. Your memory stays with you—encrypted, portable, sovereign.
            Self-hosted. Your rules.
          </p>
          <div className="hero-ctas">
            <Link href="/app" className="btn-primary">
              Get Started
            </Link>
            <Link href="#scenarios" className="btn-secondary">
              See How It Works
            </Link>
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
              id="scenariosTrack"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {/* Scenario 1: Provider Outage */}
              <div className="scenario-card">
                <div className="scenario-content">
                  <div className="scenario-text">
                    <span className="scenario-problem">The Outage Problem</span>
                    <h3>You have Claude, you have GPT, and maybe Perplexity. What happens when Downdetector notifies you one of them is down?</h3>
                    <p>
                      You're mid-flow, deep in a debugging session. Then Claude goes down.
                      You switch to GPT—but now you're starting from scratch.
                      All that context? Gone. Your momentum? Dead.
                    </p>
                    <div className="scenario-solution">
                      <strong>With Chorum:</strong> Configure your providers once. When one goes down, Chorum automatically routes to the next—with your full conversation context intact. Your work never stops.
                    </div>
                  </div>
                  <div className="scenario-image">
                    <img src="/modelprovider.jpg" alt="Chorum Provider Settings showing Ollama, Claude, Gemini, and GPT configured with budgets" />
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
                      <strong>With Chorum:</strong> The relevance gating system learns your patterns and automatically injects them when they matter. Tell Claude once. Chorum remembers forever—and knows when to surface it.
                    </div>
                  </div>
                  <div className="scenario-image">
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'monospace', background: '#0f1218', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', textAlign: 'left', fontSize: '0.85rem', lineHeight: '1.8' }}>
                        <div style={{ color: 'var(--accent-azure)' }}>// Learned pattern: typescript-validation</div>
                        <div style={{ color: 'var(--text-secondary)' }}>// Usage count: 47 | Confidence: 0.94</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>---</div>
                        <div style={{ color: 'var(--text-primary)', marginTop: '0.5rem' }}>"Always use Zod for runtime validation.</div>
                        <div style={{ color: 'var(--text-primary)' }}>Parse, don't validate. Schema-first."</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>→ Auto-injected when context matches</div>
                      </div>
                      <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Patterns extracted from your conversations.<br />
                        Injected only when relevant.
                      </p>
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
                      <strong>With Chorum:</strong> Your memory is yours. Encrypted at rest, portable by design. Export your entire context in one click. Switch providers without losing a single insight. Models are interchangeable—you are the constant.
                    </div>
                  </div>
                  <div className="scenario-image">
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'monospace', background: '#0f1218', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', textAlign: 'left', fontSize: '0.85rem', lineHeight: '1.8' }}>
                        <div style={{ color: 'var(--accent-gold)' }}>$ chorum export --project "my-startup"</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>{'>'} Export passphrase: ********</div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>✓ 142 patterns</div>
                        <div style={{ color: 'var(--text-secondary)' }}>✓ 38 decisions</div>
                        <div style={{ color: 'var(--text-secondary)' }}>✓ 12 invariants</div>
                        <div style={{ color: 'var(--accent-azure)', marginTop: '0.5rem' }}>✓ Exported: my-startup-2026-01-23.chorum</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.8rem' }}>AES-256-GCM encrypted • 2.3 MB</div>
                      </div>
                      <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Your context. Your keys. Your choice.
                      </p>
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
              <tr>
                <td>Ads injected into your conversations</td>
                <td>Zero ads. Zero tracking. Zero "personalization."</td>
              </tr>
              <tr>
                <td>Your context locked in each provider's silo</td>
                <td>Your context portable across all providers</td>
              </tr>
              <tr>
                <td>Memory stored in their plaintext logs</td>
                <td>Memory encrypted at rest, your keys</td>
              </tr>
              <tr>
                <td>Hit a rate limit, lose your thread</td>
                <td>Hit a limit, seamless failover with full context</td>
              </tr>
              <tr>
                <td>One model's opinion</td>
                <td>Peer review across models</td>
              </tr>
              <tr>
                <td>They decide what you can access</td>
                <td>You decide—cloud, local, or both</td>
              </tr>
              <tr>
                <td>Export? What export?</td>
                <td>One-click export, encrypted or plaintext</td>
              </tr>
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
            <div className="feature-card">
              <div className="feature-number">01</div>
              <h3>Sovereign Memory Layer</h3>
              <p>Your context learns and evolves. Patterns, decisions, and invariants extracted from conversations. Cross-provider continuity verified through multi-day behavioral testing. Confidence scoring ensures the right context surfaces at the right time. Encrypted at rest with AES-256-GCM. You control the keys.</p>
            </div>

            <div className="feature-card">
              <div className="feature-number">02</div>
              <h3>Multi-Voice Chorus</h3>
              <p>Claude for reasoning. GPT for code. Gemini for speed. Local Llama for privacy. Same conversation, different voices as needed. The router picks the right model for the task.</p>
            </div>

            <div className="feature-card">
              <div className="feature-number">03</div>
              <h3>Automatic Continuity</h3>
              <p>Hit Claude's rate limit? Chorum fails over to GPT with full context. Provider down? Automatic reroute. Your work never stops. The GitHub issue with 79+ upvotes—solved.</p>
            </div>

            <div className="feature-card">
              <div className="feature-number">04</div>
              <h3>Cross-Provider Peer Review</h3>
              <p>Have Claude write code and GPT review it for security. Request architectural review from a different model. Automated pair programming across providers. Voices checking voices.</p>
            </div>

            <div className="feature-card">
              <div className="feature-number">05</div>
              <h3>Privacy by Default</h3>
              <p>Self-hosted. API keys secured locally. PII auto-redacted with Luhn validation before sending. Complete audit logs you control. The only plaintext is in RAM, only for the request.</p>
            </div>

            <div className="feature-card">
              <div className="feature-number">06</div>
              <h3>Local Model Integration</h3>
              <p>First-class Ollama and LM Studio support. Seamless cloud-to-local switching. When you need privacy, offline access, or zero-cost inference—same interface, same memory.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="architecture" id="architecture">
        <div className="architecture-inner">
          <div className="architecture-header">
            <span className="section-label">Under the Hood</span>
            <h2>The Sovereign Stack</h2>
            <p>Three layers working together: your memory stays sovereign, the router optimizes every request, and the providers become interchangeable performers.</p>
          </div>

          <div className="arch-stack">
            {/* Layer 1: Memory */}
            <div className="arch-layer-expanded">
              <div className="arch-layer-header">
                <div className="arch-layer-icon memory">◈</div>
                <div className="arch-layer-title">
                  <h3>Sovereign Memory Layer</h3>
                  <span>Your context, encrypted and portable</span>
                </div>
              </div>
              <div className="arch-layer-body">
                <div className="arch-detail">
                  <h4>Relevance Gating</h4>
                  <p>Query classification determines token budget (<code>0–8K</code>). Semantic similarity scores each memory item. Only relevant context gets injected—not your entire history.</p>
                </div>
                <div className="arch-detail">
                  <h4>Local Embeddings</h4>
                  <p>All embedding generation happens on your machine via <code>all-MiniLM-L6-v2</code>. No API calls, no data leakage, ~2ms latency per query classification.</p>
                </div>
                <div className="arch-detail">
                  <h4>Encrypt at Rest</h4>
                  <p>AES-256-GCM encryption with PBKDF2 key derivation. Content encrypted, embeddings in cleartext index (lossy projections—can{'\''}t reconstruct source). Decrypt only selected items.</p>
                </div>
                <div className="arch-detail">
                  <h4>Learning Types</h4>
                  <p><strong>Patterns</strong> (coding conventions), <strong>Decisions</strong> (architectural choices), <strong>Invariants</strong> (rules that must never break), <strong>Facts</strong> (project context). Each scored and gated independently.</p>
                </div>
              </div>
            </div>

            <div className="arch-connector">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>

            {/* Layer 2: Router */}
            <div className="arch-layer-expanded">
              <div className="arch-layer-header">
                <div className="arch-layer-icon router">⊕</div>
                <div className="arch-layer-title">
                  <h3>Intelligent Router</h3>
                  <span>Context preservation, capability matching, auto-fallback</span>
                </div>
              </div>
              <div className="arch-layer-body">
                <div className="arch-detail">
                  <h4>Task Inference</h4>
                  <p>Analyzes your prompt to determine task type: coding, research, creative, analysis. Routes to the model with the best capability match for that specific task while preserving your context.</p>
                </div>
                <div className="arch-detail">
                  <h4>Learning & Adaptation</h4>
                  <p>Learns from your interactions and preferences. Tracks which models work best for your specific use cases. Continuously adapts routing to match your workflow patterns.</p>
                </div>
                <div className="arch-detail">
                  <h4>Fallback Chains</h4>
                  <p>Define your preference order. If Claude is down or rate-limited, automatic failover to GPT → Gemini → local Ollama. Context preserved across the switch.</p>
                </div>
                <div className="arch-detail">
                  <h4>Quality Scoring</h4>
                  <p>Track which models perform best for your specific use cases. The router learns your preferences and patterns over time, building a sovereign knowledge base that's uniquely yours.</p>
                </div>
              </div>
            </div>

            <div className="arch-connector">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>

            {/* Layer 3: Providers */}
            <div className="arch-layer-expanded">
              <div className="arch-layer-header">
                <div className="arch-layer-icon providers">⋮</div>
                <div className="arch-layer-title">
                  <h3>Provider Chorus</h3>
                  <span>Interchangeable performers, unified interface</span>
                </div>
              </div>
              <div className="arch-layer-body">
                <div className="arch-detail">
                  <h4>Cloud Providers</h4>
                  <p>Anthropic (Claude), OpenAI (GPT), Google (Gemini), Perplexity. Bring your own API keys. Each provider{'\''}s strengths available on demand.</p>
                </div>
                <div className="arch-detail">
                  <h4>Local Models</h4>
                  <p>First-class Ollama and LM Studio integration. Run Llama, Mistral, or any GGUF model locally. Zero cost, full privacy, offline capable.</p>
                </div>
                <div className="arch-detail">
                  <h4>Unified Response</h4>
                  <p>Regardless of which provider answers, responses are normalized. Cost tracked. Usage logged. Memory updated. Conversation continues seamlessly.</p>
                </div>
                <div className="arch-detail">
                  <h4>Phone a Friend</h4>
                  <p>Request peer review from a different provider. Claude writes, GPT reviews for security holes. Cross-provider validation with confidence scoring and pattern extraction.</p>
                </div>
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
              <span>Relevance gating</span>
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
          <p>Self-hosted. Your memory, your rules.</p>
          <div className="hero-ctas">
            <Link href="/app" className="btn-primary">
              Get Started
            </Link>
            <Link href="#" className="btn-secondary">
              View Documentation
            </Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <div className="footer-left">
            <Link href="#" className="logo">
              <img src="/chorumai.png" alt="Chorum AI" style={{ height: '32px' }} />
            </Link>
            <div className="footer-links">
              <Link href="https://github.com/callmesparky42/ChorumAI">GitHub</Link>
              <Link href="#">Documentation</Link>
            </div>
          </div>
          <div className="footer-right">
            <div className="charity-note">
              <span>❤</span> 50% of donations support World Central Kitchen
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
