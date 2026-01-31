# Quickstart Guide

Get Chorum running in 5 minutes. No fluff, just the essentials.

---

## Step 1: Access Chorum

### Cloud Version (Easiest)
Go to [app.chorumai.com](https://app.chorumai.com) and sign in.

### Self-Hosted
```bash
git clone https://github.com/ChorumAI/chorum-ai.git
cd chorum-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Step 2: Sign In

You can sign in with:
- **Google** — Click "Continue with Google"
- **Email/Password** — Create an account or sign in

First time? You'll be walked through a quick onboarding.

---

## Step 3: Add an API Key

Before you can chat, you need at least one LLM provider key.

1. Click **Settings** (gear icon in sidebar)
2. Go to the **Providers** tab
3. Click **Add Provider**
4. Choose your provider and paste your API key:

| Provider | Get a Key At |
|----------|--------------|
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI (GPT) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google (Gemini) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Don't have a key? Start with Anthropic or OpenAI — both offer free credits for new accounts.

---

## Step 4: Create Your First Project

Projects are like folders for your conversations. Each one has its own memory.

1. Click **+ New Project** in the sidebar
2. Give it a name (e.g., "My Next.js App", "Learning Rust", "Work Stuff")
3. Click **Create**

---

## Step 5: Send Your First Message

Type something in the chat box and hit Enter.

```
What are the best practices for error handling in TypeScript?
```

Watch the magic:
- Chorum picks the best provider for your question
- The response streams in real-time
- You'll see the cost in the bottom-right corner

---

## You're In!

That's it. You're using Chorum.

**Next steps to explore:**

- **[Select an Agent](../agents/overview.md)** — Try the Analyst, Architect, or Code Reviewer
- **[Phone a Friend](../chat/peer-review.md)** — Get a second opinion on AI responses
- **[Set Budgets](../settings/budgets.md)** — Control your daily spending
- **[H4X0R CLI](../cli/overview.md)** — Access Chorum from your terminal

---

## Quick Reference

| Action | How |
|--------|-----|
| New message | Type + Enter |
| Pick provider | Click provider pill in header |
| Switch project | Click project in sidebar |
| New conversation | Click **New Chat** in sidebar |
| Settings | Click gear icon in sidebar |
| Keyboard shortcut | `Cmd/Ctrl + Enter` to send |

---

*5 minutes is up. Go build something.*
