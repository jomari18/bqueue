// The three queue lanes, in the order the TV and kiosk show them (spec 6).
export const LANES = ["PRIORITY", "DOCUMENTS", "GENERAL"] as const;
export type Lane = (typeof LANES)[number];

export const ROLES = ["KAPITAN", "STAFF", "RESIDENT"] as const;
export type Role = (typeof ROLES)[number];

export const REQUEST_STATUSES = ["SUBMITTED", "FOR_APPROVAL", "READY_FOR_PICKUP", "RELEASED", "REJECTED", "CANCELLED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_ACTIONS = ["cancel", "forward", "reject", "approve", "release", "revoke"] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

export const TICKET_STATUSES = ["WAITING", "CALLED", "SERVED", "MISSED", "CANCELLED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_SOURCES = ["PHONE", "KIOSK"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export const DOCUMENT_CODES = ["CLEARANCE", "RESIDENCY", "INDIGENCY", "BUSINESS", "BRGY_ID"] as const;
export type DocumentCode = (typeof DOCUMENT_CODES)[number];

export const SEXES = ["MALE", "FEMALE"] as const;
export type Sex = (typeof SEXES)[number];

export const CIVIL_STATUSES = ["SINGLE", "MARRIED", "WIDOWED", "SEPARATED"] as const;
export type CivilStatus = (typeof CIVIL_STATUSES)[number];
