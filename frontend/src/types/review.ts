export interface StructuredReviewGenericFields {
  complaintQuery: string;
  backgroundHistory: string;
  observationsResponses: string;
  diagnosisClassificationStatus: string;
  actionPlanTreatmentPlan: string;
  verificationSurveyResponses: string;
}

export interface StructuredReviewHealthcareFields {
  symptoms: string;
  pastHistory: string;
  clinicalObservations: string;
  diagnosis: string;
  treatmentAdvice: string;
  immunizationData: string;
  pregnancyData: string;
  riskIndicators: string;
  injuryAndMobilityDetails: string;
  entFindings: string;
}

export interface StructuredReviewFinancialFields {
  identityVerification: string;
  accountLoanConfirmation: string;
  paymentStatus: string;
  payerIdentity: string;
  paymentDate: string;
  paymentMode: string;
  executiveInteractionDetails: string;
  reasonForPayment: string;
  amountPaid: string;
}

export interface StructuredReviewRecord {
  generic: StructuredReviewGenericFields;
  healthcare: StructuredReviewHealthcareFields;
  financial: StructuredReviewFinancialFields;
  generatedAt: string;
  adapter: string;
}
