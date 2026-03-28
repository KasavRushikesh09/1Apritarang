import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendDealerCorrectionNotificationEmail } from "@/lib/email/sendDealerCorrectionNotificationEmail";

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};

function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getNotificationRecipients(application: any) {
  const recipients = [
    cleanEmail(application?.salesManagerEmail),
    cleanEmail(application?.itarangSignatory1Email),
    cleanEmail(application?.itarangSignatory2Email),
  ].filter(Boolean);

  return Array.from(new Set(recipients));
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { dealerId } = await context.params;
    const body = await req.json();

    const remarks = cleanString(body?.remarks);

    if (!remarks) {
      return NextResponse.json(
        { success: false, message: "Correction remarks are required" },
        { status: 400 }
      );
    }

    const applicationRows = await db
      .select()
      .from(dealerOnboardingApplications)
      .where(eq(dealerOnboardingApplications.id, dealerId))
      .limit(1);

    const application = applicationRows[0];

    if (!application) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 }
      );
    }

    await db
      .update(dealerOnboardingApplications)
      .set({
        onboardingStatus: "correction_requested",
        reviewStatus: "under_correction",
        dealerAccountStatus: "inactive",
        completionStatus: "pending",
        correctionRemarks: remarks,
        updatedAt: new Date(),
      })
      .where(eq(dealerOnboardingApplications.id, dealerId));

    const notificationRecipients = getNotificationRecipients(application);

    console.log("CORRECTION recipients:", {
      dealerId,
      applicationId: application.id,
      salesManagerEmail: application.salesManagerEmail,
      itarangSignatory1Email: application.itarangSignatory1Email,
      itarangSignatory2Email: application.itarangSignatory2Email,
      notificationRecipients,
    });

    if (notificationRecipients.length === 0) {
      console.warn("No correction notification recipients found for application:", {
        dealerId,
        applicationId: application.id,
      });
    }

    const emailResult = await sendDealerCorrectionNotificationEmail({
      toEmails: notificationRecipients,
      companyName: application.companyName || "Unknown Company",
      applicationId: String(application.id),
      correctionRemarks: remarks,
    });

    return NextResponse.json({
      success: true,
      message: emailResult.ok
        ? "Correction request sent"
        : "Correction saved but email failed",
      notificationRecipients,
      emailResult,
    });
  } catch (error: any) {
    console.error("REQUEST CORRECTION ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Error",
      },
      { status: 500 }
    );
  }
}