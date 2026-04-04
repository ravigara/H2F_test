# Next Phases README

Date: 2026-04-04

This README describes the remaining work after the current backend milestone. It keeps the same phase order and intent as `nudiscribe_build_plan.txt`, while also calling out the frontend and product gaps that still remain around that plan.

## Current Starting Point

- backend implementation exists for the core build-plan flow through Phase 5
- Phase 6 has started with a working SQLite persistence foundation
- Phase 7 has not started
- frontend expectations from Phases 1, 2, and 5 are still open because this repository is backend-only

## Remaining Work In Build-Plan Order

### 1. Close The Earlier Build-Plan Gaps That Still Affect Product Completion

These items belong to the original plan even though the backend side is already present:

- build a thin frontend for text chat
- show transcripts for uploaded or streamed audio
- add browser microphone capture or upload UX
- add TTS playback controls in the client
- validate the backend from a real frontend session instead of only manual scripts

Recommended output for this stage:

- a minimal frontend that can send text and audio, display transcript and assistant text, and play synthesized audio

Definition of done:

- a user can complete one end-to-end flow in the browser for text, audio transcription, and TTS playback

### 2. Finish Phase 6 - Conversation Memory And Persistence

What is already done:

- SQLite-backed session persistence
- transcript persistence
- selected-language persistence
- latency and error persistence

What still needs to happen:

- add unit tests for `backend/app/memory.py`
- add API-level tests that confirm persistence on chat, audio, and TTS paths
- inspect whether the current schema is enough for future retrieval and reporting needs
- decide whether SQLite is local-only or whether PostgreSQL and SQLAlchemy should be added next
- add read/reporting endpoints only when a confirmed workflow needs them

Definition of done:

- persistence behavior is covered by automated tests
- storage choice is explicit
- the retrieval surface matches an actual product requirement, not a guessed one

### 3. Execute Phase 7 - Containerize And Deploy

Target scope from the build plan:

- Docker
- Compose or service topology
- deployment path

Recommended execution order:

1. add a backend Dockerfile
2. define the local multi-service topology for backend plus dependent runtimes
3. add Docker Compose for repeatable local startup
4. document env files, model mounts, and runtime prerequisites
5. wire smoke tests into CI or deployment verification

Definition of done:

- the backend can be started reproducibly without manual environment reconstruction
- deployment instructions are documented
- health checks and smoke tests are part of the startup path

## Work That Is Not In The Core Build Plan But Still Remains

These items are repeatedly called out by the existing repo docs and the hackathon problem framing:

- structured extraction
- editable review interface
- searchable dashboard and history views
- domain-specific workflow configuration
- authentication and access control
- observability and metrics
- compliance and operational hardening

These should be treated as post-foundation slices, not merged into the basic speech loop before the thin frontend and persistence hardening are complete.

## Suggested Next Execution Sequence

1. finish Phase 6 testing and storage decisions
2. build the thin frontend that closes the open gaps from Phases 1, 2, and 5
3. enable and validate real TTS assets for the languages that matter in this workspace
4. containerize the system and define the deployment path
5. add product-specific reporting, extraction, and review features one slice at a time

## Key Files To Touch Next

- `backend/app/memory.py`
- `backend/app/api.py`
- `backend/app/orchestrator.py`
- `backend/app/runtime_validation.py`
- `backend/app/product_smoke_test.py`
- future frontend files for chat, transcript display, audio capture, and TTS playback
- future deployment files such as `Dockerfile`, `docker-compose.yml`, and CI workflow definitions

## Immediate Recommended Next Step

If the goal is to stay closest to `nudiscribe_build_plan.txt`, the next concrete step is to finish Phase 6 with automated persistence tests and an explicit storage decision. If the goal is product completeness, the next highest-value step after that is a thin frontend that makes the existing backend visible end to end.
