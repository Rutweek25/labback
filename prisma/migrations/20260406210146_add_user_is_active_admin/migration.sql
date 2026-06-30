/*
  Warnings:

  - Added the required column `fileUrl` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `report` ADD COLUMN `fileUrl` VARCHAR(191) NOT NULL,
    ADD COLUMN `status` ENUM('READY') NOT NULL DEFAULT 'READY';

-- AlterTable
ALTER TABLE `user` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;
