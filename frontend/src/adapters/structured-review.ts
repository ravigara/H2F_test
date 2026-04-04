import {
  ChatMessage,
  Domain,
  StructuredReviewDraft,
  TranscriptState,
} from "../types";
import { truncateText } from "../lib/format";

const GENERIC_FIELDS = [
  "complaint/query",
  "background history",
  "observations/responses",
  "diagnosis/classification/status",
  "action plan/treatment plan",
  "verification/survey responses",
] as const;

const HEALTHCARE_FIELDS = [
  "symptoms",
  "past history",
  "clinical observations",
  "diagnosis",
  "treatment advice",
  "immunization data",
  "pregnancy data",
  "risk indicators",
  "injury and mobility details",
  "ENT findings",
] as const;

const FINANCIAL_FIELDS = [
  "identity verification",
  "account/loan confirmation",
  "payment status",
  "payer identity",
  "payment date",
  "payment mode",
  "executive interaction details",
  "reason for payment",
  "amount paid",
] as const;

const FIELD_KEYWORDS: Record<string, string[]> = {
  "complaint/query": ["pain", "issue", "problem", "question", "query", "need", "help"],
  "background history": ["history", "before", "previous", "past", "since", "duration"],
  "observations/responses": ["observed", "response", "said", "reports", "noted"],
  "diagnosis/classification/status": ["diagnosis", "status", "classified", "assessment"],
  "action plan/treatment plan": ["plan", "advice", "take", "follow", "next", "treatment"],
  "verification/survey responses": ["verified", "yes", "no", "survey", "confirmed"],
  symptoms: ["fever", "cough", "pain", "bleeding", "swelling", "vomit", "symptom"],
  "past history": ["history", "previous", "chronic", "earlier", "past"],
  "clinical observations": ["bp", "pulse", "temperature", "observed", "exam"],
  diagnosis: ["diagnosis", "likely", "suggests", "assessment"],
  "treatment advice": ["tablet", "medicine", "rest", "hydrate", "advice", "prescribed"],
  "immunization data": ["vaccine", "immunization", "dose", "booster"],
  "pregnancy data": ["pregnancy", "trimester", "antenatal", "delivery"],
  "risk indicators": ["risk", "danger", "warning", "red flag", "critical"],
  "injury and mobility details": ["injury", "fall", "walk", "mobility", "fracture"],
  "ENT findings": ["ear", "nose", "throat", "hearing", "sinus"],
  "identity verification": ["verified", "kyc", "aadhaar", "identity", "confirm"],
  "account/loan confirmation": ["account", "loan", "card", "policy", "customer id"],
  "payment status": ["paid", "pending", "due", "settled", "overdue"],
  "payer identity": ["payer", "self", "spouse", "family", "customer"],
  "payment date": ["date", "today", "yesterday", "month", "april", "march"],
  "payment mode": ["upi", "cash", "card", "transfer", "neft", "mode"],
  "executive interaction details": ["executive", "agent", "called", "visited", "spoke"],
  "reason for payment": ["reason", "emi", "premium", "bill", "subscription"],
  "amount paid": ["rupees", "amount", "paid", "rs", "inr"],
};

function splitSentences(value: string) {
  return value
    .split(/(?<=[.!?।])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function pickFieldValue(sentences: string[], fieldName: string, fallback: string) {
  const keywords = FIELD_KEYWORDS[fieldName] || [];
  const match = sentences.find((sentence) =>
    keywords.some((keyword) => sentence.toLowerCase().includes(keyword)),
  );

  return match || fallback;
}

export function buildStructuredReviewDraft(
  domain: Domain,
  transcript: TranscriptState | null,
  messages: ChatMessage[],
): StructuredReviewDraft {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const transcriptText = transcript?.text || lastUserMessage?.text || "";
  const assistantText = lastAssistantMessage?.text || "";
  const combinedText = [transcriptText, assistantText].filter(Boolean).join(". ");
  const sentences = splitSentences(combinedText);

  const generic: Record<string, string> = {};
  const genericFallback = transcriptText || "Awaiting a richer transcript from the live conversation.";

  for (const field of GENERIC_FIELDS) {
    generic[field] = pickFieldValue(sentences, field, genericFallback);
  }

  const domainFields = domain === "healthcare" ? HEALTHCARE_FIELDS : FINANCIAL_FIELDS;
  const domainSpecific: Record<string, string> = {};

  for (const field of domainFields) {
    domainSpecific[field] = pickFieldValue(
      sentences,
      field,
      assistantText || transcriptText || "No domain-specific detail has been captured yet.",
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    note:
      "Client-side draft only. This panel is ready for a future structured-extraction backend, but it currently uses local heuristics.",
    generic,
    domainSpecific,
    sourceSummary: [
      transcript
        ? `Transcript source: ${transcript.source} | ${truncateText(transcript.text, 100)}`
        : "Transcript source: none yet.",
      lastAssistantMessage
        ? `Assistant response: ${truncateText(lastAssistantMessage.text, 100)}`
        : "Assistant response: none yet.",
      `Draft generated from ${messages.length} local message(s).`,
    ],
  };
}

export const REVIEW_FIELD_GROUPS = {
  generic: GENERIC_FIELDS,
  healthcare: HEALTHCARE_FIELDS,
  financial: FINANCIAL_FIELDS,
};
