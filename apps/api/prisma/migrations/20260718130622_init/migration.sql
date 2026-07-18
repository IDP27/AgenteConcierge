-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('confirmed', 'checked_in_digital', 'checked_in', 'checked_out', 'cancelled');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('web', 'whatsapp');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'needs_human', 'closed');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('guest', 'agent', 'human_agent', 'system');

-- CreateEnum
CREATE TYPE "ServiceOrderCategory" AS ENUM ('maintenance', 'housekeeping', 'noise', 'amenities', 'other');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('open', 'in_progress', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_approval', 'confirmed', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('success', 'error', 'blocked_by_guardrail');

-- CreateTable
CREATE TABLE "resorts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "consent_at" TIMESTAMP(3),
    "profile" JSONB NOT NULL DEFAULT '{}',
    "last_proactive_offer_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "room_number" TEXT,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'confirmed',
    "plan" TEXT NOT NULL,
    "magic_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'web',
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "category" "ServiceOrderCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'open',
    "sla_due_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "resort_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "tags" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "status" "AgentActionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guests_resort_id_idx" ON "guests"("resort_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_magic_token_key" ON "reservations"("magic_token");

-- CreateIndex
CREATE INDEX "reservations_resort_id_status_idx" ON "reservations"("resort_id", "status");

-- CreateIndex
CREATE INDEX "conversations_resort_id_status_idx" ON "conversations"("resort_id", "status");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "service_orders_resort_id_status_idx" ON "service_orders"("resort_id", "status");

-- CreateIndex
CREATE INDEX "orders_resort_id_status_idx" ON "orders"("resort_id", "status");

-- CreateIndex
CREATE INDEX "offers_resort_id_active_idx" ON "offers"("resort_id", "active");

-- CreateIndex
CREATE INDEX "agent_actions_conversation_id_created_at_idx" ON "agent_actions"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_resort_id_fkey" FOREIGN KEY ("resort_id") REFERENCES "resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_resort_id_fkey" FOREIGN KEY ("resort_id") REFERENCES "resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_resort_id_fkey" FOREIGN KEY ("resort_id") REFERENCES "resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_resort_id_fkey" FOREIGN KEY ("resort_id") REFERENCES "resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_resort_id_fkey" FOREIGN KEY ("resort_id") REFERENCES "resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_resort_id_fkey" FOREIGN KEY ("resort_id") REFERENCES "resorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
