import nodemailer from "nodemailer";

export type DealerRejectionNotificationPayload = {
  toEmails: string[];
  companyName: string;
  applicationId: string;
  rejectionRemarks: string;
};

function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("Missing SMTP configuration in environment variables");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

function sanitizeEmails(emails: string[]) {
  return Array.from(
    new Set(
      emails
        .map((email) => (typeof email === "string" ? email.trim().toLowerCase() : ""))
        .filter(Boolean)
    )
  );
}

export async function sendDealerRejectionNotificationEmail(
  payload: DealerRejectionNotificationPayload
) {
  const recipients = sanitizeEmails(payload.toEmails);

  if (!recipients.length) {
    throw new Error("No rejection notification recipients provided");
  }

  const transporter = getMailer();

  const subject = `Dealer Onboarding Rejected — Application ${payload.applicationId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 640px; margin: 0 auto;">
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        <h2 style="margin: 0 0 12px; color: #7f1d1d;">Dealer Onboarding Rejected</h2>

        <p>A dealer onboarding application has been rejected after admin review.</p>

        <div style="margin-top: 16px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <p><strong>Dealer / Company:</strong> ${payload.companyName}</p>
          <p><strong>Application ID:</strong> ${payload.applicationId}</p>
          <p><strong>Status:</strong> Rejected</p>
        </div>

        <div style="margin-top: 16px; padding: 16px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px;">
          <p><strong>Rejection Remarks</strong></p>
          <p style="white-space: pre-line;">${payload.rejectionRemarks}</p>
        </div>

        <p style="margin-top: 16px;">
          Please review the rejection remarks and take the necessary action.
        </p>

        <p style="margin-top: 24px;">
          Regards,<br/>
          iTarang Compliance Team
        </p>
      </div>
    </div>
  `;

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: recipients.join(","),
    subject,
    html,
  });

  console.log("DEALER REJECTION NOTIFICATION EMAIL SENT:", {
    messageId: info.messageId,
    recipients,
    applicationId: payload.applicationId,
  });

  return {
    ok: true,
    messageId: info.messageId,
    recipients,
  };
}