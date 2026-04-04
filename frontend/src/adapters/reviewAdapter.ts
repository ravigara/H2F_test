import type { TranscriptSegment } from "../types/api";
import type { DomainMode } from "../types/domain";
import type { StructuredReviewRecord } from "../types/review";

export interface ReviewAdapterInput {
  domain: DomainMode;
  transcriptText: string;
  assistantText: string;
  transcriptSegments: TranscriptSegment[];
  languages: string[];
  isCodeMixed: boolean;
}

export interface StructuredReviewAdapter {
  readonly name: string;
  extract(input: ReviewAdapterInput): StructuredReviewRecord;
}

function splitIntoSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function selectSentences(sentences: string[], keywords: string[], fallbackIndex = 0): string {
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const matches = sentences.filter((sentence) =>
    loweredKeywords.some((keyword) => sentence.toLowerCase().includes(keyword)),
  );

  if (matches.length > 0) {
    return matches.join("\n");
  }

  return sentences[fallbackIndex] ?? "";
}

function summarizeSegments(segments: TranscriptSegment[]): string {
  return segments
    .slice(0, 6)
    .map((segment) => {
      const timing =
        typeof segment.start_ms === "number" || typeof segment.end_ms === "number"
          ? ` [${segment.start_ms ?? "?"}-${segment.end_ms ?? "?"}]`
          : "";
      return `${segment.text}${timing}`;
    })
    .join("\n");
}

export class MockStructuredReviewAdapter implements StructuredReviewAdapter {
  readonly name = "client-mock-v1";

  extract(input: ReviewAdapterInput): StructuredReviewRecord {
    const transcriptSentences = splitIntoSentences(input.transcriptText);
    const assistantSentences = splitIntoSentences(input.assistantText);
    const mergedSentences = [...transcriptSentences, ...assistantSentences];
    const segmentSummary = summarizeSegments(input.transcriptSegments);

    return {
      generic: {
        complaintQuery: selectSentences(transcriptSentences, ["pain", "issue", "query", "problem", "loan", "payment"]),
        backgroundHistory: selectSentences(
          mergedSentences,
          ["history", "previous", "before", "earlier", "background"],
          1,
        ),
        observationsResponses: segmentSummary || selectSentences(assistantSentences, ["observed", "reported", "response"], 0),
        diagnosisClassificationStatus: selectSentences(
          assistantSentences,
          ["diagnosis", "classification", "status", "assessment", "eligible"],
          0,
        ),
        actionPlanTreatmentPlan: selectSentences(
          assistantSentences,
          ["plan", "advice", "next", "follow", "treatment", "payment"],
          1,
        ),
        verificationSurveyResponses: [
          input.languages.length > 0 ? `Languages: ${input.languages.join(", ")}` : "",
          input.isCodeMixed ? "Conversation appears code-mixed." : "",
          selectSentences(mergedSentences, ["confirm", "verify", "yes", "no"], 0),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      healthcare: {
        symptoms: selectSentences(transcriptSentences, ["pain", "fever", "cough", "symptom", "swelling", "dizzy"]),
        pastHistory: selectSentences(mergedSentences, ["past", "history", "diabetes", "bp", "surgery"], 1),
        clinicalObservations: selectSentences(assistantSentences, ["observe", "vitals", "clinical", "assessment"], 0),
        diagnosis: selectSentences(assistantSentences, ["diagnosis", "likely", "impression"], 0),
        treatmentAdvice: selectSentences(assistantSentences, ["tablet", "rest", "hydrate", "treatment", "advice"], 1),
        immunizationData: selectSentences(mergedSentences, ["vaccine", "immunization", "dose"], 2),
        pregnancyData: selectSentences(mergedSentences, ["pregnant", "pregnancy", "trimester"], 2),
        riskIndicators: selectSentences(mergedSentences, ["risk", "allergy", "bleeding", "emergency"], 2),
        injuryAndMobilityDetails: selectSentences(mergedSentences, ["injury", "fall", "mobility", "walking"], 2),
        entFindings: selectSentences(mergedSentences, ["ear", "nose", "throat", "ent"], 2),
      },
      financial: {
        identityVerification: selectSentences(mergedSentences, ["name", "identity", "verified", "otp", "confirm"], 0),
        accountLoanConfirmation: selectSentences(mergedSentences, ["account", "loan", "emi", "policy"], 1),
        paymentStatus: selectSentences(mergedSentences, ["paid", "pending", "due", "payment status"], 1),
        payerIdentity: selectSentences(mergedSentences, ["paid by", "payer", "self", "family"], 2),
        paymentDate: selectSentences(mergedSentences, ["today", "yesterday", "date", "march", "april"], 2),
        paymentMode: selectSentences(mergedSentences, ["upi", "cash", "bank", "card", "payment mode"], 2),
        executiveInteractionDetails: selectSentences(assistantSentences, ["executive", "agent", "called", "interaction"], 2),
        reasonForPayment: selectSentences(mergedSentences, ["reason", "settlement", "emi", "premium"], 2),
        amountPaid: selectSentences(mergedSentences, ["rs", "rupees", "amount", "paid"], 2),
      },
      generatedAt: new Date().toISOString(),
      adapter: this.name,
    };
  }
}
