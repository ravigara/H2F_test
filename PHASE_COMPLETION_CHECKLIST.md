# Phase Completion Checklist

Date: 2026-04-04

This checklist follows the phase order in `nudiscribe_build_plan.txt`.

Status basis for this pass:

- all root Markdown files were reviewed
- `nudiscribe_build_plan.txt` was used as the phase source of truth
- the current backend structure and key runtime files were spot-checked
- runtime-validation claims below are carried forward from `UBUNTU_HANDOFF_README.md`; they were not rerun in this pass

## Overall Build Status

- [x] Phase 1 backend text pipeline exists
- [x] Phase 2 backend speech transcription path exists
- [x] Phase 3 Indic ASR routing exists
- [x] Phase 4 code-mixed routing exists
- [x] Phase 5 backend TTS pipeline exists and is documented as Ubuntu-validated with a real speech provider
- [ ] Phase 6 is not fully complete; the SQLite persistence foundation is in place
- [ ] Phase 7 containerization and deployment are not started

Important scope notes:

- the build plan expects a frontend, but this repository is backend-only today
- frontend gaps still remain for the text UI, transcript display, and TTS playback portions of the earlier phases
- hackathon-facing features such as structured extraction, editable review, dashboards, and domain workflows are still future work

## Phase-By-Phase Checklist

### Phase 1 - Build The Core Text Pipeline First

Completed actions:

- [x] `POST /api/chat` exists
- [x] `ws://.../ws/{session_id}` exists
- [x] Ollama streaming integration exists
- [x] language-aware prompt building exists
- [x] session-aware text orchestration exists

Remaining actions:

- [ ] build the frontend text input UI expected by the plan
- [ ] build the frontend text response display expected by the plan
- [ ] validate the text path through a real frontend, not only backend/manual clients

### Phase 2 - Add Whisper For English Speech

Completed actions:

- [x] Whisper ASR adapter exists
- [x] uploaded-audio transcription endpoint exists
- [x] audio WebSocket endpoint exists
- [x] manual audio validation client exists

Remaining actions:

- [ ] build browser microphone capture or frontend upload flow
- [ ] add frontend transcript display
- [ ] harden live-audio protocol validation beyond manual client coverage

### Phase 3 - Add IndicConformer For Kannada And Hindi

Completed actions:

- [x] Indic ASR adapter exists
- [x] language/script heuristics exist
- [x] Kannada/Hindi routing exists
- [x] merged transcript cleanup and metadata generation exist

Remaining actions:

- [ ] evaluate transcription quality against real Kannada/Hindi and code-mixed samples
- [ ] improve routing confidence with measured examples instead of only heuristic confidence

### Phase 4 - Add Code-Mixed Routing

Completed actions:

- [x] audio is segmented before routing
- [x] dominant-language routing is applied per segment
- [x] segment outputs are merged into a final transcript
- [x] orchestration preserves language-mix metadata

Remaining actions:

- [ ] replace or augment energy-style segmentation with stronger VAD
- [ ] tune fallback rules for low-confidence mixed-language segments

### Phase 5 - Add TTS

Completed actions:

- [x] `POST /api/tts` exists
- [x] `ws://.../ws/tts/{session_id}` exists
- [x] AI4Bharat-first routing exists for Hindi/Kannada
- [x] Piper fallback exists
- [x] Coqui fallback exists
- [x] per-segment synthesis and merged WAV generation exist
- [x] merged WAV normalization exists
- [x] runtime validation and smoke-test tooling exist
- [x] Ubuntu validation is documented with a real speech provider

Remaining actions:

- [ ] configure AI4Bharat Hindi/Kannada assets in the active workspace if those languages need real-speech validation here
- [ ] build the frontend playback layer expected by the plan
- [ ] rerun full speech validation in this workspace when real provider assets are finalized

### Phase 6 - Add Conversation Memory And Persistence

Completed actions:

- [x] SQLite-backed session storage exists
- [x] message history persistence exists
- [x] transcript persistence exists
- [x] selected-language persistence exists
- [x] latency and error persistence exist
- [x] relative persistence paths resolve against the repository root

Remaining actions:

- [ ] add automated tests around `backend/app/memory.py`
- [ ] add API-level tests for persistence hooks in chat, audio, and TTS flows
- [ ] decide whether SQLite remains local-dev storage only
- [ ] add PostgreSQL and SQLAlchemy if full Phase 6 target scope is required
- [ ] expose retrieval or reporting endpoints only where product workflows need them

### Phase 7 - Containerize And Deploy

Completed actions:

- [ ] no containerization or deployment artifacts are present yet

Remaining actions:

- [ ] add backend Docker support
- [ ] define service topology for backend, Ollama, ASR, and TTS dependencies
- [ ] add Compose-based local deployment first
- [ ] add environment-profile guidance for local, staging, and production
- [ ] add CI or deployment smoke-test execution
- [ ] add observability, health probes, and operational runbooks

## Actions Already Performed Across The Repository

- [x] backend API surface now covers chat, transcription, TTS, session clearing, and session listing
- [x] config loading supports repo-root `.env` and `backend/.env`
- [x] runtime health reporting reflects available TTS providers
- [x] product smoke-test tooling exists for self-check and live backend validation
- [x] TTS routing prefers AI4Bharat and falls back through Piper, Coqui, and tone as needed
- [x] merged TTS audio is normalized before final WAV output
- [x] session history, transcripts, selected language, latency, and errors persist to SQLite
- [x] manual validation clients exist for text, audio, and TTS WebSocket paths

## Future Actions

- [ ] finish persistence tests before expanding the storage layer further
- [ ] build the thin frontend needed to close the open frontend gaps from Phases 1, 2, and 5
- [ ] decide whether this workspace should stay audio-only or be configured for real AI4Bharat assets
- [ ] add retrieval/reporting surfaces only after confirming the exact product workflows
- [ ] containerize the backend and supporting services
- [ ] add CI, observability, and deployment automation
- [ ] implement structured extraction, editable review, dashboards, and domain workflows after the core end-to-end loop is visible
