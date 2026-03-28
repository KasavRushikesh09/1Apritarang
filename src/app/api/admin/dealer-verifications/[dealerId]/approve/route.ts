import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dealerOnboardingApplications, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateTemporaryPassword } from "@/lib/auth/generateTemporaryPassword";
import { hashPassword } from "@/lib/auth/hashPassword";
import { sendDealerWelcomeEmail } from "@/lib/email/sendDealerWelcomeEmail";
import { sendDealerApprovalNotificationEmail } from "@/lib/email/sendDealerApprovalNotificationEmail";
import { supabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};

function generateDealerCode() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(100 + Math.random() * 900);

  return `ACC-ITARANG-${yyyy}${mm}${dd}-${random}`;
}

function resolveDealerLoginEmail(application: any) {
  return application?.ownerEmail?.trim?.() || null;
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

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { dealerId } = await context.params;

    const existing = await db
      .select()
      .from(dealerOnboardingApplications)
      .where(eq(dealerOnboardingApplications.id, dealerId));

    const application = existing[0];

    if (!application) {
      return NextResponse.json(
        { success: false, message: "Dealer onboarding application not found" },
        { status: 404 }
      );
    }

    if (application.onboardingStatus === "approved") {
      return NextResponse.json(
        { success: false, message: "Dealer already approved" },
        { status: 400 }
      );
    }

    if (application.onboardingStatus !== "submitted") {
      return NextResponse.json(
        {
          success: false,
          message: "Dealer onboarding must be submitted before approval.",
        },
        { status: 400 }
      );
    }

    const dealerCode = application.dealerCode || generateDealerCode();
    const dealerLoginEmail = resolveDealerLoginEmail(application);

    if (!dealerLoginEmail) {
      return NextResponse.json(
        {
          success: false,
          message: "Dealer owner email is missing in onboarding record.",
        },
        { status: 400 }
      );
    }

    if (application.financeEnabled) {
      if (
        application.agreementStatus !== "completed" ||
        application.reviewStatus !== "agreement_completed" ||
        !application.providerDocumentId
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Finance-enabled dealers cannot be approved until the agreement is completed.",
          },
          { status: 400 }
        );
      }
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const { data: authUsers, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error("SUPABASE AUTH LIST USERS ERROR:", listError);
      return NextResponse.json(
        {
          success: false,
          message: `Failed to list auth users: ${listError.message}`,
        },
        { status: 500 }
      );
    }

    const existingAuthUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === dealerLoginEmail.toLowerCase()
    );

    let authUserId: string;

    if (existingAuthUser) {
      const { data: updatedAuthUser, error: updateAuthError } =
        await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            role: "dealer",
            dealer_code: dealerCode,
          },
        });

      if (updateAuthError) {
        console.error("SUPABASE AUTH UPDATE ERROR:", updateAuthError);
        return NextResponse.json(
          {
            success: false,
            message: `Failed to update auth user: ${updateAuthError.message}`,
          },
          { status: 500 }
        );
      }

      authUserId = updatedAuthUser.user.id;
    } else {
      const { data: createdAuthUser, error: createAuthError } =
        await supabaseAdmin.auth.admin.createUser({
          email: dealerLoginEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            role: "dealer",
            dealer_code: dealerCode,
          },
        });

      if (createAuthError) {
        console.error("SUPABASE AUTH CREATE ERROR:", createAuthError);
        return NextResponse.json(
          {
            success: false,
            message: `Failed to create auth user: ${createAuthError.message}`,
          },
          { status: 500 }
        );
      }

      authUserId = createdAuthUser.user.id;
    }

    await db
      .update(dealerOnboardingApplications)
      .set({
        dealerUserId: authUserId,
        onboardingStatus: "approved",
        reviewStatus: "approved",
        dealerAccountStatus: "active",
        completionStatus: "completed",
        approvedAt: new Date(),
        signedAt:
          application.agreementStatus === "completed"
            ? application.signedAt || new Date()
            : application.signedAt || null,
        rejectedAt: null,
        rejectionReason: null,
        correctionRemarks: null,
        rejectionRemarks: null,
        dealerCode,
        updatedAt: new Date(),
      })
      .where(eq(dealerOnboardingApplications.id, dealerId));

    const existingUserRows = await db
      .select()
      .from(users)
      .where(eq(users.email, dealerLoginEmail));

    const existingUser = existingUserRows[0];

    if (existingUser) {
      await db
        .update(users)
        .set({
          id: authUserId,
          name: application.ownerName || application.companyName || "Dealer",
          role: "dealer",
          dealer_id: dealerCode,
          phone: application.ownerPhone || null,
          is_active: true,
          password_hash: passwordHash,
          must_change_password: true,
          updated_at: new Date(),
        })
        .where(eq(users.email, dealerLoginEmail));
    } else {
      await db.insert(users).values({
        id: authUserId,
        email: dealerLoginEmail,
        name: application.ownerName || application.companyName || "Dealer",
        role: "dealer",
        dealer_id: dealerCode,
        phone: application.ownerPhone || null,
        avatar_url: null,
        password_hash: passwordHash,
        must_change_password: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    let emailSent = false;
    let emailError: string | null = null;

    const notificationRecipients = getNotificationRecipients(application);

    console.log("APPROVE MAIL DEBUG:", {
      applicationId: application.id,
      companyName: application.companyName,
      salesManagerEmail: application.salesManagerEmail,
      itarangSignatory1Email: application.itarangSignatory1Email,
      itarangSignatory2Email: application.itarangSignatory2Email,
      notificationRecipients,
    });
    let internalNotificationResults: Array<{
      email: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const email of notificationRecipients) {
      try {
        await sendDealerApprovalNotificationEmail({
          toEmail: email,
          companyName: application.companyName || "Unknown Company",
          dealerCode,
          dealerName:
            application.ownerName || application.companyName || "Dealer",
          approvedAt: new Date().toISOString(),
        });

        internalNotificationResults.push({
          email,
          success: true,
        });
      } catch (error: any) {
        internalNotificationResults.push({
          email,
          success: false,
          error: error?.message || "Unknown email error",
        });
      }
    }

    try {
      const mailResult = await sendDealerWelcomeEmail({
        toEmail: dealerLoginEmail,
        dealerName: application.ownerName || application.companyName || "Dealer",
        companyName: application.companyName || "iTarang Dealer",
        dealerId: dealerCode,
        userId: dealerLoginEmail,
        password: temporaryPassword,
        loginUrl: process.env.DEALER_LOGIN_URL || "http://localhost:3000/login",
        supportEmail:
          process.env.DEALER_SUPPORT_EMAIL || "support@itarang.com",
        supportPhone:
          process.env.DEALER_SUPPORT_PHONE || "+91-0000000000",
      });

      console.log("DEALER WELCOME EMAIL SUCCESS:", mailResult);
      emailSent = true;
    } catch (mailError: any) {
      emailError = mailError?.message || "Unknown email error";
      console.error("DEALER WELCOME EMAIL ERROR:", mailError);
    }

    console.log("DEALER APPROVED:", {
      dealerId,
      dealerCode,
      authUserId,
      email: dealerLoginEmail,
      approvedAt: new Date().toISOString(),
      notificationRecipients,
    });

    return NextResponse.json({
      success: true,
      message: emailSent
        ? "Dealer approved successfully and welcome email sent"
        : "Dealer approved successfully, but welcome email failed",
      dealerCode,
      authUserId,
      emailSent,
      emailTarget: dealerLoginEmail,
      emailError,
      internalNotificationResults,
    });
  } catch (error: any) {
    console.error("APPROVE DEALER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Approve failed",
      },
      { status: 500 }
    );
  }
}