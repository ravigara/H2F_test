import { PropsWithChildren } from "react";

interface StatusBadgeProps extends PropsWithChildren {
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}

export function StatusBadge({
  tone = "neutral",
  children,
}: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
