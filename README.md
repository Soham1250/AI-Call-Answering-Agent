
# AI Call Answering Agent (Free‑First) — Implementation Guide for the Coding Agent

**Owner:** ImperialX • **Timezone:** Asia/Kolkata • **Created:** 2025-08-12

This repository scaffolds a multilingual, low‑latency AI answering agent that **never makes promises** and **only answers from an approved KB**. Your job as the coding agent is to complete the implementation by following the tasks, constraints, and acceptance tests below.

---

## 🚀 Quickstart (Local Dev)

- __Requirements__: Node.js 18+; npm (or pnpm/yarn). Windows supported.
- __Install__:
  - `npm i`
- __Environment__:
  - Copy `.env.example` to `.env`
  - Set: `TTS_KEY` (Azure Speech key), `AZURE_REGION` (e.g., `eastus`), optional `PORT` (default `3000`)
  - Example `.env`:
    ```env
    TTS_KEY=your-azure-speech-key
    AZURE_REGION=eastus
    PORT=3000
    ```
- __Run dev server__:
  - `npm run dev`
  - Visit http://localhost:3000/health and http://localhost:3000/health/tts
  - Both should return JSON with `ok: true` when env is configured
- __Build & start__:
  - `npm run build`
  - `npm start`

## 📦 Scripts

- `npm run dev` — tsx watch on `src/server.ts`
- `npm run build` — TypeScript build to `dist/`
- `npm start` — run compiled server
- `npm run test` — run unit tests once (Vitest)
- `npm run test:watch` — watch mode
- `npm run test:coverage` — coverage
- `npm run lint` — ESLint
- `npm run format` — Prettier

## 🔗 Endpoints (current)

- `GET /health` — overall health + TTS status
- `GET /health/tts` — TTS-only health
- `POST /voice/inbound` — Twilio webhook stub (returns TwiML)
- `POST /voice/assistant` — Assistant leg stub (returns TwiML)
- `WS /media/stream` — WebSocket (echo for now)

Source: `src/server.ts`

## 🧪 Testing

- Unit tests: `npm run test`
- Notable tests:
  - `src/__tests__/tts.test.ts` — Azure TTS adapter (axios mocked)
  - `src/__tests__/simple.test.ts` — basic sanity

## 🌐 Twilio (dev) quick notes

- Expose local server: `ngrok http 3000`
- Set Twilio Voice webhook → `POST https://<ngrok-host>/voice/inbound`
- Trial accounts may require verified caller IDs

## 🐛 Troubleshooting

- 404 on `/health`: server not running or different port. Check logs and `PORT`.
- `/health/tts` shows `ok: false`: ensure both `TTS_KEY` and `AZURE_REGION` are set, then restart.
- Windows: if port blocked, allow Node.js in Windows Defender Firewall.

## 🔑 Non‑Negotiables (Guardrails)

1. The LLM is **classifier/extractor only** (intent, entities). It must **not author** the final reply.
2. The final reply must come from a **KB template** when `τ ≥ 0.82 AND answer_present==true`. Otherwise, speak the **fallback line** and enter **message capture**.
3. No commitments or scheduling. Never use phrases like *I will arrange, I guarantee, You can expect*.
4. Enforce daily cap of **10 assistant calls/day** (Asia/Kolkata). Overflow → voicemail or WhatsApp auto‑reply.
5. Latency targets per turn: **≤1.5s** total (ASR ≤500ms partials, LLM ≤250ms, TTS first‑byte ≤700ms).

---

## 🧱 Target Free‑First Stack

- **Telephony (dev):** Twilio trial (webhooks & media streams). For prod, we’ll swap to SIP/Asterisk if needed.
- **ASR:** Deepgram (free tier) or Whisper.cpp local.
- **TTS:** Azure Neural Voices (free tier) or Coqui local.
- **LLM (NLU only):** Local Mistral/Phi via Ollama (or an equivalent light model). Temperature 0.2.
- **API Server:** Node.js + Fastify + WebSocket.
- **DB:** Postgres (Supabase free tier for hosted) — migrations via SQL files.
- **KB:** Markdown entries with YAML front‑matter + embeddings (DuckDB/SQLite).

You may propose minimal deviations if it keeps the solution free and within latency.

---

## 📁 Repo Layout

```
ai-call-agent/
  ├─ src/
  │  ├─ server.ts            # HTTP/WebSocket server (Fastify)
  │  ├─ routes/              # Webhook handlers (to implement)
  │  └─ lib/
  │     ├─ rateLimit.ts      # Daily cap logic (stubbed)
  │     └─ decide.ts         # Final reply decision (template/fallback)
  ├─ kb/
  │  └─ entries/             # YAML+MD KB docs (sample provided)
  ├─ config/
  ├─ scripts/
  ├─ .github/workflows/
  ├─ .env.example
  ├─ package.json
  ├─ tsconfig.json
  └─ README.md
```

---

## 🛠️ Your Tasks (in order)

### T1 — Inbound → Whisper → Forward (Vertical Slice)
- Implement `POST /voice/inbound` to return TwiML:
  - Whisper to ImperialX: “Press * to forward to AI assistant.”
  - If `*` pressed → redirect to `POST /voice/assistant`.
- Implement `POST /voice/assistant`:
  - Create `call_session` (DB).
  - Check daily cap; if exceeded, play overflow prompt and end.
  - Otherwise, respond with a short greeting.
- **Acceptance:** A real test call reaches the assistant leg after pressing `*`.

**TwiML sketch (for reference):**
```xml
<Response>
  <Say>Connecting you to ImperialX. Press star to forward to assistant.</Say>
  <!-- Coding agent will implement whisper + DTMF logic using Twilio APIs -->
</Response>
```

### T2 — Language Menu + Consent
- On assistant leg, ask for language (DTMF `1` EN, `2` HI, `3` MR), with short speech fallback.
- Store locale in DB and say one‑line consent (“This call may be recorded…”).
- **Acceptance:** Locale stored; consent text recorded in `consents` table.

### T3 — Streaming Media Loop
- Upgrade to WebSocket/SIP media stream endpoint `/media/stream`.
- Implement ASR streaming (Deepgram or Whisper local).
- Implement TTS streaming (Azure or Coqui). Support barge‑in (stop TTS on user speech).
- **Acceptance:** Round‑trip partials under 500ms; first TTS audio under 700ms on local tests.

### T4 — NLU (LLM) as Classifier/Extractor Only
- Implement `classify(text, locale)` → returns JSON:
  ```json
  {"intent":"faq|leave_message|request_handoff|small_talk", "topics":[], "entities":{}, "urgency":"low|normal|high"}
  ```
- Use a local LLM (Ollama) or any free option; no network calls that incur cost.
- **Acceptance:** Deterministic JSON, no prose; handles code‑switching reasonably.

### T5 — KB Retrieval + Decision
- Build a tiny embeddings index (DuckDB/SQLite) from `kb/entries/*.md` (`question_variants` field).
- Retrieve candidates with scores; require `τ ≥ 0.82` and `answer_present==true` for success.
- Use `decideReply()` to return either filled **template** or **fallback**. No promises.
- **Acceptance:** Unit tests cover hit/miss thresholds and multiple locales.

### T6 — Message Capture (Slot‑Filling) + Summary
- If fallback or non‑faq intents: capture {name, relation, reason, callback_window, channel}.
- Send a concise WhatsApp summary to owner (configurable).
- **Acceptance:** Structured JSON stored; WhatsApp summary received on a test number.

### T7 — Daily Cap + Allowlist
- Implement `rate_limits` table with per‑day counters (Asia/Kolkata reset 00:00).
- Allowlist specific numbers to bypass cap.
- **Acceptance:** Cap triggers on the 11th assistant call; allowlisted numbers bypass.

### T8 — Metrics, Logs, and Tests
- Log per‑turn latencies and decisions.
- Create policy tests to ensure templates never contain red‑flag phrases.
- **Acceptance:** Dashboard JSON endpoint `/admin/stats` returns metrics; policy tests green.

---

## 🧪 Definition of Done (DoD)

- Vertical slice working on a local dev number.
- Latency ≤ 1.5s per turn on local Wi‑Fi test.
- **Zero** promise violations across acceptance tests.
- KB retrieval gated by τ + `answer_present`.
- Overflow path proven (cap exceeded).

---

## 🧩 API Contracts (MVP)

- `POST /voice/inbound` → TwiML (XML).
- `POST /voice/assistant` → TwiML (XML).
- `WS /media/stream` → bi‑directional audio frames + ASR partials.
- `GET /admin/calls?from=&to=&intent=` → JSON list.
- `POST /admin/kb` → upsert KB entry (schema‑validated).

Use **Zod** for request validation.

---

## 🗃️ Minimum Tables (DDL sketch)

```sql
-- call_sessions
id uuid primary key default gen_random_uuid(),
started_at timestamptz not null default now(),
caller text, callee text, locale text,
engaged boolean default true, outcome text, duration_s int, recording_url text;

-- messages
id uuid primary key default gen_random_uuid(),
call_id uuid references call_sessions(id),
role text, text_content text, ts timestamptz default now(), meta jsonb;

-- rate_limits
id serial primary key,
day date not null, count int not null default 0, cap int not null default 10,
allowlist_flag boolean default false;

-- kb_entries (store MD file refs)
id text primary key, intent text, locales text[], answer_present boolean, last_updated timestamptz;

-- faq_hits
id serial primary key, call_id uuid, kb_id text, confidence numeric, success boolean;

-- consents
id serial primary key, call_id uuid, text text, ts timestamptz default now();
```

You may evolve fields, but keep names stable.

---

## 🧠 Prompts (copy‑paste)

**Classifier system prompt:**

```
You are a call understanding module. Output strict JSON only.
Languages: en-IN, hi-IN, mr-IN. Caller utterances may code-switch.
Extract:
- intent: one of ["faq","leave_message","request_handoff","small_talk"]
- topics: up to 3 key phrases
- entities: {person_name?, relation?, callback_window?, channel?("sms"|"whatsapp"), explicit_question?}
- urgency: "low"|"normal"|"high"
Do not produce natural language, recommendations, or promises.
```

**Fallback lines:**
- en: “I’ll let ImperialX know about it and get back to you.”
- hi: “मैं ImperialX को बता दूँगा/दूँगी और आपको जवाब दिलवाऊँगा/दिलवाऊँगी।”
- mr: “मी ImperialX ला कळवेन आणि परत संपर्क करेन.”

---

## 🚀 Local Dev Quickstart

```bash
# 1) Install deps
pnpm i || yarn || npm i

# 2) Copy env
cp .env.example .env

# 3) Run dev server
pnpm dev

# 4) Expose webhook for Twilio trial
ngrok http 3000

# 5) Point Twilio Voice webhook to: POST https://<ngrok>/voice/inbound
```

---

## ✅ Acceptance Tests (Must Pass)

- When caller presses `*`, the call reaches `/voice/assistant` and logs a `call_session`.
- With locale=hi-IN, KB hit → Hindi template reply (no promises).
- With τ=0.79 (forced), system uses fallback and enters capture mode.
- On the 11th assistant call of the day, overflow prompt is played.
- Policy test confirms no template contains a red‑flag phrase.

---

## 🔐 Privacy & Retention

- Transcripts 90 days; audio 30 days (configurable). Redact PII in logs where feasible.

---

## 📝 Notes for the Coding Agent

- Keep routes minimal; put logic in `src/lib/*`.
- The **final reply string must be provably from a template** (unit test it).
- If a template needs a missing placeholder, **downgrade to fallback**.
- Prefer free/localhost services; do not add paid SDKs without justification.
