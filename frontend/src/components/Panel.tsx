import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, aside, className = "", children }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{title}</p>
          {subtitle ? <h2 className="panel-title">{subtitle}</h2> : null}
        </div>
        {aside ? <div className="panel-aside">{aside}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
