const state = {
  chatSocket: null,
  currentAssistantBubble: null,
  mediaRecorder: null,
  recordedChunks: [],
  activeExtraction: null,
  workflows: [],
};

const elements = {
  baseUrl: document.querySelector("#base-url"),
  sessionId: document.querySelector("#session-id"),
  statusBanner: document.querySelector("#status-banner"),
  chatLog: document.querySelector("#chat-log"),
  chatInput: document.querySelector("#chat-input"),
  transcriptOutput: document.querySelector("#transcript-output"),
  audioFile: document.querySelector("#audio-file"),
  recordAudio: document.querySelector("#record-audio"),
  ttsText: document.querySelector("#tts-text"),
  ttsLanguage: document.querySelector("#tts-language"),
  ttsPlayer: document.querySelector("#tts-player"),
  ttsMeta: document.querySelector("#tts-meta"),
  dashboardMetrics: document.querySelector("#dashboard-metrics"),
  sessionList: document.querySelector("#session-list"),
  sessionMessages: document.querySelector("#session-messages"),
  sessionTranscripts: document.querySelector("#session-transcripts"),
  sessionTelemetry: document.querySelector("#session-telemetry"),
  searchQuery: document.querySelector("#search-query"),
  searchResults: document.querySelector("#search-results"),
  workflowSelect: document.querySelector("#workflow-select"),
  extractionSource: document.querySelector("#extraction-source"),
  reviewStatus: document.querySelector("#review-status"),
  reviewNotes: document.querySelector("#review-notes"),
  reviewEditor: document.querySelector("#review-editor"),
  extractionList: document.querySelector("#extraction-list"),
};

function getBaseUrl() {
  return (elements.baseUrl.value || window.location.origin).replace(/\/$/, "");
}

function getSessionId() {
  const trimmed = elements.sessionId.value.trim();
  return trimmed || "demo-session";
}

function getWsUrl(path) {
  const base = getBaseUrl();
  if (base.startsWith("https://")) {
    return `wss://${base.slice("https://".length)}${path}`;
  }
  if (base.startsWith("http://")) {
    return `ws://${base.slice("http://".length)}${path}`;
  }
  return `${base}${path}`;
}

function setStatus(message) {
  elements.statusBanner.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function blobFromBase64(audioB64, mimeType = "audio/wav") {
  const binary = atob(audioB64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function appendChatBubble(role, text = "") {
  const bubble = document.createElement("article");
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = `<span class="bubble-role">${role}</span><div class="bubble-text"></div>`;
  bubble.querySelector(".bubble-text").textContent = text;
  elements.chatLog.appendChild(bubble);
  bubble.scrollIntoView({ block: "end", behavior: "smooth" });
  return bubble;
}

function renderList(target, items, formatter) {
  target.innerHTML = "";
  if (!items.length) {
    target.innerHTML = '<div class="list-item">No records.</div>';
    return;
  }
  for (const item of items) {
    const element = document.createElement("div");
    element.className = "list-item";
    element.innerHTML = formatter(item);
    target.appendChild(element);
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  return response.json();
}

function connectChatSocket() {
  const sessionId = getSessionId();
  if (state.chatSocket && state.chatSocket.readyState === WebSocket.OPEN) {
    setStatus(`Chat socket already connected for ${sessionId}.`);
    return;
  }

  const socket = new WebSocket(getWsUrl(`/ws/${encodeURIComponent(sessionId)}`));
  state.chatSocket = socket;
  setStatus(`Connecting chat socket for ${sessionId}...`);

  socket.addEventListener("open", () => {
    setStatus(`Chat socket connected for ${sessionId}.`);
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "delta") {
      if (!state.currentAssistantBubble) {
        state.currentAssistantBubble = appendChatBubble("assistant", "");
      }
      const textNode = state.currentAssistantBubble.querySelector(".bubble-text");
      textNode.textContent += payload.text || "";
    } else if (payload.type === "final") {
      setStatus(`Chat response complete. Language: ${payload.language || "auto"}.`);
      state.currentAssistantBubble = null;
      refreshDashboard();
      refreshExtractionList();
    } else if (payload.type === "error") {
      setStatus(`Chat error: ${payload.error}`);
      state.currentAssistantBubble = null;
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Chat socket closed.");
    state.chatSocket = null;
    state.currentAssistantBubble = null;
  });

  socket.addEventListener("error", () => {
    setStatus("Chat socket error.");
  });
}

function sendChatMessage() {
  const text = elements.chatInput.value.trim();
  if (!text) {
    setStatus("Enter text before sending chat.");
    return;
  }
  if (!state.chatSocket || state.chatSocket.readyState !== WebSocket.OPEN) {
    connectChatSocket();
    setTimeout(sendChatMessage, 250);
    return;
  }

  appendChatBubble("user", text);
  state.currentAssistantBubble = null;
  state.chatSocket.send(JSON.stringify({ type: "input", text }));
  elements.chatInput.value = "";
}

async function transcribeFile(file) {
  if (!file) {
    setStatus("Choose or record an audio file first.");
    return;
  }
  const formData = new FormData();
  formData.append("file", file, file.name || "audio.webm");
  setStatus(`Uploading ${file.name || "recording"} for transcription...`);
  const response = await fetch(`${getBaseUrl()}/api/transcribe`, { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = await response.json();
  elements.transcriptOutput.textContent = JSON.stringify(payload, null, 2);
  if (payload.text) {
    elements.ttsText.value = payload.text;
    elements.extractionSource.value = payload.text;
  }
  setStatus(`Transcription complete. Dominant language: ${payload.language || "auto"}.`);
}

async function toggleRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
    state.mediaRecorder.stop();
    elements.recordAudio.textContent = "Start Recording";
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.recordedChunks = [];
  const recorder = new MediaRecorder(stream);
  state.mediaRecorder = recorder;
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.recordedChunks.push(event.data);
    }
  };
  recorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(state.recordedChunks, { type: recorder.mimeType || "audio/webm" });
    const file = new File([blob], "recording.webm", { type: blob.type });
    try {
      await transcribeFile(file);
    } catch (error) {
      setStatus(`Recording upload failed: ${error.message}`);
    }
  };
  recorder.start();
  elements.recordAudio.textContent = "Stop Recording";
  setStatus("Recording audio...");
}

async function synthesizeTts() {
  const text = elements.ttsText.value.trim();
  if (!text) {
    setStatus("Enter text before running TTS.");
    return;
  }

  const payload = await apiFetch("/api/tts", {
    method: "POST",
    body: JSON.stringify({
      text,
      language: elements.ttsLanguage.value || null,
      languages: ["en", "hi", "kn"],
    }),
  });
  const blob = blobFromBase64(payload.audio_b64, payload.mime_type || "audio/wav");
  elements.ttsPlayer.src = URL.createObjectURL(blob);
  elements.ttsMeta.textContent = `Provider: ${payload.provider} | Language: ${payload.language} | Sample rate: ${payload.sample_rate}`;
  setStatus(`TTS synthesis complete with ${payload.provider}.`);
}

async function refreshDashboard() {
  const summary = await apiFetch("/api/dashboard/summary");
  const metrics = [
    ["Sessions", summary.session_count],
    ["Messages", summary.message_count],
    ["Transcripts", summary.transcript_count],
    ["Telemetry", summary.telemetry_count],
    ["Errors", summary.error_count],
    ["Extractions", summary.extraction_count],
  ];
  elements.dashboardMetrics.innerHTML = metrics
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  renderList(elements.sessionList, summary.recent_sessions || [], (session) => `
    <button class="button ghost session-button" data-session-id="${escapeHtml(session.session_id)}">Load ${escapeHtml(session.session_id)}</button>
    <div class="tag-row">
      ${(session.languages || []).map((language) => `<span class="tag">${escapeHtml(language)}</span>`).join("")}
    </div>
    <div>${session.message_count} messages, ${session.transcript_count} transcripts, ${session.telemetry_count} telemetry</div>
  `);

  elements.sessionList.querySelectorAll(".session-button").forEach((button) => {
    button.addEventListener("click", () => {
      elements.sessionId.value = button.dataset.sessionId || "";
      loadSession();
    });
  });
}

async function loadSession() {
  const sessionId = getSessionId();
  const [messages, transcripts, telemetry] = await Promise.all([
    apiFetch(`/api/session/${encodeURIComponent(sessionId)}/messages`),
    apiFetch(`/api/session/${encodeURIComponent(sessionId)}/transcripts`),
    apiFetch(`/api/session/${encodeURIComponent(sessionId)}/telemetry`),
  ]);

  renderList(elements.sessionMessages, messages, (message) => `
    <span class="item-label">${escapeHtml(message.role)}</span>
    <div>${escapeHtml(message.content)}</div>
  `);
  renderList(elements.sessionTranscripts, transcripts, (record) => `
    <span class="item-label">${escapeHtml(record.source)}</span>
    <div>${escapeHtml(record.text)}</div>
  `);
  renderList(elements.sessionTelemetry, telemetry, (record) => `
    <span class="item-label">${escapeHtml(record.kind)} / ${escapeHtml(record.name)}</span>
    <div>Status: ${escapeHtml(record.status || "n/a")}</div>
    <div>${escapeHtml(record.error_message || "")}</div>
  `);

  setStatus(`Loaded persisted records for ${sessionId}.`);
}

async function runSearch() {
  const query = elements.searchQuery.value.trim();
  if (!query) {
    setStatus("Enter a search query.");
    return;
  }
  const results = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
  renderList(elements.searchResults, results, (item) => `
    <span class="item-label">${escapeHtml(item.source_type)} / ${escapeHtml(item.subtype)}</span>
    <div>${escapeHtml(item.snippet)}</div>
    <div>${escapeHtml(item.session_id || "no-session")}</div>
  `);
  setStatus(`Found ${results.length} search results.`);
}

async function loadWorkflows() {
  state.workflows = await apiFetch("/api/workflows");
  elements.workflowSelect.innerHTML = state.workflows
    .map((workflow) => `<option value="${escapeHtml(workflow.name)}">${escapeHtml(workflow.display_name)}</option>`)
    .join("");
}

async function refreshExtractionList() {
  const records = await apiFetch(`/api/extractions?session_id=${encodeURIComponent(getSessionId())}`);
  renderList(elements.extractionList, records, (record) => `
    <button class="button ghost extraction-button" data-extraction-id="${record.id}">Open #${record.id}</button>
    <div>${escapeHtml(record.workflow_name)} | ${escapeHtml(record.status)}</div>
    <div>${escapeHtml((record.source_text || "").slice(0, 120))}</div>
  `);

  elements.extractionList.querySelectorAll(".extraction-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await apiFetch(`/api/extractions/${button.dataset.extractionId}`);
      renderExtractionEditor(record);
    });
  });
}

function renderExtractionEditor(record) {
  state.activeExtraction = record;
  elements.reviewStatus.value = record.status || "generated";
  elements.reviewNotes.value = record.notes || "";

  const payload = record.effective_data || record.generated_data || {};
  const fields = payload.fields || {};
  elements.reviewEditor.innerHTML = Object.entries(fields)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `
          <label class="review-field">
            <span>${escapeHtml(key)}</span>
            <textarea data-field-key="${escapeHtml(key)}" data-field-type="list" rows="4">${escapeHtml(value.join("\n"))}</textarea>
          </label>
        `;
      }
      return `
        <label class="review-field">
          <span>${escapeHtml(key)}</span>
          <textarea data-field-key="${escapeHtml(key)}" data-field-type="text" rows="3">${escapeHtml(value ?? "")}</textarea>
        </label>
      `;
    })
    .join("");

  if (!elements.reviewEditor.innerHTML) {
    elements.reviewEditor.innerHTML = '<div class="list-item">No extraction fields available.</div>';
  }

  setStatus(`Loaded extraction #${record.id} for review.`);
}

function collectReviewedData() {
  if (!state.activeExtraction) {
    throw new Error("Generate or open an extraction first.");
  }

  const base = structuredClone(state.activeExtraction.effective_data || state.activeExtraction.generated_data || {});
  const fields = {};
  elements.reviewEditor.querySelectorAll("[data-field-key]").forEach((input) => {
    const key = input.dataset.fieldKey;
    const type = input.dataset.fieldType;
    fields[key] = type === "list"
      ? input.value.split("\n").map((item) => item.trim()).filter(Boolean)
      : input.value.trim();
  });
  base.fields = fields;
  return base;
}

async function generateExtraction() {
  const payload = await apiFetch("/api/extractions/generate", {
    method: "POST",
    body: JSON.stringify({
      workflow_name: elements.workflowSelect.value || "general",
      session_id: getSessionId(),
      text: elements.extractionSource.value.trim(),
    }),
  });
  renderExtractionEditor(payload);
  await refreshExtractionList();
}

async function saveReview() {
  if (!state.activeExtraction) {
    setStatus("No extraction is open for review.");
    return;
  }
  const reviewedData = collectReviewedData();
  const payload = await apiFetch(`/api/extractions/${state.activeExtraction.id}`, {
    method: "PUT",
    body: JSON.stringify({
      reviewed_data: reviewedData,
      status: elements.reviewStatus.value,
      notes: elements.reviewNotes.value,
    }),
  });
  renderExtractionEditor(payload);
  await refreshExtractionList();
  setStatus(`Saved extraction review #${payload.id}.`);
}

function bootstrap() {
  elements.baseUrl.value = window.location.origin.includes("http") ? window.location.origin : "http://127.0.0.1:8000";
  elements.sessionId.value = `session-${Math.random().toString(36).slice(2, 8)}`;

  document.querySelector("#connect-chat").addEventListener("click", connectChatSocket);
  document.querySelector("#send-chat").addEventListener("click", sendChatMessage);
  document.querySelector("#clear-chat").addEventListener("click", () => { elements.chatLog.innerHTML = ""; });
  document.querySelector("#upload-audio").addEventListener("click", async () => {
    try {
      await transcribeFile(elements.audioFile.files[0]);
    } catch (error) {
      setStatus(`Upload failed: ${error.message}`);
    }
  });
  elements.recordAudio.addEventListener("click", async () => {
    try {
      await toggleRecording();
    } catch (error) {
      setStatus(`Recording failed: ${error.message}`);
    }
  });
  document.querySelector("#synthesize-tts").addEventListener("click", async () => {
    try {
      await synthesizeTts();
    } catch (error) {
      setStatus(`TTS failed: ${error.message}`);
    }
  });
  document.querySelector("#refresh-dashboard").addEventListener("click", () => refreshDashboard().catch((error) => setStatus(error.message)));
  document.querySelector("#load-session").addEventListener("click", () => loadSession().catch((error) => setStatus(error.message)));
  document.querySelector("#run-search").addEventListener("click", () => runSearch().catch((error) => setStatus(error.message)));
  document.querySelector("#generate-extraction").addEventListener("click", () => generateExtraction().catch((error) => setStatus(error.message)));
  document.querySelector("#save-review").addEventListener("click", () => saveReview().catch((error) => setStatus(error.message)));

  Promise.all([loadWorkflows(), refreshDashboard(), refreshExtractionList()])
    .then(() => setStatus("Frontend ready."))
    .catch((error) => setStatus(`Initial load failed: ${error.message}`));
}

bootstrap();
