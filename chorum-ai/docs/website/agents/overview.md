# What are Agents?

Agents are specialized AI personas. Instead of one generic assistant, you get 14 experts.

---

## The Agent Panel

Click the agent icon in the header to open the agent panel:

![Agent selector panel](../images/agentselect.jpg)

Each agent card shows:
- **Name** and **icon**
- **Role description** (what it does)
- **Tier badge** (Reasoning, Balanced, or Fast)
- **Semantic Focus** — the question it asks of your project memory

---

## Why Use Agents?

Different tasks need different approaches:

| Task | Agent | Why |
|------|-------|-----|
| Analyze data patterns | **Analyst** | Methodical, evidence-based |
| Design a system | **Architect** | Thinks in tradeoffs and constraints |
| Find bugs | **Debugger** | Traces root causes systematically |
| Review code | **Code Reviewer** | Security, quality, maintainability |
| Write content | **Writer** | Clear, engaging prose |
| Learn something | **Tutor** | Explains concepts, guides learning |
| Break down goals | **Planner** | Actionable tasks, dependencies |

Each agent has a distinct personality, approach, and even model preferences.

---

## The Three Tiers

Agents are organized by how they think:

### 🧠 Reasoning Tier (Deep Thinking)
**Agents:** Analyst, Architect, Code Reviewer, Debugger

For complex analysis and decisions. Uses:
- Low temperature (more precise)
- Extended thinking time
- Higher-quality models (Opus, GPT-4)
- Chain-of-thought reasoning

### ⚖️ Balanced Tier (Versatile)
**Agents:** Researcher, Writer, Editor, Copywriter, Fact Checker, Planner, Translator, Tutor

For most everyday tasks. Uses:
- Medium temperature
- Good balance of speed and quality
- Cost-conscious model selection

### ⚡ Fast Tier (Speed-First)
**Agents:** Summarizer, Coordinator

For quick tasks that don't need deep thinking. Uses:
- Fastest models (Haiku, mini)
- Minimal tokens
- Lowest latency

---

## Selecting an Agent

1. Click the **agent icon** in the chat header (or sidebar)
2. Browse by tier (Reasoning, Balanced, Fast)
3. Click an agent to select it
4. The agent's personality and approach apply to your next message

Your selection persists for the conversation. Change it anytime.

---

## Semantic Focus (The Secret Sauce)

Each agent asks a *different question* of your project memory.

| Agent | What It Asks Memory |
|-------|---------------------|
| **Analyst** | "What patterns exist? What do they mean?" |
| **Architect** | "What are the constraints? What patterns fit?" |
| **Researcher** | "What does this project need to know?" |
| **Writer** | "Who is the audience? What tone fits?" |
| **Planner** | "What's the goal? What are the constraints?" |

This means the same memory gives different context to different agents. An Analyst sees patterns; a Writer sees audience.

---

## Default Agent

"Auto Agent" is the default. It's a general-purpose assistant that:
- Works for most tasks
- Doesn't have specialized behaviors
- Good when you're not sure which agent to use

Switch to a specialized agent when you want more focused help.

---

→ **Next:** [Built-in Agents](./built-in.md)
