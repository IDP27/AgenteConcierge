-- CreateEnum
CREATE TYPE "RoomKeyStatus" AS ENUM ('active', 'revoked');

-- CreateTable
CREATE TABLE "room_keys" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "room_number" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "RoomKeyStatus" NOT NULL DEFAULT 'active',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "room_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_keys_reservation_id_status_idx" ON "room_keys"("reservation_id", "status");

-- AddForeignKey
ALTER TABLE "room_keys" ADD CONSTRAINT "room_keys_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
