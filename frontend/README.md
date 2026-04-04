# Frontend

This is a standalone frontend for the existing FastAPI backend in `backend/`.

## What it does

- connects to `ws://.../ws/{session_id}` for streaming chat
- calls `GET /api/health`
- calls `POST /api/transcribe`
- calls `POST /api/tts`
- calls `GET /api/sessions`
- calls `DELETE /api/session/{session_id}`

## Run it

Because the backend was left untouched, serve this folder separately.

Example:

```bash
cd frontend
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

Set the backend URL in the UI to your FastAPI server, typically:

```text
http://127.0.0.1:8000
```
