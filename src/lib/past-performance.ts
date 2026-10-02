// Roles a company can claim on a past performance record
// (company_past_performance.role check constraint).
export type PastPerformanceRole = "prime" | "subcontractor" | "general_contractor";

export const PAST_PERFORMANCE_ROLE_LABELS: Record<PastPerformanceRole, string> = {
  prime: "Prime",
  subcontractor: "Subcontractor",
  general_contractor: "General Contractor",
};
