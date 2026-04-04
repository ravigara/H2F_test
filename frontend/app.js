const DEFAULT_API_BASE = "http://127.0.0.1:8000";

const state = {
  apiBase: localStorage.getItem("nudiscribe.apiBase") || DEFAULT_API_BASE,
  sessionId: localStorage.getItem("nudiscribe.sessionId") || createSessionId(),
  socket: null,
  pendingAssistantMessage: null,
  lastAssistantText: "",
  lastTranscript: "",
};

const els = {
  apiBase: document.getElementById("apiBase"),
  sessionId: document.getElementById("sessionId"),
  healthBtn: document.getElementById("healthBtn"),
  randomSessionBtn: document.getElementById("randomSessionBtn"),
  healthStatus: document.getElementById("healthStatus"),
  modelStatus: document.getElementById("modelStatus"),
  sessionCount: document.getElementById("sessionCount"),
  uptime: document.getElementById("uptime"),
  chatLog: document.getElementById("chatLog"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  socketState: document.getElementById("socketState"),
  sendBtn: document.getElementById("sendBtn"),
  reconnectBtn: document.getElementById("reconnectBtn"),
  audioFile: document.getElementById("audioFile"),
  transcribeBtn: document.getElementById("transcribeBtn"),
  transcriptBox: document.getElementById("transcriptBox"),
  sendTranscriptBtn: document.getElementById("sendTranscriptBtn"),
  clearSessionBtn: document.getElementById("clearSessionBtn"),
  clearChatBtn: document.getElementById("clearChatBtn"),
  loadSessionsBtn: document.getElementById("loadSessionsBtn"),
  sessionList: document.getElementById("sessionList"),
  speakBtn: document.getElementById("speakBtn"),
  messageTemplate: document.getElementById("messageTemplate"),
};

initialize();

function initialize() {
  els.apiBase.value = state.apiBase;
  els.sessionId.value = state.sessionId;
  bindEvents();
  renderSystemMessage("Client ready. Check backend health, then start chatting.");
  checkHealth();
  connectSocket();
}

function bindEvents() {
  els.apiBase.addEventListener("change", () => {
    state.apiBase = normalizeApiBase(els.apiBase.value);
    els.apiBase.value = state.apiBase;
    localStorage.setItem("nudiscribe.apiBase", state.apiBase);
    connectSocket();
    checkHealth();
  });

  els.sessionId.addEventListener("change", () => {
    state.sessionId = sanitizeSessionId(els.sessionId.value);
    els.sessionId.value = state.sessionId;
    localStorage.setItem("nudiscribe.sessionId", state.sessionId);
    connectSocket();
  });

  els.healthBtn.addEventListener("click", checkHealth);
  els.randomSessionBtn.addEventListener("click", () => {
    state.sessionId = createSessionId();
    els.sessionId.value = state.sessionId;
    localStorage.setItem("nudiscribe.sessionId", state.sessionId);
    connectSocket();
  });

  els.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = els.messageInput.value.trim();
    if (!text) {
      return;
    }

    ensureSocket();
    if (!isSocketOpen()) {
      renderSystemMessage("Socket is not connected. Retrying now.");
      connectSocket();
      return;
    }

    renderMessage("user", text, "typed input");
    els.messageInput.value = "";
    startAssistantStream();
    state.socket.send(JSON.stringify({ type: "input", text }));
  });

  els.reconnectBtn.addEventListener("click", connectSocket);
  els.transcribeBtn.addEventListener("click", transcribeAudio);
  els.sendTranscriptBtn.addEventListener("click", () => {
    if (!state.lastTranscript) {
      return;
    }
    els.messageInput.value = state.lastTranscript;
    els.messageInput.focus();
  });
  els.clearSessionBtn.addEventListener("click", clearBackendSession);
  els.clearChatBtn.addEventListener("click", clearLocalChat);
  els.loadSessionsBtn.addEventListener("click", loadSessions);
  els.speakBtn.addEventListener("click", speakLastReply);
}

function normalizeApiBase(value) {
  const next = (value || "").trim().replace(/\/+$/, "");
  return next || DEFAULT_API_BASE;
}

function sanitizeSessionId(value) {
  return (value || "").trim() || createSessionId();
}

function createSessionId() {
  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

function wsUrl() {
  const url = new URL(state.apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/ws/${encodeURIComponent(state.sessionId)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function ensureSocket() {
  if (!state.socket || state.socket.readyState === WebSocket.CLOSED) {
    connectSocket();
  }
}

function isSocketOpen() {
  return state.socket && state.socket.readyState === WebSocket.OPEN;
}

function connectSocket() {
  if (state.socket && state.socket.readyState <= WebSocket.OPEN) {
    state.socket.close();
  }

  updateSocketState("Connecting...");

  try {
    state.socket = new WebSocket(wsUrl());
  } catch (error) {
    updateSocketState("Connection failed.");
    renderSystemMessage(`Socket error: ${error.message}`);
    return;
  }

  state.socket.addEventListener("open", () => {
    updateSocketState(`Connected to ${state.sessionId}`);
    renderSystemMessage(`Socket connected for ${state.sessionId}.`);
  });

  state.socket.addEventListener("close", () => {
    updateSocketState("Disconnected.");
  });

  state.socket.addEventListener("error", () => {
    updateSocketState("Socket error.");
  });

  state.socket.addEventListener("message", (event) => {
    handleSocketEvent(event.data);
  });
}

function handleSocketEvent(raw) {
  let payload;

  try {
    payload = JSON.parse(raw);
  } catch (error) {
    renderSystemMessage(`Invalid socket payload: ${raw}`);
    return;
  }

  if (payload.type === "language_info") {
    renderSystemMessage(
      `Detected languages: ${(payload.languages || []).join(", ") || "unknown"} | dominant: ${payload.dominant_language || "-"} | code-mixed: ${payload.is_code_mixed ? "yes" : "no"}`
    );
    return;
  }

  if (payload.type === "transcription") {
    state.lastTranscript = payload.text || "";
    els.transcriptBox.textContent = state.lastTranscript || "No transcript returned.";
    els.sendTranscriptBtn.disabled = !state.lastTranscript;
    renderSystemMessage(`Audio transcription received for ${state.sessionId}.`);
    return;
  }

  if (payload.type === "delta") {
    appendAssistantDelta(payload.text || "");
    return;
  }

  if (payload.type === "final") {
    finalizeAssistantMessage(payload);
    return;
  }

  if (payload.type === "error") {
    finalizeAssistantMessage();
    renderSystemMessage(`Backend error: ${payload.error || "Unknown error"}`);
  }
}

function startAssistantStream() {
  state.pendingAssistantMessage = renderMessage("assistant", "", "streaming");
}

function appendAssistantDelta(chunk) {
  if (!state.pendingAssistantMessage) {
    startAssistantStream();
  }

  const body = state.pendingAssistantMessage.querySelector(".message-body");
  body.textContent += chunk;
  scrollChatToBottom();
}

function finalizeAssistantMessage(payload = null) {
  const node = state.pendingAssistantMessage;
  if (!node) {
    return;
  }

  const meta = node.querySelector(".meta");
  if (payload) {
    const languages = (payload.languages || []).join(", ") || payload.language || "unknown";
    const mixed = payload.is_code_mixed ? "code-mixed" : "single-language";
    meta.textContent = `${languages} | ${mixed}`;
  } else {
    meta.textContent = "stream ended";
  }

  state.lastAssistantText = node.querySelector(".message-body").textContent.trim();
  els.speakBtn.disabled = !state.lastAssistantText;
  state.pendingAssistantMessage = null;
}

async function checkHealth() {
  try {
    const response = await fetch(`${state.apiBase}/api/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    els.healthStatus.textContent = data.status || "unknown";
    els.modelStatus.textContent = data.model || "-";
    els.sessionCount.textContent = `${data.sessions_active ?? "-"}`;
    els.uptime.textContent = `${Math.round(data.uptime_seconds || 0)}s`;
  } catch (error) {
    els.healthStatus.textContent = "offline";
    els.modelStatus.textContent = "-";
    els.sessionCount.textContent = "-";
    els.uptime.textContent = "-";
    renderSystemMessage(`Health check failed: ${error.message}`);
  }
}

async function transcribeAudio() {
  const file = els.audioFile.files[0];
  if (!file) {
    renderSystemMessage("Choose an audio file before transcribing.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  els.transcribeBtn.disabled = true;
  els.transcriptBox.textContent = "Transcribing audio...";

  try {
    const response = await fetch(`${state.apiBase}/api/transcribe`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    state.lastTranscript = data.text || "";
    els.transcriptBox.textContent = [
      state.lastTranscript || "No transcript returned.",
      "",
      `language: ${data.language || "-"}`,
      `languages: ${(data.languages || []).join(", ") || "-"}`,
      `code mixed: ${data.is_code_mixed ? "yes" : "no"}`,
    ].join("\n");
    els.sendTranscriptBtn.disabled = !state.lastTranscript;
  } catch (error) {
    els.transcriptBox.textContent = `Transcription failed.\n${error.message}`;
    renderSystemMessage(`Transcription failed: ${error.message}`);
  } finally {
    els.transcribeBtn.disabled = false;
  }
}

async function clearBackendSession() {
  try {
    const response = await fetch(`${state.apiBase}/api/session/${encodeURIComponent(state.sessionId)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    renderSystemMessage(`Backend session cleared: ${data.session_id}`);
  } catch (error) {
    renderSystemMessage(`Failed to clear session: ${error.message}`);
  }
}

function clearLocalChat() {
  els.chatLog.innerHTML = "";
  state.pendingAssistantMessage = null;
  state.lastAssistantText = "";
  els.speakBtn.disabled = true;
  renderSystemMessage("Local chat cleared.");
}

async function loadSessions() {
  try {
    const response = await fetch(`${state.apiBase}/api/sessions`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const sessions = data.sessions || [];
    els.sessionList.textContent = sessions.length
      ? sessions.map((item) => `${item}${item === state.sessionId ? "  <- current" : ""}`).join("\n")
      : "No active sessions.";
  } catch (error) {
    els.sessionList.textContent = `Failed to load sessions.\n${error.message}`;
  }
}

async function speakLastReply() {
  if (!state.lastAssistantText) {
    return;
  }

  els.speakBtn.disabled = true;

  try {
    const response = await fetch(`${state.apiBase}/api/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: state.lastAssistantText,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const audio = new Audio(`data:${data.mime_type};base64,${data.audio_b64}`);
    await audio.play();
    renderSystemMessage(`Playing TTS via ${data.provider} (${data.language}).`);
  } catch (error) {
    renderSystemMessage(`TTS failed: ${error.message}`);
  } finally {
    els.speakBtn.disabled = false;
  }
}

function renderMessage(role, text, metaText) {
  const fragment = els.messageTemplate.content.cloneNode(true);
  const node = fragment.querySelector(".message");
  node.classList.add(role);
  node.querySelector(".role").textContent = role;
  node.querySelector(".meta").textContent = metaText || "";
  node.querySelector(".message-body").textContent = text;
  els.chatLog.appendChild(node);
  scrollChatToBottom();
  return node;
}

function renderSystemMessage(text) {
  renderMessage("system", text, new Date().toLocaleTimeString());
}

function updateSocketState(text) {
  els.socketState.textContent = text;
}

function scrollChatToBottom() {
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}
