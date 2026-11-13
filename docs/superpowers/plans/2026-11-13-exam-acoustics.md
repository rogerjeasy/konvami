# Optional exam acoustic assessment — spec §6.13 and §6.14

## Consent and API proposal

- Add `assessmentConsent: false` to voice call input, accepted only for exam calls when the
  acoustic provider and server PCM converter are available. Persist the choice with the voice
  session so worker retries cannot infer permission from current screen state.
- Add nullable `assessmentProvider` to the next-simulation response. Preparation shows an
  unchecked per-exam opt-in only when this capability is available.
- Add nullable `pronunciation` to the simulation result, separate from the existing four rubric
  criteria and pass calculation. It contains provider scores plus assessed/skipped turn counts;
  absent scores remain absent. No official exam/TDN pronunciation mark is invented.

## Recording lifecycle

Only an opted-in exam records learner PCM for assessment. Candidate/examiner clips remain
transient as today. After a completed call the background scorer owns cleanup; every scoring
outcome (ready, too short, failed, exception) releases all temporary clips in `finally`.
Failure to enqueue scoring releases clips immediately. Opt-out exams retain current cleanup.
No raw exam audio becomes a persistent library entry.

## Provider limits

Azure's short-audio REST assessment requires a reference and at most 30 seconds of 16 kHz mono
PCM WAV. Use the actual learner turn transcript as its reference and a server ffmpeg converter
behind the existing encoder interface. Do not divide text into invented timing spans. When a real word aligner is configured, longer answers are split at verified word boundaries
into bounded PCM slices, each with its matching reference. Unaligned long answers,
missing, failed and excess segments are explicitly skipped; bounded coverage is shown to the user.
A configured Azure key without a converter does not advertise exam assessment.

This first implementation samples at most six eligible audio segments to bound provider cost and
worker time. Unsupported prosody remains null. Existing lab assessment remains independent,
since its device decoder already supplies valid WAV.

## Build and verification

1. Test the acoustic orchestrator: only learner audio, owned key prefix, duration and call limits,
   weighted score aggregation, partial/unavailable coverage, provider failures.
2. Extend the ffmpeg adapter with a real PCM16/16k mono output and verify fixed arguments.
3. Integrate persisted consent and opt-in capture with the voice owner; test opt-out and cleanup
   on normal/too-short/failure paths before exposing the UI.
4. Serialize optional acoustic results, wire the prep switch/call input and render estimated
   acoustic scores with coverage separately from pass/fail.
5. Run targeted domain/API/persistence/mobile behavior, mypy/Ruff/ESLint/typecheck and visual
   checks. Root owns final staging/commits/push. No deployment or dependency install is required.

Official contract checked 2026-11-13:
https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short

## Implementation verification

- 110 scoped backend tests pass: acoustic conversion/segmentation/lifecycle, exam scoring,
  live voice and continuation regression, exam API and factory wiring.
- PostgreSQL and in-memory repository tests plus all migration tests pass, including consent
  and acoustic-result round trips. Temporary PostgreSQL requires the approved test escalation.
- 25 mobile exam and locale tests pass, including unchecked default, unavailable capability,
  explicit prep-to-call opt-in, direct-link opt-out and separate acoustic results.
- Backend mypy and scoped Ruff, mobile typecheck and scoped ESLint pass.
- Visual review remains with the shared browser-validation workstream. No Azure production
  request or native microphone hardware verification was run. Feature availability requires the
  existing Azure secret/region configuration and an executable ffmpeg deployment layer; word
  alignment is optional and needed for long answers. No dependencies or deployed resources added.
