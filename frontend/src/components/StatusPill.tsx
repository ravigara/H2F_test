type StatusTone = "neutral" | "ok" | "warn" | "error" | "active";

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
}

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return <span className={`status-pill status-pill-${tone}`}>{label}</span>;
}
