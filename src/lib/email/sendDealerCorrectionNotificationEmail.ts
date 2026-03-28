import nodemailer from "nodemailer";

export type DealerCorrectionNotificationPayload = {
  toEmails: string[];
  companyName: string;
  applicationId: string;
  correctionRemarks: string;
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

export async function sendDealerCorrectionNotificationEmail(
  payload: DealerCorrectionNotificationPayload
) {
  const recipients = sanitizeEmails(payload.toEmails);

  if (!recipients.length) {
    throw new Error("No correction notification recipients provided");
  }

  const transporter = getMailer();

  const subject = `Correction Required — Dealer Onboarding Application ${payload.applicationId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 640px; margin: 0 auto;">
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
        <h2 style="margin: 0 0 12px; color: #173F63;">Correction Required — Dealer Onboarding Review</h2>

        <p style="margin: 0 0 12px;">
          A dealer onboarding application requires correction after admin review.
        </p>

        <div style="margin-top: 16px; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <p style="margin: 0 0 8px;"><strong>Dealer / Company:</strong> ${payload.companyName}</p>
          <p style="margin: 0 0 8px;"><strong>Application ID:</strong> ${payload.applicationId}</p>
          <p style="margin: 0;"><strong>Status:</strong> Correction Requested</p>
        </div>

        <div style="margin-top: 16px; padding: 16px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 12px;">
          <p style="margin: 0 0 8px;"><strong>Correction Remarks</strong></p>
          <p style="margin: 0; white-space: pre-line;">${payload.correctionRemarks}</p>
        </div>

        <p style="margin-top: 16px;">
          Please review the remarks and coordinate the required corrective action.
        </p>

        <p style="margin-top: 24px; margin-bottom: 0;">
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

  console.log("DEALER CORRECTION NOTIFICATION EMAIL SENT:", {
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