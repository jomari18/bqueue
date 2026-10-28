-- CreateEnum
CREATE TYPE "Role" AS ENUM ('KAPITAN', 'STAFF', 'RESIDENT');

-- CreateEnum
CREATE TYPE "SecretKind" AS ENUM ('PASSWORD', 'PIN');

-- CreateEnum
CREATE TYPE "DocumentCode" AS ENUM ('CLEARANCE', 'RESIDENCY', 'INDIGENCY', 'BUSINESS', 'BRGY_ID');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'FOR_APPROVAL', 'READY_FOR_PICKUP', 'RELEASED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Lane" AS ENUM ('PRIORITY', 'DOCUMENTS', 'GENERAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('WAITING', 'CALLED', 'SERVED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('PHONE', 'KIOSK');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "CivilStatus" AS ENUM ('SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED');

-- CreateTable
CREATE TABLE "Barangay" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(4) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "queueVersion" BIGINT NOT NULL DEFAULT 0,
    "simulatorOn" BOOLEAN NOT NULL DEFAULT true,
    "lastHumanActionAt" TIMESTAMPTZ(3),
    "displayKeyHash" CHAR(64) NOT NULL,
    "kioskKeyHash" CHAR(64) NOT NULL,
    "joinCodeHash" CHAR(64),
    "joinCodeExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Barangay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barangayId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "username" VARCHAR(40) NOT NULL,
    "displayName" VARCHAR(60) NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretKind" "SecretKind" NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barangayId" UUID NOT NULL,
    "userId" UUID,
    "fullName" VARCHAR(80) NOT NULL,
    "birthDate" DATE NOT NULL,
    "sex" "Sex" NOT NULL,
    "civilStatus" "CivilStatus" NOT NULL,
    "purok" SMALLINT NOT NULL,
    "addressLine" VARCHAR(120) NOT NULL,
    "residentSince" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barangayId" UUID NOT NULL,
    "code" "DocumentCode" NOT NULL,
    "nameEn" VARCHAR(60) NOT NULL,
    "nameFil" VARCHAR(60) NOT NULL,
    "feeCentavos" INTEGER NOT NULL,
    "processingDays" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "needsBusinessName" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" UUID NOT NULL,
    "barangayId" UUID NOT NULL,
    "residentId" UUID NOT NULL,
    "documentTypeId" UUID NOT NULL,
    "purpose" VARCHAR(120) NOT NULL,
    "businessName" VARCHAR(80),
    "status" "RequestStatus" NOT NULL,
    "feeCentavos" INTEGER NOT NULL,
    "rejectReason" VARCHAR(200),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "orNumber" VARCHAR(16),
    "releasedById" UUID,
    "releasedAt" TIMESTAMPTZ(3),
    "verificationCode" CHAR(10),
    "validUntil" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestId" UUID NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus" NOT NULL,
    "actorId" UUID,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barangayId" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "lanes" "Lane"[],
    "staffId" UUID,
    "open" BOOLEAN NOT NULL DEFAULT false,
    "currentTicketId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicket" (
    "id" UUID NOT NULL,
    "barangayId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "lane" "Lane" NOT NULL,
    "number" INTEGER NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "source" "TicketSource" NOT NULL,
    "residentId" UUID,
    "requestId" UUID,
    "trackingTokenHash" CHAR(64),
    "queuedAt" TIMESTAMPTZ(3) NOT NULL,
    "calledAt" TIMESTAMPTZ(3),
    "servedAt" TIMESTAMPTZ(3),
    "counterId" UUID,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "rejoined" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueSequence" (
    "barangayId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "lane" "Lane" NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "QueueSequence_pkey" PRIMARY KEY ("barangayId","day","lane")
);

-- CreateTable
CREATE TABLE "DemoQuota" (
    "ipHash" CHAR(64) NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "DemoQuota_pkey" PRIMARY KEY ("ipHash","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barangay_code_key" ON "Barangay"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Barangay_displayKeyHash_key" ON "Barangay"("displayKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Barangay_kioskKeyHash_key" ON "Barangay"("kioskKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Barangay_joinCodeHash_key" ON "Barangay"("joinCodeHash");

-- CreateIndex
CREATE INDEX "Barangay_expiresAt_idx" ON "Barangay"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_barangayId_idx" ON "User"("barangayId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_userId_key" ON "Resident"("userId");

-- CreateIndex
CREATE INDEX "Resident_barangayId_idx" ON "Resident"("barangayId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_barangayId_code_key" ON "DocumentType"("barangayId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Request_verificationCode_key" ON "Request"("verificationCode");

-- CreateIndex
CREATE INDEX "Request_barangayId_status_createdAt_idx" ON "Request"("barangayId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_residentId_idx" ON "Request"("residentId");

-- CreateIndex
CREATE INDEX "Request_documentTypeId_idx" ON "Request"("documentTypeId");

-- CreateIndex
CREATE INDEX "Request_approvedById_idx" ON "Request"("approvedById");

-- CreateIndex
CREATE INDEX "Request_releasedById_idx" ON "Request"("releasedById");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_idx" ON "RequestEvent"("requestId");

-- CreateIndex
CREATE INDEX "RequestEvent_actorId_idx" ON "RequestEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_currentTicketId_key" ON "Counter"("currentTicketId");

-- CreateIndex
CREATE INDEX "Counter_barangayId_idx" ON "Counter"("barangayId");

-- CreateIndex
CREATE INDEX "Counter_staffId_idx" ON "Counter"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_trackingTokenHash_key" ON "QueueTicket"("trackingTokenHash");

-- CreateIndex
CREATE INDEX "QueueTicket_barangayId_day_status_lane_queuedAt_idx" ON "QueueTicket"("barangayId", "day", "status", "lane", "queuedAt");

-- CreateIndex
CREATE INDEX "QueueTicket_residentId_idx" ON "QueueTicket"("residentId");

-- CreateIndex
CREATE INDEX "QueueTicket_requestId_idx" ON "QueueTicket"("requestId");

-- CreateIndex
CREATE INDEX "QueueTicket_counterId_idx" ON "QueueTicket"("counterId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_barangayId_day_lane_number_key" ON "QueueTicket"("barangayId", "day", "lane", "number");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_barangayId_fkey" FOREIGN KEY ("barangayId") REFERENCES "Barangay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_barangayId_fkey" FOREIGN KEY ("barangayId") REFERENCES "Barangay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_barangayId_fkey" FOREIGN KEY ("barangayId") REFERENCES "Barangay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_barangayId_fkey" FOREIGN KEY ("barangayId") REFERENCES "Barangay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_barangayId_fkey" FOREIGN KEY ("barangayId") REFERENCES "Barangay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_currentTicketId_fkey" FOREIGN KEY ("currentTicketId") REFERENCES "QueueTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_barangayId_fkey" FOREIGN KEY ("barangayId") REFERENCES "Barangay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueSequence" ADD CONSTRAINT "QueueSequence_barangayId_fkey" FOREIGN KEY ("barangayId") REFERENCES "Barangay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants Prisma cannot express (spec 5), added by hand.
-- A counter has at most one CALLED ticket.
CREATE UNIQUE INDEX "QueueTicket_one_called_per_counter" ON "QueueTicket" ("counterId") WHERE status = 'CALLED';
-- A verification code exists exactly when the request is released.
ALTER TABLE "Request" ADD CONSTRAINT "Request_code_iff_released" CHECK ((status = 'RELEASED') = ("verificationCode" IS NOT NULL));
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_purok_range" CHECK (purok BETWEEN 1 AND 7);
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_call_count_range" CHECK ("callCount" BETWEEN 0 AND 3);
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_fee_not_negative" CHECK ("feeCentavos" >= 0);
ALTER TABLE "Request" ADD CONSTRAINT "Request_fee_not_negative" CHECK ("feeCentavos" >= 0);
