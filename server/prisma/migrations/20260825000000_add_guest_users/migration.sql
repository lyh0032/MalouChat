-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('registered', 'guest');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "type" "UserType" NOT NULL DEFAULT 'registered',
ADD COLUMN "guestSecretHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_guestSecretHash_key" ON "User"("guestSecretHash");

-- Visitor display names are allocated atomically, so concurrent guest logins
-- cannot create the same Visitor_0001-style username.
CREATE SEQUENCE "VisitorUsernameSeq" START 1;
