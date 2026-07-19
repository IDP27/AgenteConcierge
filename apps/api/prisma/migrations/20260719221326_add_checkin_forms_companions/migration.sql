-- CreateEnum
CREATE TYPE "CheckinFormStatus" AS ENUM ('in_progress', 'completed');

-- CreateTable
CREATE TABLE "companions" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" DATE,
    "document_type" TEXT,
    "document_number" TEXT,
    "is_child" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_forms" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "status" "CheckinFormStatus" NOT NULL DEFAULT 'in_progress',
    "data" JSONB NOT NULL DEFAULT '{}',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companions_reservation_id_idx" ON "companions"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_forms_reservation_id_key" ON "checkin_forms"("reservation_id");

-- CreateIndex
CREATE INDEX "checkin_forms_resort_id_status_idx" ON "checkin_forms"("resort_id", "status");

-- AddForeignKey
ALTER TABLE "companions" ADD CONSTRAINT "companions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_forms" ADD CONSTRAINT "checkin_forms_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
