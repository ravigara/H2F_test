export function createSessionId() {
  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMessageId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
