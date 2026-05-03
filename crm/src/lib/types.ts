export type LeadStage =
  | "new"
  | "contacted"
  | "engaged"
  | "qualified"
  | "won"
  | "lost";

export const LEAD_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "won",
  "lost",
];

export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  phone: string;
  linkedin: string;
  tags: string;
  notes: string;
  timezone?: string;
  birthday?: string;
  dnc?: "yes" | "no" | "";
  archivedAt?: string;
  custom?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagDef {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  contactId: string;
  source: string;
  stage: LeadStage;
  score: number;
  scoreReason: string;
  value: number;
  owner: string;
  lastContactedAt: string;
  nextActionAt: string;
  nextAction: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  goal: string;
  audience: string;
  status: "draft" | "active" | "paused" | "completed";
  templateId: string;
  sentCount: number;
  repliedCount: number;
  createdAt: string;
}

export interface EmailRecord {
  id: string;
  contactId: string;
  campaignId: string;
  sequenceEnrollmentId: string;
  stepIndex: string;
  variant: string;
  subject: string;
  body: string;
  sentAt: string;
  status: "sent" | "failed" | "draft";
  aiGenerated: "yes" | "no";
  prompt: string;
  threadId: string;
  repliedAt: string;
}

export interface Task {
  id: string;
  contactId: string;
  title: string;
  dueAt: string;
  status: "open" | "done";
  owner: string;
  notes: string;
  createdAt: string;
  completedAt: string;
}

export interface Activity {
  id: string;
  contactId: string;
  type:
    | "email_sent"
    | "email_replied"
    | "stage_change"
    | "note"
    | "task_created"
    | "task_completed"
    | "sequence_enrolled"
    | "sequence_stopped"
    | "form_submission"
    | "score_updated";
  summary: string;
  meta: string;
  createdAt: string;
  actor: string;
}

export interface Sequence {
  id: string;
  name: string;
  goal: string;
  tone: string;
  status: "draft" | "active" | "paused";
  createdAt: string;
}

export type SequenceStepType = "email" | "linkedin" | "call" | "task";

export interface SequenceStep {
  id: string;
  sequenceId: string;
  stepIndex: string;
  delayDays: string;
  subjectHint: string;
  instructions: string;
  type: SequenceStepType;
  variantB: string;
  conditions: string;
  createdAt: string;
}

export interface Enrollment {
  id: string;
  sequenceId: string;
  contactId: string;
  status: "active" | "completed" | "stopped";
  currentStep: string;
  nextRunAt: string;
  lastRunAt: string;
  createdAt: string;
  stoppedReason: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  size: string;
  website: string;
  notes: string;
  parentId?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormDef {
  id: string;
  slug: string;
  name: string;
  fields: string;
  redirectUrl: string;
  tags: string;
  sequenceId: string;
  createdAt: string;
}

export interface SavedView {
  id: string;
  name: string;
  filter: string;
  createdAt: string;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: string;
  isDefault: "yes" | "no";
  createdAt: string;
}

export type DealStage =
  | "discovery"
  | "evaluation"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export const DEAL_STAGES: DealStage[] = [
  "discovery",
  "evaluation",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

export const DEAL_STAGE_DEFAULT_PROB: Record<DealStage, number> = {
  discovery: 0.1,
  evaluation: 0.25,
  proposal: 0.5,
  negotiation: 0.75,
  won: 1,
  lost: 0,
};

export type ContractStatus =
  | ""
  | "drafting"
  | "sent"
  | "viewed"
  | "signed"
  | "declined";

export interface Deal {
  id: string;
  name: string;
  pipelineId: string;
  stage: DealStage;
  probability: string; // 0..1 stored as string
  value: number;
  expectedCloseDate: string;
  owner: string;
  splits: string; // JSON: [{owner, pct}]
  contactIds: string; // CSV
  companyId: string;
  contractStatus: ContractStatus;
  lostReason: string;
  winReason: string;
  stageEnteredAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
}

export interface EmailEvent {
  id: string;
  emailId: string;
  type: "open" | "click";
  url: string;
  ip: string;
  userAgent: string;
  createdAt: string;
}

export interface ScheduledEmail {
  id: string;
  contactId: string;
  to: string;
  subject: string;
  body: string;
  scheduledFor: string;
  status: "scheduled" | "sent" | "cancelled";
  createdAt: string;
  sentAt: string;
}

export interface SuppressionEntry {
  id: string;
  email: string;
  reason: "bounce" | "unsubscribe" | "manual";
  source: string;
  createdAt: string;
}

export interface Snippet {
  id: string;
  trigger: string;
  name: string;
  body: string;
  createdAt: string;
}

export type AutomationTrigger =
  | "lead_stage_changed"
  | "form_submitted"
  | "score_threshold"
  | "deal_stage_changed"
  | "email_replied";

export interface Automation {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  condition: string;
  action: string;
  config: string;
  active: "yes" | "no";
  createdAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string;
  secret: string;
  active: "yes" | "no";
  createdAt: string;
}

export interface ApiToken {
  id: string;
  name: string;
  memberId: string;
  token: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface Meeting {
  id: string;
  slug: string;
  memberId: string;
  title: string;
  duration: string;
  availability: string;
  active: "yes" | "no";
  createdAt: string;
}

export type MemberRole = "admin" | "rep" | "viewer";

export interface Member {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
  signature: string;
  timezone: string;
  active: "yes" | "no";
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: "create" | "update" | "delete" | "system";
  entity: string;
  entityId: string;
  diff: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  aiPrompt: string;
  createdAt: string;
}

export interface WorkspaceConfig {
  spreadsheetId: string;
  driveFolderId: string;
  createdAt: string;
}

export interface ContactWithLead extends Contact {
  lead?: Lead;
}
