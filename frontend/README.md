# Frontend

React + TypeScript + Vite frontend for the existing FastAPI backend.

## What it covers

- `GET /api/health`
- `POST /api/chat`
- `POST /api/transcribe`
- `POST /api/tts`
- `GET /api/sessions`
- `DELETE /api/session/{session_id}`
- `WS /ws/{session_id}`
- `WS /ws/audio/{session_id}`
- `WS /ws/tts/{session_id}`

## Run

```bash
cd frontend
npm install
npm run dev
```

Default local UI:

```text
http://127.0.0.1:4173
```

Point the app at the backend, typically:

```text
http://127.0.0.1:8000
```

## Notes

- The live microphone path uses an `AudioWorklet` and streams raw PCM chunks to the backend.
- Structured review and dashboard details are client-side adapters until richer backend endpoints exist.
