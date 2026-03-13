# Chorum Health — Vision Brief

> A personal health intelligence layer that connects wearable data, clinical records,
> and years of lab history into a single, governed, conversational system.

---

## The Problem

Your health data lives in fragments. Garmin knows your heart rate. Your cardiologist has your ICD transmissions. Quest has five years of metabolic panels. MyChart has your visit notes. None of them talk to each other, and none of them tell you what the pattern across all of it actually means.

---

## What Chorum Health Does

Chorum Health ingests all of it — structured and unstructured, dynamic and static — encrypts it at rest under a dedicated key, and makes it available to a governed AI that knows how to read a medical record and has your full history in context every time you ask a question.

---

## Powered by Chorum's Cognitive System

Chorum Health is built on the same intelligence layer that runs Chorum's core product: **The Conductor**.

The Conductor decides what knowledge reaches the model on every call. In the health context, this means:

- **Layered context injection** — recent wearable data and years of lab history are assembled and de-identified before every AI call, so the model always has the right data, not just the newest data
- **Longitudinal awareness** — monthly analysis cross-references recent behavior against the full historical record; a single lipid panel is noise, five years of them against activity and sleep trends is a signal
- **Governed retrieval** — the Health Monitor agent operates on a locked topic scope with no access to Chorum's general memory system; health data stays in health

---

## Core Capabilities

### 1 — Cross-Temporal Health Correlation
Static blood draws (metabolic panels, lipid profiles, HbA1c) are analyzed against dynamic wearable data (HRV, resting HR, sleep quality, step trends). A quarterly lab result means something different when the preceding 30 days show reduced activity and elevated stress markers. Chorum Health finds that connection automatically, monthly.

### 2 — Conversational Health Intelligence
A dedicated Health Monitor AI with your full de-identified health history in context — recent Garmin data in one layer, years of labs and device reports in another. Ask a specific question ("what's my 6-month HRV trend?") or ask an open one ("anything I should know going into my cardiology appointment?"). Off-topic requests are redirected, not entertained.

### 3 — Camera OCR for Clinical Documents
Photograph a lab result, an ICD transmission report, or a specialist's summary. Within seconds, a Vision-capable model extracts structured values — panel names, individual lab markers, reference ranges, device battery status, arrhythmia counts — and stores them alongside your Garmin data as encrypted, queryable records.

### 4 — Cardiac Device Report Ingestion
ICD and pacemaker transmission reports (Medtronic, Abbott, Boston Scientific) are typically multi-page TIFFs faxed to a clinic. Chorum Health accepts TIFF uploads, converts them to indexed pages, extracts structured fields via OCR, and makes the data available in the same timeline as your daily wearable metrics. Your device and your body in one view.

### 5 — Automated Weekly + Monthly Analysis
Two separate cron-driven analyses run automatically:
- **Weekly checkup** — what happened this week, flagged against clinical reference ranges
- **Monthly longitudinal** — what the last 30 days means in the context of your full history

Both are stored as structured snapshots, surfaced in the timeline, and referenced by the Health Monitor in conversation.

### 6 — Health Connect + Garmin Sync
Android Health Connect and Garmin are synced automatically every 6 hours. Garmin credentials are stored encrypted with a circuit breaker — 3 consecutive API failures open the circuit and suppress retries for 24 hours, preventing lockouts. Health Connect data flows from the mobile app. Both sources normalize to the same internal schema.

---

## Security

**Separate encrypted database.** Health data lives in a dedicated Supabase project — a different PostgreSQL instance from Chorum core. The two databases do not share a connection string, an encryption key, or a service account. Compromise of one does not imply compromise of the other.

**AES-256-GCM with per-record IVs.** Every snapshot is encrypted individually with a random 16-byte IV and GCM authentication tag before it touches the database. Decryption requires the `HEALTH_ENCRYPTION_KEY` — a key that is asserted at startup to differ from every other key in the system.

**HIPAA Safe Harbor de-identification at the LLM boundary.** Eighteen identifier categories (names, dates, MRNs, phone numbers, SSNs, device IDs, etc.) are scrubbed from all data before it reaches any language model. Clinical values — lab numbers, vital signs, HRV readings — pass through unchanged. De-identification is one-directional and applied only at injection; stored records retain full fidelity.

**Audit log on every PHI access.** Every read, write, and delete operation against health snapshots writes an entry to `phi_audit_log` — user ID, actor, action, resource, timestamp. The log is append-only for authenticated users; writes require the service role key. Weekly integrity checks sample 20% of stored snapshots and verify SHA-256 hashes against re-derived values, flagging any mismatch.

---

## What This Is Not

- Not a diagnostic tool. Not a replacement for clinical care.
- Not a general-purpose AI assistant. The Health Monitor discusses health, nutrition, and medicine — nothing else.
- Not a data aggregator that sells or shares your records. One user, one encrypted store, one governed agent.

---

*Chorum Health — Phase 1–6 implementation complete. Built on Next.js, Supabase, Drizzle ORM, Expo (Android), and Anthropic claude-sonnet-4-6.*
