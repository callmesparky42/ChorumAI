# Phase 5B Specification: Shell Completion — Layout, Projects, Agents, Charts

**Version:** 1.0
**Date:** 2026-03-01
**Status:** Ready for execution
**Prerequisite:** Phase 5 shipped — all pages exist, settings functional, inbox functional, audit functional
**Guardian gates:** `chorum-layer-guardian` (Shell must remain stateless throughout)

---

## Agent Instructions

You are executing **Phase 5B** of the Chorum 2.0 build. The Shell pages exist and are wired to real data. This phase completes the chat experience and adds visual proof that the Nebula, Podium, and Conductor are working.

Read this document completely before writing a single file. Every decision is locked. If something feels ambiguous, re-read — the answer is here. If it is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. Projects CRUD server actions and TypeScript interfaces
2. `ProjectsDrawer` component — left collapsible panel: projects → conversations hierarchy
3. `AgentDrawer` component — right collapsible panel: persona list, create, select
4. `Omnibar` component — rich chat input with file attach and provider selector
5. `MessageContent` component — markdown rendering with syntax-highlighted code blocks
6. Streaming chat API route (`/api/chat/stream`) and updated `useChat` hook
7. Updated `/chat` page integrating the 4-frame layout
8. Nebula Health charts on the existing `/knowledge` page (three charts, no new page)
9. Score bars on the existing `/audit` page (CSS-only, no new library)

**What you will NOT produce:**
- Any new database migration files (schema is complete from Phase 1)
- Any changes to Layer 0–3 implementation files
- Business logic in any Shell component — all mutations go through server actions or the streaming route
- A dedicated "Nebula Observatory" route — charts live on `/knowledge`
- Force-directed graph visualization — deferred to v2.1
- Real-time sync or WebSocket — deferred to v2.1
- Any `any` types or `@ts-ignore` comments

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Layer Contracts | `docs/specs/LAYER_CONTRACTS.md` | Import direction; Shell is stateless |
| Phase 5 Spec | `PHASE_5_SPEC.md` | Original shell contract; this document extends it |
| Architecture Vision | `CHORUM_2.0_ARCHITECTURE.md` | Design principles |
| The Shift | `The_Shift.md` | Resolved decisions |
| Deployment Checklist | `CHECKLIST_2.0.md` | Completion gates |

---

## Step 1: Dependencies

Install before any component work:

```bash
npm install recharts react-markdown remark-gfm rehype-highlight react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

`recharts` and `react-markdown` ship their own TypeScript declarations.

**Do not install** any other charting library (Chart.js, Victory, D3 — Recharts only).
**Do not install** any other markdown library (marked, showdown — react-markdown only).

---

## Step 2: Projects CRUD — Server Actions

Add the following exports to `src/lib/shell/actions.ts`. The file-level `'use server'` directive already covers these.

### TypeScript Interfaces

```typescript
// Add to src/lib/shell/actions.ts, after existing imports

export interface Project {
  id: string
  userId: string
  name: string
  scopeFilter: {
    include: string[]   // scope tags required; empty = all scopes
    exclude: string[]   // scope tags excluded
  }
  crossLensAccess: boolean   // if true, Podium ignores scopeFilter and searches all user learnings
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  scopeFilter?: {
    include: string[]
    exclude: string[]
  }
  crossLensAccess?: boolean
}

export interface UpdateProjectInput {
  name?: string
  scopeFilter?: {
    include: string[]
    exclude: string[]
  }
  crossLensAccess?: boolean
}
```

### Server Action Signatures and Contracts

```typescript
export async function getProjects(): Promise<Project[]>
```
Returns all projects for the authenticated user, ordered by `updatedAt DESC`.
No pagination — projects are a small collection (<100 expected per user).

```typescript
export async function createProject(input: CreateProjectInput): Promise<Project>
```
Creates a new project. `scopeFilter` defaults to `{ include: [], exclude: [] }`.
`crossLensAccess` defaults to `false`.
Returns the created project row.

```typescript
export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project>
```
Updates `name`, `scopeFilter`, or `crossLensAccess`.
Throws with message `'UNAUTHORIZED'` if the project does not belong to the authenticated user.

```typescript
export async function deleteProject(id: string): Promise<void>
```
Deletes the project row. Conversations whose `projectId` referenced this project are **not** deleted — the `ON DELETE SET NULL` FK constraint sets their `projectId` to null.
Throws with message `'UNAUTHORIZED'` if project does not belong to authenticated user.

```typescript
export async function getConversationsForProject(projectId: string): Promise<ConversationSummary[]>
```
Returns conversations scoped to this project, ordered by `startedAt DESC`, limit 50.
`ConversationSummary` is the existing type from `hooks.ts`.

```typescript
export async function getUnassignedConversations(): Promise<ConversationSummary[]>
```
Returns conversations where `project_id IS NULL`, ordered by `startedAt DESC`, limit 20.
These are shown in the "Recent" section of the drawer for unscoped work.

### Update `startChatSession`

The existing signature:
```typescript
startChatSession(initialText: string): Promise<{ conversationId: string }>
```

Must be updated to:
```typescript
startChatSession(
  initialText: string,
  projectId?: string    // associates conversation with a project at creation
): Promise<{ conversationId: string }>
```

When `projectId` is provided:
- Set `conversations.project_id = projectId` on insert
- Set `conversations.scope_tags` to the project's `scopeFilter.include` array (fetch project to get it)

When `projectId` is omitted or null:
- Set `conversations.project_id = null`
- Set `conversations.scope_tags = []`

**Invariant:** Validate that the provided `projectId` belongs to the authenticated user before use. Throw `'UNAUTHORIZED'` if it does not.

---

## Step 3: Chat Layout — 4-Frame Architecture

The `/chat` page becomes a 4-frame layout. The `ShellSidebar` (left nav, `w-48`, always visible) is **not modified** — it is a navigation fixture. The 4 frames within `/chat` are:

```
┌─ ShellSidebar ─┬─ ProjectsDrawer ─┬────── Chat ─────────┬── AgentDrawer ──┐
│  w-48          │  w-60            │  flex-1             │  w-56           │
│  (always)      │  (collapsible)   │  (always)           │  (collapsible)  │
│  nav links     │  projects +      │  messages +         │  personas +     │
│                │  conversations   │  omnibar            │  selector       │
└────────────────┴──────────────────┴─────────────────────┴─────────────────┘
```

**Default state on `/chat` page load:**
- `ProjectsDrawer`: open
- `AgentDrawer`: closed
Both states persist to `localStorage`:
- Key `chorum_projects_drawer_open` — value `'true'` or `'false'`
- Key `chorum_agent_drawer_open` — value `'true'` or `'false'`

**On narrow viewports (< 900px):** Both drawers default to closed and render as overlays (fixed position, full height, `z-20`) rather than pushing the chat area. The chat area always fills the available width.

**Widths are fixed.** No resizing handles. This is intentional — hygge over configurability.

---

## Step 4: `ProjectsDrawer` Component

**File:** `src/components/shell/ProjectsDrawer.tsx`

### Interface

```typescript
export interface ProjectsDrawerProps {
  projects: Project[]
  unassignedConversations: ConversationSummary[]
  conversationsByProject: Record<string, ConversationSummary[]>
  activeProjectId: string | null
  activeConversationId: string
  isOpen: boolean
  loadingProjectId: string | null   // shows spinner on conversations of this project while loading
  onSelectProject: (id: string | null) => void
  onSelectConversation: (id: string, projectId: string | null) => void
  onNewConversation: (projectId: string | null) => void
  onNewProject: () => void
  onDeleteProject: (id: string) => void
  onExpandProject: (id: string) => void   // triggers lazy conversation load
  onClose: () => void
}
```

### Structure

```
┌──────────────────────────────┐
│  Projects          [+] [×]   │  header
├──────────────────────────────┤
│  ▸ Options Trading      3    │  collapsed project row
│  ▾ Fiction Draft        7    │  expanded project row (active)
│      The protagonist…        │  ← active conversation
│      Outline notes…          │
│      + New conversation      │  always last in expanded list
│  ▸ Chorum Dev          12    │
├──────────────────────────────┤
│  Recent                      │  unassigned conversations section
│      How do I…               │
│      Debug session           │
└──────────────────────────────┘
```

**Project row:**
- Click chevron or row: toggles expand/collapse
- Expanding triggers `onExpandProject(id)` if conversations not yet loaded (lazy fetch)
- Active project: `border-l-2 border-[var(--hg-accent)] bg-[var(--hg-surface)]`
- Conversation count shown at right edge, `text-[var(--hg-text-tertiary)]`
- Hover reveals a small `×` button at right edge to delete project

**Conversation item:**
- Click calls `onSelectConversation(id, projectId)`
- Preview text: `metadata.firstMessageSnippet` truncated to ~40 chars; fallback to `"New conversation"`
- Active conversation: `border-l-2 border-[var(--hg-accent)] text-[var(--hg-text-primary)]`
- Inactive: `border-l-2 border-transparent text-[var(--hg-text-secondary)]`

**"+ New conversation" item:**
- Always the last item in an expanded project's conversation list
- Styled: `text-[var(--hg-accent)] text-xs`
- Calls `onNewConversation(projectId)`

**"[+]" header button:** calls `onNewProject()` — creates project modal is managed by the parent page.

**"[×]" header button:** calls `onClose()`.

**"Recent" section:**
- Shown below the project list if `unassignedConversations.length > 0`
- Section label: `text-[var(--hg-text-tertiary)] text-[10px] uppercase tracking-wider`
- Conversations listed identically to project conversations, but `projectId = null`

---

## Step 5: Create Project Modal

Managed by the `/chat` page using `HyggeModal`. Not a separate component file.

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| Name | text input | Required. Max 60 chars. |
| Scope tags | text input | Comma-separated. Auto-prefix `#` if omitted. Example: `python, trading` → `#python, #trading` |
| Cross-lens access | `HyggeToggle` | Off by default. Label: "Surface learnings from all scopes, not just this project's tags." |

**On submit:** call `createProject(input)`, refresh project list via `getProjects()`, select new project (`handleSelectProject(newProject.id)`), close modal.

**On delete (triggered from ProjectsDrawer `×` button):**
Inline confirm: `"Delete [project name]? Conversations will remain."` using `window.confirm`.
Then: `deleteProject(id)`, remove from local projects state, deselect if was active project.

---

## Step 6: `AgentDrawer` Component

**File:** `src/components/shell/AgentDrawer.tsx`

### Interfaces

```typescript
export interface PersonaSummary {
  id: string
  name: string
  description: string
  isSystem: boolean
  temperature: number
  maxTokens: number
}

export interface CreatePersonaInput {
  name: string
  description: string
  systemPromptTemplate: string
  temperature: number      // 0.0–1.5, step 0.1
  maxTokens: number        // 512–8192
}

export interface AgentDrawerProps {
  personas: PersonaSummary[]
  activePersonaId: string     // empty string = default (no persona override)
  isOpen: boolean
  onSelectPersona: (id: string) => void
  onClearPersona: () => void
  onCreatePersona: (input: CreatePersonaInput) => Promise<void>
  onDeletePersona: (id: string) => Promise<void>
  onClose: () => void
}
```

### Structure

```
┌──────────────────────────┐
│  Persona          [+][×] │
├──────────────────────────┤
│  ● Default               │  active = accent left border
│    General assistant     │
├──────────────────────────┤
│  ○ Coder                 │  system persona (no delete)
│    Prefers explicit code │
│  ○ Writer                │
│    Narrative voice       │
├──────────────────────────┤
│  ○ My Analyst            │  user persona
│    Trading signals…   ×  │  × appears on hover (delete)
└──────────────────────────┘
```

**Persona rows:**
- Click selects persona, calls `onSelectPersona(id)`
- "Default" row calls `onClearPersona()`
- Active row: `border-l-2 border-[var(--hg-accent)] bg-[var(--hg-surface)]`
- Inactive: `border-l-2 border-transparent hover:bg-[var(--hg-surface-hover)]`
- Description shown as second line: `text-xs text-[var(--hg-text-tertiary)] truncate`
- User-created personas show `×` on hover — calls `onDeletePersona(id)`. System personas do not show `×`.

**No tier grouping.** v2 personas are not tiered — that was a v1 concept. All personas are in one flat list: system first, then user-created.

**No "details" sub-panel.** Keep it simple.

**"[+]" button:** opens create persona modal (managed by `/chat` page, not this component, using `HyggeModal`).

### Create Persona Modal Fields

| Field | Type | Notes |
|-------|------|-------|
| Name | text input | Required |
| Description | text input | Required; shown in drawer |
| System prompt | textarea | Required; min 2 rows |
| Temperature | number input | 0.0–1.5, step 0.1, default 0.7 |
| Max tokens | number input | 512–8192, default 2048 |

On submit: call `createPersona(userId, input)` (existing server action), refresh persona list, close modal.

---

## Step 7: `Omnibar` Component

**File:** `src/components/shell/Omnibar.tsx`

### Interfaces

```typescript
export interface OmnibarAttachment {
  type: 'image' | 'pdf' | 'text' | 'code' | 'markdown' | 'json'
  name: string
  content: string      // base64 data URL for image/pdf; raw text for text types
  mimeType: string
  sizeBytes: number
}

export interface OmnibarProps {
  onSend: (content: string, attachments: OmnibarAttachment[]) => void
  isStreaming: boolean
  providers: string[]            // names of configured providers (empty = no selector shown)
  selectedProvider: string | null
  onProviderChange: (provider: string | null) => void
  projectName?: string           // changes placeholder text when set
  disabled?: boolean
}
```

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [📎 types.ts ×]  [📎 schema.sql ×]                          │  chip row (only when attachments present)
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Message Chorum...                                          │  textarea (auto-resize 1–6 rows)
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📎                     │  anthropic ▾  │        [→]       │  footer toolbar
└─────────────────────────────────────────────────────────────┘
```

### Behavior

**Textarea:**
- Auto-resize: min-height `60px`, max-height `180px`. Compute via `scrollHeight`.
- `Enter` → calls `onSend`. `Shift+Enter` → inserts newline.
- Disabled while `isStreaming === true`.
- Placeholder: `"Message [projectName]..."` if `projectName` is set; else `"Message Chorum..."`.

**File attach:**
- Paperclip button triggers hidden `<input type="file" multiple />`.
- Accept: `image/*,.pdf,.txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs,.sql,.yaml,.yml`
- Limits: images 5MB (compress client-side via canvas before attaching), PDFs 5MB, text files 100KB.
- Files exceeding limits: `HyggeToast` error; do not add to attachments.
- Max 5 attachments: if exceeded, `HyggeToast` "Maximum 5 attachments per message."
- Drag & drop onto the textarea area is supported. `onDragOver` sets a highlight ring.

**Image compression (client-side):**
Before attaching an image, resize to max 1568px on the longest side, re-encode as JPEG at 80% quality using a `<canvas>`. Ported from v1's `compressImage()` utility.

**Attachment chips:**
- Render above the textarea when present.
- Format: `[📎 filename.ext  ×]`
- `×` removes the attachment from the list.

**Provider selector:**
- Only rendered if `providers.length > 1`.
- `<select>` in the footer toolbar, left of the send button.
- Options: `"auto"` (value `null`) + each provider name.
- Changing calls `onProviderChange`.

**Send button:**
- Disabled when: `isStreaming` OR `(content.trim() === '' AND attachments.length === 0)`.
- While streaming: show a `·` pulse animation instead of `→`.

---

## Step 8: Streaming — API Route and Hook Update

The existing `sendChatMessage` server action is synchronous (blocks until complete). This phase adds a real SSE streaming path.

### New API Route

**File:** `src/app/api/chat/stream/route.ts`

```typescript
// POST /api/chat/stream
// Body: StreamChatRequest (JSON)
// Response: text/event-stream (SSE)

import { z } from 'zod'

const StreamChatRequestSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1),
  personaId: z.string().uuid().optional(),
  selectedProvider: z.string().optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })),
  attachments: z.array(z.object({
    type: z.string(),
    name: z.string(),
    content: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number()
  })).optional().default([])
})

export type StreamChatRequest = z.infer<typeof StreamChatRequestSchema>

// SSE events (each line: "data: <JSON>\n\n")
type StreamEvent =
  | { type: 'context'; items: InjectedItem[] }
  | { type: 'token';   token: string }
  | { type: 'meta';    meta: StreamMeta }
  | { type: 'error';   message: string }
  | { type: 'done' }

export interface InjectedItem {
  id: string
  type: string
  content: string
  score: number
}

export interface StreamMeta {
  tokensUsed: number
  model: string
  agentUsed: string
  conversationId: string
}
```

**Route implementation contract:**
1. Authenticate via `getServerSession(authOptions)` — return `401` if no session
2. Validate body with `StreamChatRequestSchema` — return `400` on invalid
3. Validate that `conversationId` belongs to the authenticated user — return `403` if not
4. Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
5. Create a `ReadableStream` and begin the agent call
6. Call `AgentInterface.chat(input)` (the `AsyncGenerator<string>` path defined in `LAYER_CONTRACTS.md`)
7. Emit `context` event as soon as injected items are available (before first token)
8. Emit `token` events for each yielded chunk
9. After generator exhausts, emit `meta` then `done`
10. On any error: emit `error` event, close stream

**The `/api/chat/stream` route is the only place in Shell that calls `AgentInterface`.** No Shell component or server action initiates an agent chat session directly.

### Updated `useChat` Hook

**File:** `src/lib/shell/hooks.ts` — update `sendMessage` and expose new state.

The hook must expose:
```typescript
selectedProvider: string | null
setSelectedProvider: (p: string | null) => void
```

The updated `sendMessage` signature:
```typescript
const sendMessage: (content: string, attachments?: OmnibarAttachment[]) => Promise<void>
```

**sendMessage implementation contract:**
1. Ensure `conversationId` exists; if not, call `newConversation()` to create one
2. Append user message to `messages` state (optimistic)
3. Call `saveConversationMessages(cid, newMessages)` to persist
4. Set `isStreaming = true`
5. `fetch('/api/chat/stream', { method: 'POST', body: JSON.stringify({...}) })`
6. Read SSE stream with `response.body.getReader()`:
   - `context` event → call `setInjectedContext(items)`
   - `token` event → accumulate into a streaming assistant message in `messages` state
   - `meta` event → call `setResultMeta(meta)`
   - `done` event → finalize assistant message, call `saveConversationMessages(...)`, call `loadConversations()` to refresh the conversation list
   - `error` event → set `streamError` state (a new piece of state the hook exposes)
7. `setIsStreaming(false)` in a `finally` block

**Streaming assistant message:** The last `messages` entry (when `isStreaming`) is the accumulating assistant message. Its `content` grows token-by-token. The `MessageContent` component renders it progressively. A blinking cursor at the end is the streaming indicator — not a separate spinner.

**Fallback:** If the streaming fetch fails entirely (network error), fall back to `sendChatMessage` (the existing sync server action). This preserves functionality if the streaming route is unavailable.

---

## Step 9: `MessageContent` Component

**File:** `src/components/shell/MessageContent.tsx`

### Interface

```typescript
export interface MessageContentProps {
  content: string
  role: 'user' | 'assistant'
  isStreaming?: boolean   // shows blinking cursor at end when true
}
```

### Behavior

**User messages:** `whitespace-pre-wrap`, no markdown. Reason: user messages are rarely markdown; rendering them as markdown produces spurious formatting from stray `*` or `_`.

**Assistant messages:** rendered with `react-markdown` + `remarkGfm` + code syntax highlighting.

```typescript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
```

**`react-markdown` component overrides:**

| Element | Override |
|---------|----------|
| `code` (inline) | `<code className="bg-[var(--hg-surface)] px-1 py-0.5 text-[var(--hg-accent)] font-mono text-[0.85em] rounded-sm">` |
| `code` (block) | `<SyntaxHighlighter style={oneDark} language={lang} PreTag="div">` wrapped in a relative container with a copy button (top-right corner) |
| `a` | `target="_blank" rel="noreferrer"`, color `var(--hg-accent)`, underline on hover |
| `blockquote` | `border-l-2 border-[var(--hg-border-subtle)] pl-4 text-[var(--hg-text-secondary)]` |
| `table` | Wrapped in `overflow-x-auto`; `<th>` gets `bg-[var(--hg-surface)]`, all cells get `border border-[var(--hg-border)] px-3 py-1.5 text-sm` |
| `h1` | `text-lg font-medium mt-4 mb-2` |
| `h2` | `text-base font-medium mt-3 mb-1.5` |
| `h3` | `text-sm font-medium mt-2 mb-1` |

**Copy button for code blocks:**
- Positioned `absolute top-2 right-2`
- Text: `Copy` (12px, tertiary color)
- On click: `navigator.clipboard.writeText(codeContent)`, changes text to `Copied!` for 1500ms, then resets
- State: local `useState` inside the code block renderer — no separate component

**Streaming cursor:**
When `isStreaming === true`, append a `|` character with a CSS blink animation after the last content character. Use a `<span className="animate-pulse">|</span>`.

**No math (LaTeX), no raw HTML.** Deferred to v2.1.

---

## Step 10: Updated `/chat` Page

**File:** `src/app/(shell)/chat/page.tsx` — full replacement of the existing file.

The page orchestrates all components. It is the only place where project state, persona state, provider state, and chat state are combined.

### State

```typescript
// Layout
const [leftOpen, setLeftOpen] = useState<boolean>(() =>
  typeof window !== 'undefined'
    ? localStorage.getItem('chorum_projects_drawer_open') !== 'false'
    : true
)
const [rightOpen, setRightOpen] = useState<boolean>(() =>
  typeof window !== 'undefined'
    ? localStorage.getItem('chorum_agent_drawer_open') === 'true'
    : false
)

// Projects
const [projects, setProjects] = useState<Project[]>([])
const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
const [conversationsByProject, setConversationsByProject] =
  useState<Record<string, ConversationSummary[]>>({})
const [unassignedConversations, setUnassignedConversations] =
  useState<ConversationSummary[]>([])
const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null)
const [showNewProjectModal, setShowNewProjectModal] = useState(false)

// Personas
const [personas, setPersonas] = useState<PersonaSummary[]>([])
const [showNewPersonaModal, setShowNewPersonaModal] = useState(false)

// Providers (for Omnibar selector)
const [providers, setProviders] = useState<string[]>([])

// Toast
const [toast, setToast] = useState<string | null>(null)
```

### On mount

```typescript
useEffect(() => {
  Promise.all([
    getProjects().then(setProjects),
    getUnassignedConversations().then(setUnassignedConversations),
    getPersonas('').then(ps => setPersonas(ps.map(p => ({
      id: p.id, name: p.name, description: p.description,
      isSystem: p.isSystem, temperature: p.temperature, maxTokens: p.maxTokens
    })))),
    getUserProviders('').then(ps => setProviders(ps.map(p => p.provider)))
  ])
}, [])
```

### Persist drawer state

```typescript
useEffect(() => {
  localStorage.setItem('chorum_projects_drawer_open', String(leftOpen))
}, [leftOpen])

useEffect(() => {
  localStorage.setItem('chorum_agent_drawer_open', String(rightOpen))
}, [rightOpen])
```

### handleSelectProject

```typescript
const handleSelectProject = async (projectId: string | null) => {
  setActiveProjectId(projectId)
  await newConversation(undefined, projectId ?? undefined)
  if (projectId && !conversationsByProject[projectId]) {
    setLoadingProjectId(projectId)
    getConversationsForProject(projectId)
      .then(convos => {
        setConversationsByProject(prev => ({ ...prev, [projectId]: convos }))
      })
      .finally(() => setLoadingProjectId(null))
  }
}
```

### handleExpandProject (lazy load)

```typescript
const handleExpandProject = async (projectId: string) => {
  if (conversationsByProject[projectId]) return  // already loaded
  setLoadingProjectId(projectId)
  try {
    const convos = await getConversationsForProject(projectId)
    setConversationsByProject(prev => ({ ...prev, [projectId]: convos }))
  } finally {
    setLoadingProjectId(null)
  }
}
```

### handleCreateProject

```typescript
const handleCreateProject = async (input: CreateProjectInput) => {
  const project = await createProject(input)
  const updated = await getProjects()
  setProjects(updated)
  setShowNewProjectModal(false)
  await handleSelectProject(project.id)
}
```

### handleDeleteProject

```typescript
const handleDeleteProject = async (id: string) => {
  if (!window.confirm(`Delete "${projects.find(p => p.id === id)?.name}"? Conversations will remain.`)) return
  try {
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
    if (activeProjectId === id) setActiveProjectId(null)
  } catch {
    setToast('Failed to delete project')
  }
}
```

### JSX structure

```tsx
<div className="flex h-full w-full overflow-hidden">
  {toast && <HyggeToast message={toast} />}

  {/* Left drawer */}
  <div className={clsx(
    "flex-shrink-0 transition-all duration-200",
    leftOpen ? "w-60" : "w-0 overflow-hidden"
  )}>
    <ProjectsDrawer
      projects={projects}
      unassignedConversations={unassignedConversations}
      conversationsByProject={conversationsByProject}
      activeProjectId={activeProjectId}
      activeConversationId={conversationId}
      isOpen={leftOpen}
      loadingProjectId={loadingProjectId}
      onSelectProject={handleSelectProject}
      onSelectConversation={(id, pid) => { loadConversation(id); setActiveProjectId(pid) }}
      onNewConversation={pid => newConversation(undefined, pid ?? undefined)}
      onNewProject={() => setShowNewProjectModal(true)}
      onDeleteProject={handleDeleteProject}
      onExpandProject={handleExpandProject}
      onClose={() => setLeftOpen(false)}
    />
  </div>

  {/* Center: chat */}
  <div className="flex-1 flex flex-col min-w-0 bg-[var(--hg-bg)]">

    {/* Header */}
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--hg-border)] shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLeftOpen(!leftOpen)}
          className="hg-btn p-1.5"
          title="Toggle projects"
        >
          ☰
        </button>
        {activeProjectId && (
          <span className="text-xs text-[var(--hg-text-tertiary)]">
            {projects.find(p => p.id === activeProjectId)?.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {activePersona && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--hg-surface)] border border-[var(--hg-border)] text-xs text-[var(--hg-text-secondary)]">
            <span>{personas.find(p => p.id === activePersona)?.name ?? 'Custom'}</span>
            <button
              onClick={() => setActivePersona('')}
              className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)]"
            >
              ×
            </button>
          </div>
        )}
        <button
          onClick={() => setRightOpen(!rightOpen)}
          className="hg-btn p-1.5"
          title="Toggle agents"
        >
          ⊞
        </button>
      </div>
    </div>

    {/* Messages */}
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-8 pb-4">
      {messages.length === 0 && !isStreaming && emptyState}

      {messages.map((m, i) => (
        <div key={i} className={clsx(
          "flex flex-col max-w-3xl mx-auto",
          m.role === 'user' ? "items-end" : "items-start"
        )}>
          <div className={clsx(
            "px-4 py-3 text-sm",
            m.role === 'user'
              ? "bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-[var(--hg-text-primary)]"
              : "border-l-2 border-[var(--hg-accent)] pl-4 text-[var(--hg-text-primary)]"
          )}>
            <MessageContent
              content={m.content}
              role={m.role}
              isStreaming={isStreaming && i === messages.length - 1 && m.role === 'assistant'}
            />
          </div>

          {/* Injected context (only on last assistant message) */}
          {m.role === 'assistant' && i === messages.length - 1 && injectedContext.length > 0 && (
            <InjectedContextPanel
              items={injectedContext}
              onFeedback={handleFeedback}
              ratedItems={ratedItems}
            />
          )}

          {/* Result meta (last assistant message only) */}
          {m.role === 'assistant' && i === messages.length - 1 && resultMeta && (
            <div className="mt-1 flex items-center gap-4 text-[10px] text-[var(--hg-text-tertiary)] ml-4">
              <span>{resultMeta.model}</span>
              <span>{resultMeta.tokensUsed} tokens</span>
              {resultMeta.agentUsed && <span>{resultMeta.agentUsed}</span>}
            </div>
          )}
        </div>
      ))}

      {streamError && (
        <div className="max-w-3xl mx-auto ml-0 px-4 py-2 text-xs text-[var(--hg-destructive)] border-l-2 border-[var(--hg-destructive)]">
          {streamError}
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>

    {/* Omnibar */}
    <div className="px-4 md:px-8 py-4 border-t border-[var(--hg-border)] shrink-0">
      <div className="max-w-3xl mx-auto">
        <Omnibar
          onSend={(content, attachments) => sendMessage(content, attachments)}
          isStreaming={isStreaming}
          providers={providers}
          selectedProvider={selectedProvider}
          onProviderChange={setSelectedProvider}
          projectName={activeProjectId
            ? projects.find(p => p.id === activeProjectId)?.name
            : undefined
          }
        />
      </div>
    </div>
  </div>

  {/* Right drawer */}
  <div className={clsx(
    "flex-shrink-0 transition-all duration-200 border-l border-[var(--hg-border)]",
    rightOpen ? "w-56" : "w-0 overflow-hidden border-l-0"
  )}>
    <AgentDrawer
      personas={personas}
      activePersonaId={activePersona}
      isOpen={rightOpen}
      onSelectPersona={setActivePersona}
      onClearPersona={() => setActivePersona('')}
      onCreatePersona={async (input) => {
        await createPersona(userId, input)
        const updated = await getPersonas(userId)
        setPersonas(updated.map(p => ({ ...p })))
      }}
      onDeletePersona={async (id) => {
        await deletePersona(id, userId)
        setPersonas(prev => prev.filter(p => p.id !== id))
      }}
      onClose={() => setRightOpen(false)}
    />
  </div>

  {/* Modals */}
  {showNewProjectModal && (
    <NewProjectModal
      onSubmit={handleCreateProject}
      onClose={() => setShowNewProjectModal(false)}
    />
  )}
</div>
```

### `InjectedContextPanel` (extracted sub-component)

**File:** inline in `/chat` page as a local component (not a separate file — it is only used here).

Replaces the existing collapsible context block. Same behavior: collapsed by default, shows count, expands to show each item with feedback buttons.

```typescript
function InjectedContextPanel({
  items,
  onFeedback,
  ratedItems
}: {
  items: InjectedItem[]
  onFeedback: (item: InjectedItem, idx: number, signal: 'positive' | 'negative') => void
  ratedItems: Record<number, 'positive' | 'negative'>
})
```

---

## Step 11: Nebula Health Charts — `/knowledge` Page

Add a "Nebula Health" section at the **top** of the existing `/knowledge` page, before the learning list. This is a new section within the existing route — no new page.

### New Server Action

Add to `src/lib/shell/actions.ts`:

```typescript
export interface NebulaStats {
  totalLearnings: number
  byType: Record<string, number>    // e.g. { invariant: 12, pattern: 34 }
  confidenceDistribution: {
    bucket: '0–0.2' | '0.2–0.4' | '0.4–0.6' | '0.6–0.8' | '0.8–1.0'
    count: number
  }[]
  topScopes: { scope: string; count: number }[]   // top 8 scopes by learning count
  injectionsByDay: { date: string; count: number }[]  // last 14 days, ISO date strings
}

export async function getNebulaStats(): Promise<NebulaStats>
```

**Implementation queries (all scoped to `userId`):**

```sql
-- byType
SELECT type, COUNT(*) as count
FROM learnings WHERE user_id = $userId
GROUP BY type;

-- confidenceDistribution
SELECT
  CASE
    WHEN confidence < 0.2 THEN '0–0.2'
    WHEN confidence < 0.4 THEN '0.2–0.4'
    WHEN confidence < 0.6 THEN '0.4–0.6'
    WHEN confidence < 0.8 THEN '0.6–0.8'
    ELSE '0.8–1.0'
  END as bucket,
  COUNT(*) as count
FROM learnings WHERE user_id = $userId
GROUP BY bucket ORDER BY bucket;

-- topScopes
SELECT ls.scope, COUNT(*) as count
FROM learning_scopes ls
JOIN learnings l ON l.id = ls.learning_id
WHERE l.user_id = $userId
GROUP BY ls.scope ORDER BY count DESC LIMIT 8;

-- injectionsByDay (last 14 days)
SELECT DATE(created_at) as date, COUNT(*) as count
FROM injection_audit
WHERE user_id = $userId
  AND included = true
  AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at)
ORDER BY date ASC;
```

### Charts Component

**File:** `src/components/shell/NebulaCharts.tsx` — `'use client'` component.

**Dynamic import in `/knowledge` page:**
```typescript
const NebulaCharts = dynamic(
  () => import('@/components/shell/NebulaCharts'),
  { ssr: false, loading: () => <div className="h-32" /> }
)
```

#### Stat Bar (above charts)

```
247 total learnings  ·  5 scopes active  ·  injections: 89% this week
```

- `totalLearnings` from `stats.totalLearnings`
- `scopes active` = `stats.topScopes.length`
- `injections this week` = `(sum of last 7 days from injectionsByDay / 7)` formatted as count per day average, OR if no injection data yet: `"none yet"`.

#### Chart 1: Type Breakdown — Horizontal Bar

```
Rule        ████████████████  12
Pattern     ██████████████████████  18
Decision    ████  6
Avoid       ██  3
```

- Recharts `BarChart` with `layout="vertical"`, `margin={{ top: 0, right: 20, bottom: 0, left: 60 }}`
- `YAxis type="category"` with `dataKey="name"` — use `HUMAN_TYPE_MAP` to label
- `XAxis type="number"` — hide labels (`tick={false}`, `axisLine={false}`)
- `Bar dataKey="count"` fill `var(--hg-accent)`, `radius={[0, 2, 2, 0]}`
- `Tooltip` — hygge-styled, shows `${name}: ${count} learnings`
- Height: `Math.max(100, Object.keys(stats.byType).length * 28)` px

#### Chart 2: Confidence Distribution — Histogram

```
     ┌──┐
     │  │         ┌──┐
  ┌──┤  ├──────┐  │  │
──┘  └──┘      └──┘  └──
0   .2   .4   .6   .8  1.0
```

- Recharts `BarChart`, `margin={{ top: 4, right: 4, bottom: 20, left: 0 }}`
- `XAxis dataKey="bucket"` — 5 category labels
- `Bar dataKey="count"` — fill varies by bucket:
  - `0–0.2`: `var(--hg-text-tertiary)`
  - `0.2–0.4`: `#5a6478`
  - `0.4–0.6`: `#4a7a9b`
  - `0.6–0.8`: `var(--hg-accent)`
  - `0.8–1.0`: `var(--hg-accent)` at full opacity
- `ReferenceLine x="0.4–0.6"` — dashed line, label "threshold" at 35% confidence (closest bucket to 0.35)
- Height: 120px

#### Chart 3: Injection Activity — Area Sparkline

- Recharts `AreaChart`, `margin={{ top: 4, right: 0, bottom: 0, left: 0 }}`
- `XAxis` hidden (`hide={true}`)
- `YAxis` hidden
- `Area dataKey="count"` — fill `var(--hg-accent-muted)`, stroke `var(--hg-accent)`, `strokeWidth={1.5}`
- `Tooltip` — shows `date: N injections`
- Height: 72px
- If all values are 0: render `<p className="text-xs text-[var(--hg-text-tertiary)] text-center py-6">No injections yet — start chatting</p>` instead of the chart

#### Layout of the charts section

```tsx
<section className="mb-10">
  <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
    Nebula Health
  </h2>

  {/* Stat bar */}
  <div className="flex gap-4 text-sm text-[var(--hg-text-secondary)] mb-6">
    <span>{stats.totalLearnings} total</span>
    <span className="text-[var(--hg-text-tertiary)]">·</span>
    <span>{stats.topScopes.length} scopes</span>
    <span className="text-[var(--hg-text-tertiary)]">·</span>
    <span>{injectionSummary}</span>
  </div>

  {/* Three charts in a row — responsive: stack on small screens */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">Types</p>
      <TypeBreakdownChart data={...} />
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">Confidence</p>
      <ConfidenceDistributionChart data={...} />
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">Injections — last 14 days</p>
      <InjectionSparkline data={...} />
    </div>
  </div>
</section>
```

---

## Step 12: Score Bars — `/audit` Page

Minimal change. Replace the plaintext score display on each audit row.

**Find this pattern in `src/app/(shell)/audit/page.tsx`:**
```tsx
<div className="hg-stat-line justify-end gap-2">
  <span className="hg-label text-[10px]">score</span>
  <span className="hg-value text-xs font-mono">{row.score.toFixed(3)}</span>
</div>
```

**Replace with:**
```tsx
<div className="flex items-center gap-2 justify-end">
  <div className="w-14 h-1 bg-[var(--hg-border)] rounded-full overflow-hidden">
    <div
      className="h-full rounded-full"
      style={{
        width: `${Math.min(row.score * 100, 100)}%`,
        background: row.included
          ? 'var(--hg-accent)'
          : 'var(--hg-text-tertiary)'
      }}
    />
  </div>
  <span className="text-[10px] font-mono text-[var(--hg-text-tertiary)] w-10 text-right tabular-nums">
    {row.score.toFixed(3)}
  </span>
</div>
```

No dependency change. No other modifications to the audit page.

---

## Invariants

1. **Shell is stateless.** No business logic in `src/components/shell/` or `src/app/(shell)/`. No scoring, no confidence adjustments, no embedding computation.

2. **No inner-layer imports from Shell.** Components import from `src/lib/shell/actions.ts` (server actions) or call `/api/chat/stream`. No direct imports from `src/lib/nebula/`, `src/lib/core/`, `src/lib/customization/`, or `src/lib/agents/`.

3. **`/api/chat/stream` is the only Shell entry point for agent calls.** No other API route starts an agent session.

4. **Projects do not own learnings.** `ProjectsDrawer` shows conversations. Selecting a project sets a `scopeFilter` on the conversation, not an ownership relationship. A learning tagged `#python` is visible to any project that includes `#python` in its scope filter.

5. **Charts are client-only.** All Recharts components are `'use client'` or dynamically imported with `ssr: false`.

6. **No `any`.** All server action return types typed. All component props typed. All chart data shapes typed.

7. **Drawer state is persisted in localStorage, not in URL.** Drawer visibility is a presentation preference, not a navigation state.

8. **Attachments are not stored.** They are sent inline with the streaming request. If users want persistent documents, they use `/knowledge`.

---

## Error Handling

| Error scenario | Behavior |
|----------------|----------|
| `createProject` fails | `HyggeToast`: "Failed to create project" |
| `deleteProject` fails | `HyggeToast`: "Failed to delete project" |
| `getConversationsForProject` fails | Drawer shows project with spinner → reverts to no count, no conversations listed |
| `/api/chat/stream` returns 401 | `window.location.href = '/api/auth/signin'` |
| `/api/chat/stream` returns 400 | Inline error below messages: "Invalid request" |
| `/api/chat/stream` network failure | Fall back to `sendChatMessage` server action; inform user via meta area |
| Stream `error` event received | Show inline error below messages; preserve partial response; re-enable Omnibar |
| File too large | Inline error: `"[filename] exceeds [limit]"` (not a toast) |
| `getNebulaStats` fails | Charts section hidden entirely, no error shown |
| Persona create fails | `HyggeToast`: "Failed to create persona" |

---

## Testing Contract

### New test file: `src/__tests__/shell/projects.test.ts`

```typescript
it('getProjects returns projects ordered by updatedAt DESC')
it('createProject sets default scopeFilter when not provided')
it('createProject includes provided scope tags')
it('deleteProject succeeds; subsequent getProjects excludes deleted project')
it('deleteProject throws UNAUTHORIZED for foreign project')
it('updateProject throws UNAUTHORIZED for foreign project')
it('getConversationsForProject returns only conversations for that project')
it('getUnassignedConversations returns only conversations with null projectId')
it('startChatSession with projectId sets scopeTags from project.scopeFilter.include')
```

### New test file: `src/__tests__/shell/stream.test.ts`

```typescript
it('POST /api/chat/stream returns 401 when unauthenticated')
it('POST /api/chat/stream returns 400 on invalid body')
it('POST /api/chat/stream emits context event before first token')
it('POST /api/chat/stream emits done as final event')
it('POST /api/chat/stream emits error event and closes on agent failure')
```

### Component render tests (one per component, minimum)

```typescript
it('ProjectsDrawer renders project list and toggles expand on click')
it('ProjectsDrawer renders Recent section when unassignedConversations present')
it('AgentDrawer renders personas; active persona has accent border')
it('AgentDrawer does not show delete button on system personas')
it('Omnibar disables send when isStreaming === true')
it('Omnibar shows provider selector when providers.length > 1')
it('MessageContent renders code block with SyntaxHighlighter for assistant messages')
it('MessageContent does NOT render markdown for user messages')
it('NebulaCharts renders three chart sections when data present')
it('NebulaCharts renders empty state for InjectionSparkline when all counts are 0')
```

---

## Completion Criteria

Phase 5B is complete when **all** of the following are true:

- [ ] `getProjects`, `createProject`, `updateProject`, `deleteProject`, `getConversationsForProject`, `getUnassignedConversations` server actions exist and pass tests
- [ ] `startChatSession` accepts optional `projectId` and sets `scopeTags`
- [ ] `getNebulaStats` server action exists and passes tests
- [ ] `/chat` page renders 4-frame layout (ShellSidebar + ProjectsDrawer + Chat + AgentDrawer)
- [ ] Both drawers are independently togglable; state persists in localStorage
- [ ] `ProjectsDrawer` shows project list; conversations load lazily on expand
- [ ] Creating a project from the drawer creates it, selects it, and starts a scoped conversation
- [ ] Deleting a project from the drawer works with confirm dialog
- [ ] `AgentDrawer` lists personas; active persona shows in chat header chip; clearing works
- [ ] Creating a custom persona from the drawer works
- [ ] Deleting a user persona from the drawer works (system personas cannot be deleted)
- [ ] `Omnibar` replaces the plain `HyggeInput`; text, files, and provider selection work
- [ ] File attachment size limits enforced; over-limit files show inline error
- [ ] Chat messages stream progressively via SSE; tokens appear as they arrive
- [ ] Fallback to `sendChatMessage` if streaming route unavailable
- [ ] Assistant messages render markdown; code blocks have syntax highlighting and copy button
- [ ] User messages do not render markdown
- [ ] Streaming cursor visible while response is in progress
- [ ] `/knowledge` page shows Nebula Health section (3 charts) above the learning list
- [ ] All three charts render with real data (or graceful empty states)
- [ ] `/audit` page rows show score bars (accent = included, tertiary = excluded)
- [ ] `chorum-layer-guardian` passes on all new/modified Shell files
- [ ] `npx next build` passes with zero type errors

---

## What v1 Got Wrong

| v1 Mistake | v2 Fix in 5B |
|------------|--------------|
| `ProjectItem` in Sidebar — projects owned conversations; deleting a project deleted its conversations | `ProjectsDrawer` shows projects as scope-filter views; conversations survive project deletion |
| `AgentPanel` used `useAgentStore` (Zustand) for persona state; business logic in client store | `AgentDrawer` loads personas via server action; no client-side store for persona logic |
| `ChatPanel` was 530 lines mixing input, file handling, streaming, and rendering | Split across `Omnibar`, `MessageContent`, `useChat`, and `/api/chat/stream` |
| No streaming — `sendMessage` was a blocking server action | SSE streaming via `/api/chat/stream`; tokens render as they arrive |
| `KnowledgeGateway` was hidden inside a side panel; the Nebula was invisible | Nebula Health charts are the first thing on `/knowledge`; they show growth, confidence, and activity |
| Scores were plaintext: `0.842` — meaningless to a human at a glance | Score bars make included vs excluded and relative score immediately readable |
| H4X0R mode, green-screen emulator — personality over utility | Hygge only |
