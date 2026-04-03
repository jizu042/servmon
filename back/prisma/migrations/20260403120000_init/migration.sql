-- CreateEnum
CREATE TYPE "CheckSource" AS ENUM ('poll');

-- CreateTable
CREATE TABLE "CheckRecord" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "online" BOOLEAN NOT NULL,
    "playersOnline" INTEGER,
    "playersMax" INTEGER,
    "pingMs" INTEGER,
    "source" "CheckSource" NOT NULL DEFAULT 'poll',

    CONSTRAINT "CheckRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" VARCHAR(32) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckRecord_createdAt_idx" ON "CheckRecord"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt" ASC);
