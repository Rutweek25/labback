import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env } from "../config/env";

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const nodemailerTransporter =
  env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
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

export const sendOptionalEmail = async (
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> => {
  // Try Resend SDK first
  if (resendClient && env.RESEND_API_KEY) {
    try {
      const fromAddress = env.RESEND_FROM || "onboarding@resend.dev";
      const { error } = await resendClient.emails.send({
        from: fromAddress,
        to: [to],
        subject,
        text,
        html: html || text
      });

      if (error) {
        // Log safe diagnostic info only - NO API Key, NO OTP
        // eslint-disable-next-line no-console
        console.error("[RESEND ERROR]", error.message || error.name);
        return false;
      }

      return true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[RESEND EXCEPTION]", err?.message || "Failed to send email via Resend");
      return false;
    }
  }

  // Fallback to Nodemailer SMTP if configured
  if (nodemailerTransporter && env.SMTP_FROM) {
    try {
      await nodemailerTransporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text,
        ...(html ? { html } : {})
      });
      return true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[SMTP ERROR]", err?.message || "Failed to send email via SMTP");
      return false;
    }
  }

  return false;
};

export const sendPasswordResetOtpEmail = async (
  email: string,
  name: string,
  otp: string
): Promise<boolean> => {
  const subject = "Lab Management System - Password Reset OTP";
  const text = `Hi ${name},\n\nYour password reset OTP for Lab Management System is: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you did not request a password reset, you can safely ignore this email. Never share this OTP with anyone.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .logo { display: inline-block; background: #0f172a; color: #ffffff; font-weight: bold; padding: 8px 14px; border-radius: 8px; font-size: 14px; letter-spacing: 1px; }
          .title { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 20px; margin-bottom: 8px; }
          .subtitle { font-size: 14px; color: #64748b; margin-bottom: 24px; }
          .otp-box { background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
          .otp-code { font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2563eb; }
          .expiry { font-size: 12px; color: #e11d48; font-weight: 600; margin-top: 8px; }
          .warning { font-size: 13px; color: #64748b; background: #fff1f2; border: 1px solid #ffe4e6; padding: 12px; border-radius: 8px; margin-top: 24px; }
          .footer { margin-top: 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">LAB MANAGEMENT</div>
          <div class="title">Password Reset OTP</div>
          <div class="subtitle">Hi ${name}, you requested a password reset for your account.</div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="expiry">Expires in 10 minutes</div>
          </div>
          <div class="warning">
            <strong>Security Notice:</strong> Never share this code with anyone. Lab Management staff will never ask for your verification OTP.
          </div>
          <div class="subtitle" style="margin-top:20px;">If you did not request this change, you can safely ignore this email.</div>
          <div class="footer">&copy; Lab Management System. All rights reserved.</div>
        </div>
      </body>
    </html>
  `;

  return sendOptionalEmail(email, subject, text, html);
};
