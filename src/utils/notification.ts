import { prisma } from "../config/prisma";
import { getSocketServer } from "../config/socket";
import { Prisma } from "@prisma/client";

type NotificationInput = {
  recipientIds: string[];
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export const pushNotification = async (input: NotificationInput) => {
  const recipientIds = Array.from(new Set(input.recipientIds.map(String).filter(Boolean)));
  if (!recipientIds.length) {
    return [];
  }

  const notifications = await Promise.all(
    recipientIds.map((recipientId) =>
      prisma.notification.create({
        data: {
          recipientId,
          type: input.type,
          title: input.title,
          message: input.message,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata as Prisma.InputJsonValue | undefined
        }
      })
    )
  );

  const io = getSocketServer();
  notifications.forEach((notification) => {
    io.to(`user:${notification.recipientId}`).emit("notification:new", notification);
  });

  return notifications;
};