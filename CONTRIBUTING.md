# Contributing (for the Coding Agent)

- Keep business logic out of route handlers; use `src/lib/*`.
- Add unit tests for:
  - KB hit/miss thresholds
  - Template guardrails (no promises)
  - Daily cap logic (Asia/Kolkata reset)
- Use environment variables; do not commit secrets.