# Phase 5 Specification: Shell Layer (Layer 4) — UI, Settings, Conductor Inbox

**Version:** 1.0
**Date:** 2026-02-27
**Status:** Ready for execution
**Assigned to:** Codex (all Phase 5 files)
**Guardian gates:** `chorum-layer-guardian` (statelessness enforcement)
**Prerequisite:** Phase 4 complete — AgentInterface implemented; provider routing, personas, and task-aware routing passing; `callExtractionProvider` wired; `chorum-layer-guardian` passing

---

## Agent Instructions

You are executing **Phase 5** of the Chorum 2.0 build. This phase implements the Shell Layer — Layer 4 — the outermost layer. It owns all UI: chat, settings, Conductor inbox, scope browser, and injection audit viewer. **The Shell is stateless.** It holds zero business logic. All state lives in Layers 0–3.

Read this document completely before writing a single file. Every decision is locked.

**What you will produce:**
1. `src/app/globals.css` — Hygge Brutalist design tokens (borrowed from v1 `HYGGE_BRUTALIST.md`)
2. `src/components/hygge/` — Reusable design system components (HyggeButton, HyggeCard, HyggeToggle, HyggeInput, HyggeTabs, HyggeModal)
3. `src/app/(shell)/layout.tsx` — Shell layout with sidebar navigation
4. `src/app/(shell)/chat/page.tsx` — Chat UI with streaming, context injection display
5. `src/app/(shell)/settings/page.tsx` — Settings: providers, personas, memory config, MCP tokens
6. `src/app/(shell)/inbox/page.tsx` — Conductor proposal inbox
7. `src/app/(shell)/knowledge/page.tsx` — Knowledge gateway + scope browser
8. `src/app/(shell)/knowledge/graph/page.tsx` — Knowledge graph (Cytoscape.js)
9. `src/app/(shell)/audit/page.tsx` — Injection audit viewer
10. `src/lib/shell/hooks.ts` — React hooks (useChat, useProposals, useKnowledge, useProviders)
11. `src/lib/shell/actions.ts` — Server Actions wrapping Layer 2-3 calls
12. `src/app/layout.tsx` — Updated root layout with auth provider + metadata

**What you will NOT produce:**
- Any business logic — no scoring, no confidence calculations, no routing decisions
- Any direct database imports (`@/db`) — Shell accesses data through `ChorumClient` or `AgentInterface`
- Any modifications to Layer 0, 1, 2, or 3 files
- Any `any` types or `@ts-ignore` comments

**Layer 4 import rule:** `src/app/` and `src/components/` may import from `@/lib/customization` (ChorumClient), `@/lib/agents` (AgentInterface), and `@/lib/shell/` (hooks, actions). No imports from `@/lib/nebula`, `@/lib/core`, `@/lib/providers`, or `@/db` directly. All data access goes through the public interfaces of Layer 2 (ChorumClient) and Layer 3 (AgentInterface).

---

## Reference Documents

| Document | Location | Governs |
|----------|----------|---------|
| Phase Architecture | `CHORUM_V2_PHASE_ARCHITECTURE.md` | Phase 5 scope, statelessness rule |
| Hygge Brutalist | `chorum-ai/docs/specs/HYGGE_BRUTALIST.md` | Design tokens, component patterns |
| Layer Contracts | `docs/specs/LAYER_CONTRACTS.md` | Layer 4 import rules |
| Checklist | `CHECKLIST_2.0.md` | Phase 5 → Release transition gates |
| Phase 4 Spec | `PHASE_4_SPEC.md` | AgentInterface, persona system |
| Phase 3 Spec | `PHASE_3_SPEC.md` | ChorumClient, MCP tools |

---

## Locked Decisions

### Decision 1: Dark mode only

No light mode. No gradients. No shadows. The Hygge Brutalist aesthetic is monochrome foundation with Azure `#29ABE2` and Gold `#F7C325` as the only accent colors.

### Decision 2: Stateless Shell

The Shell holds NO state beyond React component state for UI interactions (open/closed panels, form inputs, loading states). All persistent state lives in Layers 0–3. The Shell calls `ChorumClient` and `AgentInterface` for everything.

### Decision 3: Next.js App Router with route groups

All Shell pages live under `src/app/(shell)/` route group. The root `src/app/page.tsx` is replaced with a redirect to `/chat`. Auth is enforced at the layout level.

### Decision 4: Tailwind CSS 4 (already installed)

The project already uses Tailwind CSS 4 via `@import "tailwindcss"` in globals.css. Hygge tokens are defined as CSS custom properties, NOT as Tailwind config extensions. Components use Tailwind utilities for layout + the CSS custom properties for colors/borders.

### Decision 5: Server Actions for mutations

All data mutations (inject learning, submit feedback, approve proposal, save settings) use Next.js Server Actions in `src/lib/shell/actions.ts`. These actions call `ChorumClient` and `AgentInterface` on the server side, avoiding client-side API calls.

### Decision 6: No Cytoscape in Phase 5 MVP

The knowledge graph (Cytoscape.js) is listed as a future enhancement. Phase 5 focuses on the core UI: chat, settings, inbox, knowledge list, and audit viewer. If time permits, the graph can be added as a stretch goal using the pattern from `HYGGE_BRUTALIST.md`.

---

## Step 1: Design System — `src/app/globals.css`

Replace the default Next.js globals.css with Hygge Brutalist design tokens.

```css
@import "tailwindcss";

/* ============================================
   HYGGE BRUTALIST DESIGN SYSTEM — Chorum v2
   ============================================ */

:root {
  /* Surfaces */
  --hg-bg: #0a0c10;
  --hg-surface: #141820;
  --hg-surface-hover: #1a2030;
  --hg-surface-active: #222838;

  /* Borders */
  --hg-border: #1e2330;
  --hg-border-subtle: #2a3040;

  /* Text */
  --hg-text-primary: #f4f4f5;
  --hg-text-secondary: #a1a1aa;
  --hg-text-tertiary: #71717a;

  /* Brand Accents */
  --hg-accent: #29ABE2;
  --hg-accent-warm: #F7C325;
  --hg-accent-muted: rgba(41, 171, 226, 0.12);
  --hg-accent-warm-muted: rgba(247, 195, 37, 0.10);

  /* Semantic */
  --hg-success: #22c55e;
  --hg-destructive: #dc2626;
  --hg-destructive-muted: rgba(220, 38, 38, 0.1);

  /* Font */
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@theme inline {
  --color-background: var(--hg-bg);
  --color-foreground: var(--hg-text-primary);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--hg-bg);
  color: var(--hg-text-primary);
  font-family: var(--font-sans), system-ui, sans-serif;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(41, 171, 226, 0.25); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(41, 171, 226, 0.4); }

/* Ghost Button — invisible until hover */
.hg-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--hg-text-secondary);
  padding: 6px 12px;
  font-size: 0.875rem;
  line-height: 1.25rem;
  transition: all 150ms ease;
  cursor: pointer;
}
.hg-btn:hover {
  border-color: var(--hg-border-subtle);
  color: var(--hg-text-primary);
  background: var(--hg-surface-hover);
}
.hg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.hg-btn-accent { color: var(--hg-accent); }
.hg-btn-accent:hover {
  border-color: rgba(41, 171, 226, 0.3);
  background: var(--hg-accent-muted);
}
.hg-btn-destructive:hover {
  color: var(--hg-destructive);
  border-color: var(--hg-destructive);
  background: var(--hg-destructive-muted);
}

/* Stat Line — label ---- value */
.hg-stat-line {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 0.875rem; padding: 4px 0;
}
.hg-stat-line .hg-label { color: var(--hg-text-secondary); white-space: nowrap; }
.hg-stat-line .hg-fill { flex: 1; border-bottom: 1px dashed var(--hg-border); min-width: 20px; }
.hg-stat-line .hg-value {
  color: var(--hg-text-primary);
  font-variant-numeric: tabular-nums; font-weight: 500;
}

/* Confidence Bar */
.hg-confidence-bar {
  width: 100%; height: 6px;
  background: var(--hg-border);
  overflow: hidden;
}
.hg-confidence-fill {
  height: 100%; background: var(--hg-accent);
  transition: width 300ms ease;
}
```

---

## Step 2: Design System Components — `src/components/hygge/`

### 2.1 `HyggeButton.tsx`

```tsx
'use client'
import clsx from 'clsx'

interface HyggeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'accent' | 'destructive'
  loading?: boolean
}

export function HyggeButton({
  variant = 'default', loading, children, className, disabled, ...props
}: HyggeButtonProps) {
  return (
    <button
      className={clsx(
        'hg-btn',
        variant === 'accent' && 'hg-btn-accent',
        variant === 'destructive' && 'hg-btn-destructive',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />}
      {children}
    </button>
  )
}
```

### 2.2 `HyggeCard.tsx`

```tsx
import clsx from 'clsx'

export function HyggeCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-[var(--hg-surface)] border border-[var(--hg-border)] p-4', className)}>
      {children}
    </div>
  )
}
```

No rounded corners. No shadows. Sharp and minimal.

### 2.3 `HyggeToggle.tsx`

```tsx
'use client'
import clsx from 'clsx'

export function HyggeToggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--hg-border)]">
      <div className="flex-1 pr-8">
        <span className="text-sm text-[var(--hg-text-primary)]">{label}</span>
        {description && <p className="text-xs text-[var(--hg-text-tertiary)] mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={clsx(
          "w-10 h-5 rounded-full transition-colors relative",
          checked ? "bg-[var(--hg-accent)]" : "bg-[var(--hg-border-subtle)]",
        )}
      >
        <span className={clsx(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )} />
      </button>
    </div>
  )
}
```

### 2.4 `HyggeInput.tsx`

```tsx
'use client'
import clsx from 'clsx'

interface HyggeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function HyggeInput({ label, className, ...props }: HyggeInputProps) {
  return (
    <div>
      {label && <label className="block text-xs text-[var(--hg-text-secondary)] mb-1">{label}</label>}
      <input
        className={clsx(
          'w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-sm',
          'text-[var(--hg-text-primary)] placeholder:text-[var(--hg-text-tertiary)]',
          'focus:outline-none focus:border-[var(--hg-accent)]',
          className,
        )}
        {...props}
      />
    </div>
  )
}

export function HyggeTextarea({ label, className, ...props }: {
  label?: string; className?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label && <label className="block text-xs text-[var(--hg-text-secondary)] mb-1">{label}</label>}
      <textarea
        className={clsx(
          'w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-sm',
          'text-[var(--hg-text-primary)] placeholder:text-[var(--hg-text-tertiary)]',
          'focus:outline-none focus:border-[var(--hg-accent)] resize-y min-h-[80px]',
          className,
        )}
        {...props}
      />
    </div>
  )
}
```

### 2.5 `HyggeTabs.tsx`

```tsx
'use client'
import clsx from 'clsx'

export function HyggeTabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex border-b border-[var(--hg-border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'px-4 py-2 text-sm transition-colors border-b-2 -mb-px',
            active === tab.id
              ? 'border-[var(--hg-accent)] text-[var(--hg-text-primary)]'
              : 'border-transparent text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-secondary)]',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

### 2.6 `HyggeModal.tsx`

```tsx
'use client'

export function HyggeModal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--hg-bg)] border border-[var(--hg-border)] w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--hg-border)] px-4 py-3">
          <h3 className="text-sm font-medium text-[var(--hg-text-primary)]">{title}</h3>
          <button onClick={onClose} className="hg-btn text-xs">close</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
```

No rounded corners. No shadow. Sharp and minimal.

### 2.7 `index.ts`

```tsx
export { HyggeButton } from './HyggeButton'
export { HyggeCard } from './HyggeCard'
export { HyggeToggle } from './HyggeToggle'
export { HyggeInput, HyggeTextarea } from './HyggeInput'
export { HyggeTabs } from './HyggeTabs'
export { HyggeModal } from './HyggeModal'
```

---

## Step 3: Shell Layout — `src/app/(shell)/layout.tsx`

The Shell layout wraps all authenticated pages with sidebar navigation.

```tsx
// src/app/(shell)/layout.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ShellSidebar } from '@/components/shell/ShellSidebar'

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/api/auth/signin')

  return (
    <div className="flex h-screen bg-[var(--hg-bg)]">
      <ShellSidebar userId={session.user.id} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
```

### 3.1 `src/components/shell/ShellSidebar.tsx`

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const NAV_ITEMS = [
  { href: '/chat', label: 'Chat' },
  { href: '/knowledge', label: 'Knowledge' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/audit', label: 'Audit' },
  { href: '/settings', label: 'Settings' },
]

export function ShellSidebar({ userId }: { userId: string }) {
  const pathname = usePathname()

  return (
    <aside className="w-48 border-r border-[var(--hg-border)] flex flex-col">
      <div className="px-4 py-4 border-b border-[var(--hg-border)]">
        <span className="text-sm font-medium text-[var(--hg-text-primary)]">Chorum</span>
        <span className="text-xs text-[var(--hg-accent)] ml-1">v2</span>
      </div>

      <nav className="flex-1 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'block px-4 py-2 text-sm border-l-2 transition-colors',
                isActive
                  ? 'border-[var(--hg-accent)] text-[var(--hg-text-primary)] bg-[var(--hg-surface)]'
                  : 'border-transparent text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface-hover)]',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t border-[var(--hg-border)]">
        <span className="text-xs text-[var(--hg-text-tertiary)]">v2.0.0-alpha.5</span>
      </div>
    </aside>
  )
}
```

**No icons.** Text labels only. Active state uses left-border accent. This matches the Hygge Brutalist principle: "Type hierarchy does the work."

---

## Step 4: Chat Page — `src/app/(shell)/chat/page.tsx`

The core chat UI. Streams responses from `AgentInterface.chat()`.

**Layout:**

```
┌─────────────────────────────────────────────────┐
│  Chat                      coder persona ▾      │
├─────────────────────────────────────────────────┤
│                                                 │
│  USER: How do I add auth to my API route?       │
│                                                 │
│  ┌─ context injected (3 items, 847 tokens) ──┐  │
│  │ Rule: Always authenticate API routes       │  │
│  │ Pattern: Use middleware auth wrapper       │  │
│  │ Decision: NextAuth for all auth            │  │
│  └────────────────────────────────────────────┘  │
│                                                 │
│  ASSISTANT: Based on your established patterns,  │
│  here's how to add auth to your route...        │
│                                                 │
│  👍 👎                                          │
│                                                 │
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  send    │
│  │ Type a message...                │           │
│  └───────────────────────────────────┘          │
└─────────────────────────────────────────────────┘
```

**Implementation requirements:**

1. **Message list:** Scrollable container. User messages right-aligned in `text-[var(--hg-text-primary)]`. Assistant messages left-aligned. No avatars. No colored bubbles. Messages separated by subtle border or spacing.

2. **Context injection display:** Collapsible panel below the user message, before the assistant response. Shows "context injected (N items, M tokens)" as a clickable header in tertiary text. When expanded, lists each injected learning with its type label (human-readable: Rule, Pattern, Decision, etc.) and truncated content.

3. **Persona selector:** Top-right dropdown. Lists available personas from `AgentInterface.getAgents()`. Default = 'default'. Selecting changes the active persona for subsequent messages.

4. **Streaming:** Use the `chat()` AsyncGenerator from `AgentInterface`. Display response text as it streams. Show a cursor/blinking indicator while streaming.

5. **Feedback buttons:** After each assistant message, show `👍 👎` as ghost buttons. Clicking calls `ChorumClient.submitFeedback()` for each injected learning in that turn.

6. **Conversation management:** `start_session` is called when the page loads (via Server Action). `end_session` is called on page unload or when user navigates away. Conversation history is maintained in React state.

7. **Input:** Single-line text input with `send` ghost button. Enter key submits. Shift+Enter for newline (if textarea).

**Hook: `useChat` in `src/lib/shell/hooks.ts`:**

```typescript
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string>('')
  const [activePersona, setActivePersona] = useState<string>('')

  async function sendMessage(content: string) { /* ... */ }
  async function submitFeedback(learningId: string, signal: 'positive' | 'negative') { /* ... */ }

  return { messages, isStreaming, conversationId, activePersona, setActivePersona, sendMessage, submitFeedback }
}
```

---

## Step 5: Settings Page — `src/app/(shell)/settings/page.tsx`

Tabbed settings page with 4 tabs: **Providers**, **Personas**, **Memory**, **Account**.

### 5.1 Providers Tab

Lists user's configured providers. Each provider is a `HyggeCard` showing:
- Provider name (text, not icon)
- Model (monospace, tertiary text)
- Status: "active" or "disabled" (text, not colored icon)
- Priority number
- Actions: `edit · remove` as ghost text links

**"Add Provider" button:** `HyggeButton variant="accent"`. Opens `HyggeModal` with:
- Provider selector (dropdown: openai, anthropic, google, mistral, deepseek, ollama, etc.)
- API key input (password type)
- Optional model override
- Optional base URL (for local/custom providers)
- Save/cancel buttons

**Data source:** `getUserProviders()` and `saveProviderConfig()` from `@/lib/agents`.

### 5.2 Personas Tab

Lists available personas (system + user-defined). Each persona is a `HyggeCard` showing:
- Name + description
- Default provider/model (if set, in tertiary text)
- Temperature + max tokens
- Scope filter tags
- Allowed tools list
- Actions: `edit · delete` (delete disabled for system personas)

**"Add Persona" button:** Opens `HyggeModal` with CreatePersona form.

**Data source:** `getPersonas()` and `createPersona()` from `@/lib/agents`.

### 5.3 Memory Tab

Memory configuration using `HyggeToggle` components:
- End-of-session judge: toggle (calls Phase 2's opt-in)
- Quality threshold: slider or number input (0–1, default 0.35)
- Half-life overrides per type: expandable section with number inputs
- Confidence floor overrides per type: expandable section with number inputs

**Domain seeds section:** Lists all domain seeds. System seeds show "(system)" badge. User can add custom seeds via inline form.

**Data source:** `getUserCustomization()` and `updateUserCustomization()` from `@/lib/customization`. Domain seeds via `listSeeds()`, `createSeed()` from `@/lib/customization`.

### 5.4 Account Tab

- User info (from session)
- API tokens: list, create, revoke Bearer tokens for MCP clients
- Sign out button

---

## Step 6: Conductor Inbox — `src/app/(shell)/inbox/page.tsx`

Shows pending `ConductorProposal` items for human review.

**Layout:**

```
Inbox                                          3 pending

┌───────────────────────────────────────────────────────┐
│ promote · Rule                                        │
│ "Always use parameterized queries for SQL"            │
│ confidence: 0.30 → 0.50 (+0.20)                      │
│ Reason: Auto-extracted learning requires approval     │
│ Created: 2 hours ago · Expires: 5 days               │
│                                          approve deny │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ demote · Pattern                                      │
│ "Use class-based components for stateful UI"          │
│ confidence: 0.65 → 0.55 (-0.10)                      │
│ Reason: End-of-session judge: contradicted by user    │
│ Created: 1 day ago · Expires: 4 days                  │
│                                          approve deny │
└───────────────────────────────────────────────────────┘
```

**Implementation:**
1. Fetch pending proposals via Server Action that queries `conductor_proposals` where `status = 'pending'` and `user_id = session.user.id`
2. Each proposal renders as a `HyggeCard` with type, target learning content, confidence delta, rationale, timestamps
3. `approve` and `deny` buttons as `HyggeButton` — approve calls `binaryStar.approveProposal()`, deny calls `binaryStar.rejectProposal()`
4. After action, proposal disappears from the list with a subtle fade

**Empty state:** "No pending proposals. The Conductor will surface items for review when it detects changes."

**Data source:** Direct Server Actions wrapping `BinaryStarInterface` via `createBinaryStar()`. This is the one case where the Shell calls Layer 1 through a Server Action — justified because the inbox is a Layer 1 concept (ConductorProposal) and creating a Layer 2 wrapper just for the inbox adds meaningless indirection.

> **Note for Codex:** This is a pragmatic exception to strict layering. The Server Action in `actions.ts` calls `createBinaryStar()` → `approveProposal()`/`rejectProposal()`. The import is in the server action file only, never in a client component.

---

## Step 7: Knowledge Page — `src/app/(shell)/knowledge/page.tsx`

Knowledge gateway — the text-driven entry point for browsing the knowledge graph.

**Layout (the gateway view, from Hygge Brutalist spec):**

```
Learned Knowledge                                    + add

Rules -------------------------------------------------- 8
Patterns ----------------------------------------------- 23
Things to avoid ---------------------------------------- 4
Decisions ---------------------------------------------- 12
How-tos ------------------------------------------------ 0

Confidence  ███████████░░░░  72%
14 interactions, 11 positive

──────────────────────────────────────────────────────────

Most Active

"Always authenticate API routes"                   used 23x
  Rule · pinned

"Use Result<T,E> for errors"                       used 18x
  Pattern · auth, error-handling

"Drizzle ORM for database"                         used 15x
  Decision
```

**Implementation:**
1. **Stats section:** Use `.hg-stat-line` for each type row. Count items by type from `ChorumClient.readNebula()`. Use human-readable labels:
   - `invariant` → Rule
   - `pattern` → Pattern
   - `antipattern` → Thing to avoid
   - `decision` → Decision
   - `golden_path` → How-to
   - `anchor` → Anchor
   - Creative types: `character`, `setting`, `plot_thread`, `voice`, `world_rule` → display as-is

2. **Confidence bar:** Azure fill bar using `.hg-confidence-bar` / `.hg-confidence-fill`. Width = overall confidence percentage.

3. **Most Active:** Top 5 learnings sorted by `usageCount` desc. Each row expands on click to show full content and actions: `edit · delete · pin · mute`.

4. **"+ add" button:** `HyggeButton variant="accent"`. Opens inline form (NOT modal) with type selector, content textarea, scopes input. Submit calls `ChorumClient.injectLearning()` with `extractionMethod: 'manual'`.

5. **Scope browser:** Below the gateway, a horizontal list of unique scope tags across all learnings. Clicking a tag filters the view to learnings with that scope. Scope tags are displayed as `#tag` text in tertiary color, active tag in accent color.

**Data source:** `ChorumClient.readNebula()` for listing. `ChorumClient.injectLearning()` for adding.

---

## Step 8: Injection Audit Viewer — `src/app/(shell)/audit/page.tsx`

Shows the history of what was injected and why — the "why did Podium show me this?" view.

**Layout:**

```
Injection Audit

Filter: [all conversations ▾]   [last 7 days ▾]

Conversation: Feb 27, 14:23 — "Adding auth to API route"
  3 items injected · Tier 1 · 847 tokens

  1. Rule: "Always authenticate API routes"
     score: 0.92 (semantic: 0.85, recency: 0.95, confidence: 0.90)
     feedback: 👍 positive

  2. Pattern: "Use middleware auth wrapper"
     score: 0.78 (semantic: 0.72, recency: 0.80, confidence: 0.85)
     feedback: none

  3. Decision: "NextAuth for all auth"
     score: 0.65 (semantic: 0.60, recency: 0.70, confidence: 0.80)
     feedback: 👎 negative
```

**Implementation:**
1. Query injection audit log from `injection_audit` table via Server Action
2. Group by conversation
3. For each injection: show the learning content, relevance scores, tier, and any feedback submitted
4. Filters: conversation selector, time range selector
5. Clicking a learning links to its detail in the Knowledge page

**Data source:** Server Action querying `injection_audit` table (join with `learnings` for content). This is another pragmatic Layer 0 access justified by the audit being read-only diagnostic data.

---

## Step 9: Server Actions — `src/lib/shell/actions.ts`

All server-side data mutations and queries for the Shell.

```typescript
'use server'

import { auth } from '@/lib/auth'
import { LocalChorumClient } from '@/lib/customization'
import { createAgent } from '@/lib/agents'
import { createBinaryStar } from '@/lib/core'
import { createNebula } from '@/lib/nebula'
import type { AuthContext } from '@/lib/customization'

async function getAuthContext(): Promise<AuthContext> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  return {
    userId: session.user.id,
    scopes: ['read:nebula', 'write:nebula', 'write:feedback', 'admin'],
  }
}

function getClient(authCtx: AuthContext) {
  return new LocalChorumClient(authCtx)
}

// Chat
export async function startChatSession(initialQuery?: string) {
  const authCtx = await getAuthContext()
  const client = getClient(authCtx)
  // ... calls handleStartSession
}

export async function sendChatMessage(
  conversationId: string, message: string, agentId?: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
) {
  const authCtx = await getAuthContext()
  const agent = createAgent()
  return agent.chatSync({
    userId: authCtx.userId,
    conversationId,
    message,
    agentId,
    history,
    contextWindowSize: 16000,
  })
}

// Knowledge
export async function getKnowledge(scopes?: string[], type?: string) {
  const authCtx = await getAuthContext()
  const client = getClient(authCtx)
  return client.readNebula({
    userId: authCtx.userId,
    scopes, type, limit: 100, offset: 0,
  })
}

export async function addLearning(content: string, type: string, scopes: string[]) {
  const authCtx = await getAuthContext()
  const client = getClient(authCtx)
  return client.injectLearning({
    userId: authCtx.userId, content, type, scopes,
    extractionMethod: 'manual',
  })
}

// Feedback
export async function submitFeedback(
  learningId: string, signal: 'positive' | 'negative',
  conversationId?: string,
) {
  const authCtx = await getAuthContext()
  const client = getClient(authCtx)
  return client.submitFeedback({
    userId: authCtx.userId, learningId, signal, conversationId,
    source: 'explicit',
  })
}

// Inbox
export async function approveProposal(proposalId: string) {
  const authCtx = await getAuthContext()
  const nebula = createNebula()
  const binaryStar = createBinaryStar(nebula)
  return binaryStar.approveProposal(proposalId)
}

export async function rejectProposal(proposalId: string) {
  const authCtx = await getAuthContext()
  const nebula = createNebula()
  const binaryStar = createBinaryStar(nebula)
  return binaryStar.rejectProposal(proposalId)
}

// Providers + Personas (delegate to Layer 3)
export { getUserProviders, saveProviderConfig, disableProvider } from '@/lib/agents'
export { getPersonas, createPersona, deletePersona } from '@/lib/agents'
export { getUserCustomization, updateUserCustomization } from '@/lib/customization'
export { listSeeds, createSeed, deleteSeed } from '@/lib/customization'
```

---

## Step 10: Root Layout Update — `src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Chorum — Persistent Memory for AI',
  description: 'A knowledge graph that makes AI remember across conversations.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
```

### 10.1 Root page redirect

Replace `src/app/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
export default function Home() { redirect('/chat') }
```

---

## Step 11: Build Verification

```bash
npx next build
```

Expected: exit 0, zero TypeScript errors.

---

## Test Contract

### UI Component tests (`src/__tests__/shell/components.test.tsx`)

| Test | Assertion |
|------|-----------|
| `HyggeButton` renders with correct class | `hg-btn` class present |
| `HyggeButton variant="accent"` | `hg-btn-accent` class present |
| `HyggeButton loading` shows spinner | Spinner element rendered |
| `HyggeCard` renders children | Children visible |
| `HyggeToggle` toggles on click | `onChange` called with opposite value |
| `HyggeModal open={false}` renders nothing | No DOM output |

### Server Action tests (`src/__tests__/shell/actions.test.ts`)

| Test | Assertion |
|------|-----------|
| `getKnowledge` returns learning list | `learnings` array present |
| `addLearning` creates manual learning | `proposalCreated: false` |
| `submitFeedback` processes signal | `processed: true` |
| `approveProposal` changes status | Proposal status updated |

### Integration tests (manual)

| Test | Steps |
|------|-------|
| Chat flow | 1. Navigate to /chat. 2. Type message. 3. Verify response streams. 4. Verify context injection panel shows. 5. Click 👍 on injected item. |
| Settings → Provider | 1. Navigate to /settings. 2. Click "Add Provider". 3. Enter OpenAI key. 4. Save. 5. Verify provider appears in list. |
| Inbox approval | 1. Inject a learning via `extract_learnings` MCP tool. 2. Navigate to /inbox. 3. Approve the proposal. 4. Verify learning confidence updated. |
| Knowledge add | 1. Navigate to /knowledge. 2. Click "+ add". 3. Fill form. 4. Submit. 5. Verify learning appears in list. |
| Audit trail | 1. Chat with context injection. 2. Navigate to /audit. 3. Verify conversation + injected items visible. |

---

## Guardian Validation

### chorum-layer-guardian

| Check | Expected |
|-------|----------|
| Zero `@/db` imports in `src/app/` or `src/components/` | Shell never touches DB directly |
| Zero `@/lib/nebula` imports in `src/app/` or `src/components/` | No Layer 0 access |
| Zero `@/lib/core` imports in client components | Layer 1 only in Server Actions |
| Zero `@/lib/providers` imports in `src/app/` | Shell doesn't call providers |
| All data access goes through `ChorumClient`, `AgentInterface`, or Server Actions | Statelessness enforced |
| No business logic (scoring, confidence calc, routing) in any Shell file | Shell is presentation only |

**Pragmatic exceptions documented:**
- `src/lib/shell/actions.ts` imports `createBinaryStar` for inbox approve/reject
- `src/lib/shell/actions.ts` imports `createNebula` (required to create BinaryStar)
- Both are server-only, never exposed to client components

---

## Completion Criteria

Map to `CHECKLIST_2.0.md` Phase 5 → Release Transition:

| Checklist Item | How to verify |
|----------------|---------------|
| Chat UI renders and sends messages | Navigate to /chat, type message, see response |
| Settings pages work | Add/edit/remove provider, persona, memory config |
| Conductor inbox UI shows proposals | Navigate to /inbox, see pending proposals |
| Scope browser displays tags | Navigate to /knowledge, see scope tag filter |
| Injection audit viewer shows why things were injected | Navigate to /audit, see injection history |
| ALL UI is stateless | `chorum-layer-guardian` passes on all Shell files |
| Full end-to-end test | UI → Agent → Binary Star → Nebula → Response → UI |
| CHANGELOG complete for v2.0.0 | Changelog entry added |

---

## Initial .env.local.example Update

Add to `.env.local.example`:

```bash
# Phase 5: Shell
# No new env vars required — Shell is stateless
# Ensure ENCRYPTION_KEY is set (Phase 4)
# Ensure at least one provider API key is configured in Settings
```

---

## Changelog Entry

```markdown
## [2.0.0-alpha.5] — Phase 5: Shell Layer (Layer 4)

### Added
- Hygge Brutalist design system: CSS tokens, 6 reusable components
- Shell layout with sidebar navigation (text-only, no icons)
- Chat page with streaming responses, context injection display, persona selector
- Settings page: providers, personas, memory config, account/tokens
- Conductor inbox: approve/reject pending proposals
- Knowledge gateway: type-grouped stats, most active learnings, scope browser
- Injection audit viewer: conversation-grouped injection history with scores
- Server Actions for all Shell ↔ Layer 2/3 communication
- Root layout with Chorum metadata, dark mode enforced

### Design
- Dark mode only — monochrome + Azure/Gold accents
- No icons in navigation — text labels create hierarchy
- Ghost buttons: invisible until hover
- No rounded corners, no shadows, sharp and minimal
- Stateless Shell: zero business logic, all state in Layers 0-3
```

---

## Codex Notes

**The Shell is dumb on purpose.** If you find yourself writing a `sort()`, `filter()`, or `reduce()` in a Shell component that operates on learning data — STOP. That logic belongs in a handler function in Layer 2 (customization) or Layer 3 (agents). The Shell only presents what it receives.

**Server Actions are the bridge.** Client components call Server Actions, which call `ChorumClient` / `AgentInterface`. Never import Layer 0-3 modules in a client component. The `'use server'` directive is your friend.

**No loading skeletons in Phase 5 MVP.** Use simple "Loading..." text in tertiary color. Skeleton animations can be added as polish later.

**Streaming is single-yield in Phase 4.** The `AgentInterface.chat()` generator currently yields the full response as one chunk. The chat UI should be built to handle multiple chunks (for future true streaming), but will work with single-yield now. Render each yielded chunk by appending to the displayed text.

**Human-readable type labels map:**

| Internal | Display |
|----------|---------|
| `invariant` | Rule |
| `pattern` | Pattern |
| `antipattern` | Thing to avoid |
| `decision` | Decision |
| `golden_path` | How-to |
| `anchor` | Anchor |
| `character` | Character |
| `setting` | Setting |
| `plot_thread` | Plot thread |
| `voice` | Voice |
| `world_rule` | World rule |

Use this map everywhere in the Shell. Never show raw internal type names to the user.

**Install `clsx`:** The Hygge components use `clsx` for conditional class composition. If not already installed:
```bash
npm install clsx
```

---

# Phase 5 Addendum: Challenger Feedback Integration

**Date:** 2026-02-27
**Status:** Locked — incorporated into Phase 5 scope

The following 10 items were identified during spec review and are now part of the Phase 5 deliverables. Each item modifies or adds to a specific Step above.

---

## A1: Onboarding & Empty States

**Affects:** Steps 4 (Chat), 7 (Knowledge), 6 (Inbox)

Every page must have a purposeful empty state. No blank screens, no all-zeros.

### Knowledge page empty state (Step 7)

When `readNebula()` returns zero learnings:

```
Your knowledge graph is empty.

Start chatting and Chorum will learn from your conversations,
or add your first learning manually.

                                                    + add first learning

──────────────────────────────────────────────────────────

Quick Start Templates

  React & Next.js patterns          import →
  Python best practices             import →
  Creative writing conventions      import →
```

**"import →"** loads a JSON file from `src/lib/shell/templates/` containing 5–10 seed learnings per domain. These are injected via `ChorumClient.injectLearning()` with `extractionMethod: 'template'`. Template files are static JSON shipped with the app.

**Files to create:**
- `src/lib/shell/templates/react-nextjs.json`
- `src/lib/shell/templates/python.json`
- `src/lib/shell/templates/creative-writing.json`

Each template: `{ name: string, learnings: { content: string, type: string, scopes: string[] }[] }`

### Chat page empty state (Step 4)

When `messages` is empty (first visit or new conversation):

```
What would you like to work on?

Your knowledge graph has {count} learnings.
{count > 0 ? "Context will be injected automatically based on relevance." : "Start chatting to build your knowledge graph, or add learnings in Knowledge."}
```

### Inbox empty state (Step 6)

Already specified: "No pending proposals. The Conductor will surface items for review when it detects changes."

---

## A2: Global Search — `src/components/shell/CommandPalette.tsx`

**Affects:** Step 3 (Shell Layout), new component

Add a global search / command palette triggered by `Cmd+K` (Mac) / `Ctrl+K` (Windows).

### Component: `CommandPalette.tsx`

```
┌──────────────────────────────────────────┐
│ 🔍 Search learnings, conversations...    │
├──────────────────────────────────────────┤
│ Learnings                                │
│   Rule: "Always authenticate API..."     │
│   Pattern: "Use Result<T,E> for..."      │
│                                          │
│ Conversations                            │
│   Feb 27 — "Adding auth to API route"    │
│   Feb 26 — "Database migration patterns" │
│                                          │
│ Actions                                  │
│   → New conversation                     │
│   → Add learning                         │
│   → Settings                             │
└──────────────────────────────────────────┘
```

**Implementation:**
1. Overlay modal with text input, auto-focused
2. Debounced search (300ms) calls `searchKnowledge` Server Action
3. Server Action calls `ChorumClient.readNebula()` with text filter + `nebula.semanticSearch()` for embedding match
4. Results grouped: Learnings, Conversations, Actions (static navigation shortcuts)
5. Arrow keys to navigate, Enter to select, Escape to close
6. Render in Shell Layout, available on all pages

**Server Action addition to `actions.ts`:**
```typescript
export async function searchKnowledge(query: string) {
  const authCtx = await getAuthContext()
  const client = getClient(authCtx)
  const learnings = await client.readNebula({
    userId: authCtx.userId, query, limit: 10, offset: 0,
  })
  const conversations = await getConversationHistory(authCtx.userId, 5)
  return { learnings, conversations }
}
```

---

## A3: Keyboard Shortcuts

**Affects:** Step 3 (Shell Layout), new component

### `src/components/shell/KeyboardShortcuts.tsx`

Global keyboard listener registered in Shell Layout. Shortcuts:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Open command palette |
| `Cmd/Ctrl+N` | New conversation (navigates to /chat, clears state) |
| `Cmd/Ctrl+/` | Show shortcuts help modal |
| `Escape` | Close modal / command palette / expanded panel |

**Implementation:** Single `useEffect` with `keydown` listener in Shell Layout. Shortcuts modal is a `HyggeModal` listing all shortcuts in a table.

---

## A4: Conversation Persistence

**Affects:** Step 4 (Chat), Step 9 (Server Actions)

Conversations are already stored in the `conversations` table (Phase 3 Addendum). The chat page must use this for persistence.

### Chat sidebar: `src/components/shell/ChatHistory.tsx`

Add a collapsible conversation history panel on the left side of the chat page (inside the chat page, not the main sidebar):

```
Conversations              + new

  Today
    Adding auth to API route
    Database migration patterns

  Yesterday
    React component patterns

  Feb 25
    Setting up CI/CD pipeline
```

**Implementation:**
1. Fetch conversations via Server Action: `getConversationHistory(userId, limit)`
2. Server Action queries `conversations` table ordered by `updated_at DESC`
3. Clicking a conversation loads its messages from `conversations.messages` JSONB column
4. "New conversation" button calls `start_session` and clears message state
5. Active conversation highlighted with accent border
6. Messages auto-save to conversation record on each send/receive via `updateConversation` Server Action

### Changes to `useChat` hook:

```typescript
export function useChat() {
  // ... existing state
  const [conversations, setConversations] = useState<ConversationSummary[]>([])

  async function loadConversation(id: string) { /* fetch from DB, restore messages */ }
  async function newConversation() { /* start_session, clear messages */ }
  // Messages persist to DB on each exchange
}
```

### Server Action additions:

```typescript
export async function getConversationHistory(limit = 20) {
  // Query conversations table, return summaries
}

export async function getConversationMessages(conversationId: string) {
  // Return full message history for a conversation
}

export async function saveConversationMessages(
  conversationId: string,
  messages: { role: string; content: string }[]
) {
  // Update conversations.messages JSONB
}
```

---

## A5: Data Export

**Affects:** Step 5 (Settings → Account tab)

### Account tab additions:

Add an "Export Data" section:

```
Data Export

Export all your Chorum data in portable JSON format.
Includes: learnings, scopes, feedback history, conversations.

                                              export all data →
```

**Implementation:**
1. `HyggeButton variant="accent"` labeled "export all data →"
2. Calls `exportAllData` Server Action
3. Server Action collects: all learnings, scopes, feedback, conversations, provider configs (WITHOUT API keys), personas
4. Returns JSON blob, triggers browser download as `chorum-export-{date}.json`
5. Format matches v1 portability format from `src/lib/portability/` for v1→v2 import compatibility

**Server Action:**
```typescript
export async function exportAllData() {
  const authCtx = await getAuthContext()
  const client = getClient(authCtx)
  const learnings = await client.readNebula({ userId: authCtx.userId, limit: 10000, offset: 0 })
  // ... gather all data
  return {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    learnings: learnings.items,
    // conversations, feedback, personas (no API keys)
  }
}
```

---

## A6: Bulk Operations on Knowledge

**Affects:** Step 7 (Knowledge page)

**Priority:** Lower. Implement as enhancement after core gateway works.

### Design:

Add a select mode toggle in the knowledge "view all by type" view:

```
view all by type                              ☐ select mode

☐ Rule: "Always authenticate API routes"        used 23x
☐ Rule: "Validate input on server side"          used 12x
☑ Rule: "Use parameterized SQL queries"          used 8x
☑ Rule: "Rate limit all public endpoints"        used 3x

──────────────────────────────────────────────
2 selected                    pin · mute · delete · re-tag
```

**Implementation:**
1. Checkbox column appears when "select mode" is active
2. Bulk action bar appears at bottom when items selected
3. Actions: `pin all`, `mute all`, `delete all`, `add scope tag`
4. Each action calls the corresponding Server Action in a loop
5. Confirmation modal for destructive actions (delete)

---

## A7: Provider Health Check

**Affects:** Step 5 (Settings → Providers tab)

### Per-provider "test connection" button:

```
OpenAI                    gpt-4o                active
Priority: 0                                     test · edit · remove
                                        Last tested: 2 min ago ✓
```

**Implementation:**
1. `HyggeButton` labeled "test" next to each provider card
2. Calls `testProviderConnection` Server Action
3. Server Action makes a minimal API call (e.g., list models endpoint or a 1-token completion) using the stored API key
4. Returns: `{ success: boolean, latencyMs: number, error?: string }`
5. Display: "✓" in accent color if success, error text in destructive color if failed
6. Store last test timestamp client-side (React state only — no DB write)

**Server Action:**
```typescript
export async function testProviderConnection(provider: string) {
  const authCtx = await getAuthContext()
  const configs = await getUserProviders(authCtx.userId)
  const config = configs.find(c => c.provider === provider)
  if (!config) return { success: false, error: 'Provider not configured' }

  const start = Date.now()
  try {
    // Minimal API call — provider-specific health check
    await callProvider(
      { provider: config.provider, apiKey: config.apiKey, model: 'auto' },
      [{ role: 'user', content: 'test' }],
      'Reply with OK',
    )
    return { success: true, latencyMs: Date.now() - start }
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: String(err) }
  }
}
```

> **Note:** This is a pragmatic exception — `actions.ts` imports `callProvider` from `@/lib/providers` for health checks only. Documented alongside other exceptions.

---

## A8: Inbox Badge Count

**Affects:** Step 3 (ShellSidebar)

### Sidebar with badge:

```
  Chat
  Knowledge
  Inbox 3
  Audit
  Settings
```

**Implementation:**
1. Shell Layout fetches pending proposal count via Server Action on load
2. Pass count as prop to `ShellSidebar`
3. Display count inline after "Inbox" text in accent color: `Inbox <span className="text-[var(--hg-accent)] ml-1">3</span>`
4. No dot indicator, no circle badge — just the number in accent color (Hygge: text does the work)

**Shell Layout update:**
```tsx
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/api/auth/signin')
  const inboxCount = await getPendingProposalCount(session.user.id)

  return (
    <div className="flex h-screen bg-[var(--hg-bg)]">
      <ShellSidebar userId={session.user.id} inboxCount={inboxCount} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
```

---

## A9: Mobile Responsiveness

**Affects:** Step 3 (Shell Layout), all pages

### Breakpoint strategy:

| Width | Layout |
|-------|--------|
| `≥768px` (md) | Full sidebar + content |
| `<768px` | Sidebar hidden, hamburger menu top-left, content full-width |

### Shell Layout changes:

1. Sidebar gets `hidden md:flex` by default on mobile
2. Add hamburger button (text: "☰" — no icon library) visible only on `md:hidden`
3. Clicking hamburger opens sidebar as overlay with `fixed inset-0 z-40`
4. Clicking any nav item closes the overlay

### Chat page mobile:

1. Chat input fixed to bottom of viewport: `fixed bottom-0 left-0 right-0 md:relative`
2. Message list gets `pb-20` on mobile for input clearance
3. Conversation history panel hidden by default on mobile, accessible via "history" text button

### Knowledge/Settings/Inbox:

Cards stack vertically by default (already do with Tailwind). No special mobile treatment needed beyond sidebar responsiveness.

---

## A10: Feedback UX Clarity

**Affects:** Step 4 (Chat page)

### Feedback is per-injected-learning, not per-response

**Current spec says:** "After each assistant message, show 👍 👎 as ghost buttons."

**Updated behavior:**

1. **Remove** the 👍👎 from below the assistant message
2. **Add** 👍👎 inside the expanded context injection panel, next to each injected learning:

```
┌─ context injected (3 items, 847 tokens) ──────┐
│ Rule: Always authenticate API routes      👍 👎│
│ Pattern: Use middleware auth wrapper      👍 👎│
│ Decision: NextAuth for all auth           👍 👎│
└────────────────────────────────────────────────┘
```

3. **Toast confirmation:** When user clicks 👍 or 👎, show a brief toast notification (bottom-right, auto-dismiss after 2 seconds):
   - 👍: "Feedback recorded — this learning will be prioritized"
   - 👎: "Feedback recorded — this learning will be reviewed"

4. **Visual state change:** After clicking, the button stays in its pressed state (accent color for 👍, destructive muted for 👎) so user knows they've already rated this item.

5. **One rating per learning per turn:** Clicking 👍 then 👎 on the same learning replaces the previous signal.

### Toast component: `src/components/hygge/HyggeToast.tsx`

```tsx
'use client'
import { useState, useEffect } from 'react'

export function HyggeToast({ message, duration = 2000 }: { message: string; duration?: number }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(t)
  }, [duration])

  if (!visible) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-[var(--hg-surface)] border border-[var(--hg-border)] px-4 py-2 text-sm text-[var(--hg-text-secondary)] animate-fade-in">
      {message}
    </div>
  )
}
```

Add to `src/components/hygge/index.ts` exports.

---

## Updated File Manifest

These addendum items add the following files to the Phase 5 deliverable list:

| File | Source | Step |
|------|--------|------|
| `src/components/shell/CommandPalette.tsx` | A2 | New |
| `src/components/shell/KeyboardShortcuts.tsx` | A3 | New |
| `src/components/shell/ChatHistory.tsx` | A4 | New |
| `src/components/hygge/HyggeToast.tsx` | A10 | New |
| `src/lib/shell/templates/react-nextjs.json` | A1 | New |
| `src/lib/shell/templates/python.json` | A1 | New |
| `src/lib/shell/templates/creative-writing.json` | A1 | New |

**Updated total file count:** 18 original + 7 addendum = **25 files**

## Updated Server Actions (`actions.ts` additions)

```typescript
// A2: Search
export async function searchKnowledge(query: string) { ... }

// A4: Conversation persistence
export async function getConversationHistory(limit?: number) { ... }
export async function getConversationMessages(conversationId: string) { ... }
export async function saveConversationMessages(conversationId: string, messages: any[]) { ... }

// A5: Export
export async function exportAllData() { ... }

// A7: Provider health
export async function testProviderConnection(provider: string) { ... }

// A8: Inbox count
export async function getPendingProposalCount(userId: string) { ... }
```

## Updated Guardian Exceptions

Add to the pragmatic exceptions list:
- `src/lib/shell/actions.ts` imports `callProvider` from `@/lib/providers` for health check only (A7)

---

## Priority Order for Addendum Items

| Priority | Item | Rationale |
|----------|------|-----------|
| P0 (must-have) | A1: Empty states | Broken UX without it |
| P0 (must-have) | A4: Conversation persistence | Core expectation |
| P0 (must-have) | A10: Feedback UX | Current spec is ambiguous |
| P0 (must-have) | A8: Inbox badge | Trivial to implement, high impact |
| P1 (should-have) | A2: Global search | Key usability feature |
| P1 (should-have) | A5: Data export | Core sovereignty promise |
| P1 (should-have) | A7: Provider health | Users need to verify keys work |
| P1 (should-have) | A9: Mobile responsive | Sidebar collapse at minimum |
| P2 (nice-to-have) | A3: Keyboard shortcuts | Polish |
| P2 (nice-to-have) | A6: Bulk operations | Power user feature |
