---
title: Projects Overview
description: Organize your work with isolated memory spaces.
---

# Projects Overview

Projects are the fundamental unit of organization in Chorum. Each project has its own isolated memory, settings, and context.

## Why This Matters

When you switch between "Marketing Site" and "Backend API", you don't want your AI to get confused. You don't want it suggesting React patterns when you're writing Go code.

Chorum's project system ensures that:

- **Context is isolated** — Patterns learned in Project A don't leak into Project B
- **Settings are scoped** — Each project can have its own custom instructions and resilience settings
- **Focus is maintained** — The AI only knows what matters for the current task

---

## Creating a Project

1. Click the **Project Selector** in the top left sidebar
2. Click **+ New Project**
3. Enter a name and optional description
4. Click **Create**

Your new project starts with a blank memory slate, ready to learn.

---

## Managing Projects

### Switching Projects

Click the project name in the sidebar to open the project list, then select the project you want to work on.

### Project Settings

Each project has specific settings available under **Settings → Project**:

- **Name & Description** — Update details
- **Custom Instructions** — Instructions injected into every prompt for this project
- **Tech Stack** — Define the technologies used (e.g., "Next.js, TypeScript, Tailwind")

### Deleting a Project

**Warning:** Deleting a project is permanent. All memory, conversations, and patterns associated with it will be lost.

1. Go to **Settings → Project**
2. Scroll to **Danger Zone**
3. Click **Delete Project**
4. Confirm by typing the project name

---

## Project Memory

Each project builds its own "brain" over time. As you work, Chorum extracts:

- **Patterns** specific to this codebase
- **Decisions** made for this architecture
- **Invariants** that apply only here

You can view a project's memory in **Settings → Memory & Learning**.

→ See **[Memory Overview](../memory/overview.md)** for details.

---

## Best Practices

### One Repo = One Project

We recommend creating a separate Chorum project for each git repository you work on. This maps 1:1 with your codebase's context.

### Descriptive Names

Use names that distinguish projects clearly (e.g., "Chorum API" vs "Chorum Frontend" if they are separate repos).

### Set the Tech Stack

Always fill out the **Tech Stack** in project settings. This gives the AI immediate context about what tools are available, even before it learns anything else.

---

## Related Documentation

- **[Memory Overview](../memory/overview.md)** — How project memory works
- **[Managing Memory](../memory/management.md)** — Editing project learnings
- **[Exporting](../sovereignty/export-import.md)** — Backing up project data
