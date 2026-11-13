# Practice call continuation — spec §6.4, §9.3, §10.2

The existing Realtime calls API creates a new WebRTC transport; the documented sideband
connection does not renegotiate a failed client peer. Retain the eight-second ICE grace.
After hard failure, resume a logical practice conversation using a linked transport, clearly
labelled as reconnecting from the saved conversation. Onboarding and exam calls keep their
existing behavior.

- Persist a root deadline, original reservation/configuration, sequential transport segments,
  bounded idempotent continuation attempts and authoritative completed-turn snapshots.
- Only the authenticated owner can continue/end. Recheck consent, account access and target
  language. Never accept client-supplied transcript/context. At most two continuations, no
  new time reservation, no replay of tool side effects.
- On handoff, hang up the former transport and wait for its worker snapshot. A provider create
  request runs once per attempt. Cache its answer for retry of the identical offer; an
  ambiguous create failure ends recovery rather than creating another paid call blindly.
- Keep segment audio under the original conversation. Aggregate turns, goals and usage once
  into that root. Only its final finish refunds unused connected time and starts the report.
  Unexpected closure has a bounded recovery grace; explicit end/natural goodbye finalize.
- Restore partner/plan, reached goals, captions, mute/PTT and the original UI timer. Show an
  honest reconnect status and keep End reachable. After bounded failure show the saved result.

Verification: repository memory/PostgreSQL contracts for ownership/concurrency/idempotency,
service tests for context/budget/finalization and failed providers, engine retry/cancellation
and mute tests, API contracts and full regressions. Root serializes focused commits.

Provider references checked 2026-11-13:
https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/create
https://developers.openai.com/api/docs/guides/voice-server-controls?api=realtime&voice-api=realtime
https://github.com/openai/openai-node/blob/main/src/resources/realtime/calls.ts
