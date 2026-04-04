import { Domain } from "../types";
import { domainLabel } from "../lib/format";

interface OutboundWorkflowPlaceholderProps {
  domain: Domain;
}

export function OutboundWorkflowPlaceholder({
  domain,
}: OutboundWorkflowPlaceholderProps) {
  return (
    <section className="panel review-shell">
      <div className="panel__head">
        <div>
          <p className="eyebrow">Outbound Workflow Placeholder</p>
          <h2>Future-facing shell for scripted outbound voice operations.</h2>
        </div>
      </div>

      <div className="placeholder-grid">
        <article className="placeholder-card">
          <h3>Script library</h3>
          <p>
            Prepare domain-tuned outreach prompts for <strong>{domainLabel(domain)}</strong> without
            pretending telephony exists today.
          </p>
          <ul>
            <li>Greeting and consent script</li>
            <li>Identity or patient verification block</li>
            <li>Escalation handoff notes</li>
          </ul>
        </article>

        <article className="placeholder-card">
          <h3>Queue and campaign shell</h3>
          <p>
            Reserve UI space for future campaign queues, retry policies, and operator supervision.
          </p>
          <ul>
            <li>Target list import</li>
            <li>Call window configuration</li>
            <li>Outcome code review</li>
          </ul>
        </article>

        <article className="placeholder-card">
          <h3>Integration guardrail</h3>
          <p>
            No telephony, dialer, SIP, or provider integration is implemented here. This module is a
            clearly labeled UX placeholder only.
          </p>
        </article>
      </div>
    </section>
  );
}
