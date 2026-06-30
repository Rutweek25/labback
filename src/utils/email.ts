import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    })
  : null;

export const sendOptionalEmail = async (to: string, subject: string, text: string): Promise<boolean> => {
  if (!transporter || !env.SMTP_FROM) {
    return false;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text
  });

  return true;
};
