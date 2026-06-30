export const roles = ["DOCTOR", "TECHNICIAN", "ADMIN"] as const;
export type Role = (typeof roles)[number];

export const orderStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const sampleStatuses = ["PENDING", "COLLECTED", "RECEIVED", "PROCESSING"] as const;
export type SampleStatus = (typeof sampleStatuses)[number];

export const paymentStatuses = ["PENDING", "PAID"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const paymentMethods = ["CASH", "ONLINE"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const reportStatuses = ["UPLOADED", "READY", "REJECTED"] as const;
export type ReportStatus = (typeof reportStatuses)[number];
