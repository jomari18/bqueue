// Shapes the API answers with. Times are ISO strings; money is integer centavos.
import type { DocumentCode, Lane, RequestStatus, Role, TicketSource, TicketStatus } from "./enums.js";
import type { Bilingual } from "./errors.js";

export type UserView = { id: string; role: Role; username: string; displayName: string };
export type BarangayView = { id: string; code: string; name: string; city: string; expiresAt: string; simulatorOn: boolean };
export type SessionResult = { accessToken: string; user: UserView; barangay: BarangayView };
export type MeView = { user: UserView; barangay: BarangayView; residentId: string | null; counterId: string | null };

export type DocumentTypeView = {
  id: string;
  code: DocumentCode;
  nameEn: string;
  nameFil: string;
  feeCentavos: number;
  processingDays: number;
  validityDays: number;
  needsBusinessName: boolean;
  active: boolean;
};

export type RequestEventView = {
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

export type RequestView = {
  id: string;
  status: RequestStatus;
  documentType: { code: DocumentCode; nameEn: string; nameFil: string };
  purpose: string;
  businessName: string | null;
  feeCentavos: number;
  rejectReason: string | null;
  orNumber: string | null;
  verificationCode: string | null;
  validUntil: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  resident: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
  events?: RequestEventView[];
};
export type RequestSummary = Omit<RequestView, "events">;

export type TicketView = {
  id: string;
  code: string;
  lane: Lane;
  number: number;
  status: TicketStatus;
  source: TicketSource;
  queuedAt: string;
  calledAt: string | null;
  counterName: string | null;
  callCount: number;
  rejoined: boolean;
  requestId: string | null;
  ahead: number;
  etaMinutes: number;
};

export type CounterView = {
  id: string;
  name: string;
  lanes: Lane[];
  open: boolean;
  sortOrder: number;
  staff: { id: string; displayName: string } | null;
  current: (TicketView & { request: RequestSummary | null }) | null;
};

export type QueueSnapshot = {
  version: number;
  day: string;
  barangay: { name: string; city: string };
  counters: {
    id: string;
    name: string;
    open: boolean;
    lanes: Lane[];
    currentCode: string | null;
    currentLane: Lane | null;
    callCount: number;
  }[];
  waiting: Record<Lane, number>;
  lastCalls: { code: string; lane: Lane; counterName: string; calledAt: string }[];
};

export type QueueCalledEvent = { version: number; code: string; lane: Lane; counterName: string; callCount: number };

export type TicketUpdate = {
  version: number;
  ticketId: string;
  code: string;
  lane: Lane;
  status: TicketStatus;
  ahead: number;
  etaMinutes: number;
  counterName: string | null;
  callCount: number;
  rejoined: boolean;
};

export type RequestUpdatedEvent = { requestId: string; status: RequestStatus; updatedAt: string };

export type DemoLogins = {
  kapitan: { username: string; password: string };
  staff: { username: string; pin: string };
  resident: { username: string; password: string };
};
export type DemoStartResult = SessionResult & {
  demoLogins: DemoLogins;
  displayLink: string;
  kioskLink: string;
  joinLink: string;
  joinExpiresAt: string;
  expiresAt: string;
};
export type JoinCodeResult = { joinLink: string; joinExpiresAt: string };
export type SocketTicketResult = { ticket: string; url: string; expiresIn: 60 };
export type TakeTicketResult = { ticket: TicketView; duplicate: boolean };
export type KioskTicketResult = { ticket: TicketView; trackingToken: string; duplicate: boolean };

export type VerifyResult = {
  status: "VALID" | "EXPIRED" | "REVOKED";
  documentName: Bilingual;
  fullName: string;
  issuedAt: string;
  validUntil: string;
  barangay: { name: string; city: string };
};

export type DocumentData = {
  request: RequestView;
  resident: {
    fullName: string;
    birthDate: string;
    sex: string;
    civilStatus: string;
    purok: number;
    addressLine: string;
    residentSince: number;
  };
  barangay: { name: string; city: string };
  kapitan: { displayName: string };
  approvedAt: string | null;
  releasedAt: string | null;
};

export type ReportSummary = {
  range: "today" | "7d" | "30d";
  from: string;
  to: string;
  requests: {
    byTypeStatus: { code: DocumentCode; status: RequestStatus; count: number }[];
    avgDaysToReady: number | null;
    released: number;
    feesCollectedCentavos: number;
  };
  queue: {
    lanes: {
      lane: Lane;
      tickets: number;
      avgWaitSeconds: number | null;
      avgServiceSeconds: number | null;
      noShowRate: number | null;
    }[];
    byHour: number[];
  };
};

export type StaffView = { id: string; username: string; displayName: string; active: boolean; counterName: string | null };
export type KeyRotationResult = { link: string };
