import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createServerClient } from "@supabase/ssr";

import { db } from "@/lib/db/index";
import {
  dealerOnboardingApplications,
  dealerOnboardingDocuments,
} from "@/lib/db/schema";

type NullableString = string | null;
type SafeRecord = Record<string, unknown>;

function cleanString(value: unknown): NullableString {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanEmail(value: unknown): NullableString {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanPhone(value: unknown): NullableString {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function cleanBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "yes";
  }
  return false;
}

function cleanObject(value: unknown): SafeRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SafeRecord)
    : {};
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: Record<string, any>) {
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: Record<string, any>) {
            response.cookies.set({ name, value: "", ...options, maxAge: 0 });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Auth is optional — unauthenticated dealers submit via the "Create one" flow.
    // Admin approval will later create the auth user and link dealerUserId.

    const body = await req.json();

    const dealerUserId = user?.id || null;
    const dealerCode =
      cleanString(body.dealerCode) ||
      cleanString(body.dealer_id) ||
      cleanString(body.dealerId) ||
      null;

    const companyName = cleanString(body.companyName);
    const companyType = cleanString(body.companyType);
    const gstNumber = cleanString(body.gstNumber);
    const panNumber = cleanString(body.panNumber);

    const businessAddress = cleanObject(body.businessAddress);
    const registeredAddress = cleanObject(body.registeredAddress);
    const financeEnabled = cleanBoolean(body.financeEnabled);

    const onboardingStatus =
      body.onboardingStatus === "submitted" ? "submitted" : "draft";

    const reviewStatus =
      onboardingStatus === "submitted" ? "pending_admin_review" : "draft";

    const ownerName = cleanString(body.ownerName);
    const ownerPhone = cleanPhone(body.ownerPhone);
    const ownerEmail = cleanEmail(body.ownerEmail);

    const bankName = cleanString(body.bankName);
    const accountNumber = cleanString(body.accountNumber);
    const beneficiaryName = cleanString(body.beneficiaryName);
    const ifscCode = cleanString(body.ifscCode);

    const documents: SafeRecord[] = Array.isArray(body.documents)
      ? (body.documents as SafeRecord[])
      : [];

    const agreementConfig = cleanObject(body.agreement);

    const salesManager =
      cleanObject(agreementConfig["salesManager"]) ||
      cleanObject(body["salesManager"]);

    const itarangSignatory1 =
      cleanObject(agreementConfig["itarangSignatory1"]) ||
      cleanObject(body["itarangSignatory1"]);

    const itarangSignatory2 =
      cleanObject(agreementConfig["itarangSignatory2"]) ||
      cleanObject(body["itarangSignatory2"]);

    const salesManagerName = cleanString(
      salesManager["name"] ?? salesManager["salesManagerName"]
    );

    const salesManagerEmail = cleanEmail(
      salesManager["email"] ??
        salesManager["emailId"] ??
        salesManager["salesManagerEmail"]
    );

    const salesManagerMobile = cleanPhone(
      salesManager["mobile"] ??
        salesManager["phone"] ??
        salesManager["contactNumber"] ??
        salesManager["salesManagerMobile"]
    );

    const itarangSignatory1Name = cleanString(itarangSignatory1["name"]);
    const itarangSignatory1Email = cleanEmail(itarangSignatory1["email"]);
    const itarangSignatory1Mobile = cleanPhone(itarangSignatory1["mobile"]);

    const itarangSignatory2Name = cleanString(itarangSignatory2["name"]);
    const itarangSignatory2Email = cleanEmail(itarangSignatory2["email"]);
    const itarangSignatory2Mobile = cleanPhone(itarangSignatory2["mobile"]);

    console.log("SAVE ROUTE AUTH USER ID:", dealerUserId);
    console.log("SAVE ROUTE COMPANY NAME:", companyName);
    console.log("SAVE ROUTE REVIEW STATUS:", reviewStatus);

    if (!companyName) {
      return NextResponse.json(
        { success: false, message: "Company name is required" },
        { status: 400 }
      );
    }

    if (onboardingStatus === "submitted") {
      if (!ownerName) {
        return NextResponse.json(
          {
            success: false,
            message: "Primary contact name is required before submission",
          },
          { status: 400 }
        );
      }

      if (!ownerPhone) {
        return NextResponse.json(
          {
            success: false,
            message: "Primary contact phone is required before submission",
          },
          { status: 400 }
        );
      }

      if (!ownerEmail) {
        return NextResponse.json(
          {
            success: false,
            message: "Primary contact email is required before submission",
          },
          { status: 400 }
        );
      }
    }

    let application: typeof dealerOnboardingApplications.$inferSelect | null =
      null;

    if (dealerUserId) {
      const existing = await db
        .select()
        .from(dealerOnboardingApplications)
        .where(eq(dealerOnboardingApplications.dealerUserId, dealerUserId))
        .limit(1);

      if (existing.length > 0) {
        application = existing[0];
      }
    }

    if (!application && ownerEmail) {
      const existingByEmail = await db
        .select()
        .from(dealerOnboardingApplications)
        .where(eq(dealerOnboardingApplications.ownerEmail, ownerEmail))
        .limit(1);

      if (existingByEmail.length > 0) {
        application = existingByEmail[0];
      }
    }

    if (!application && dealerCode) {
      const existingByCode = await db
        .select()
        .from(dealerOnboardingApplications)
        .where(eq(dealerOnboardingApplications.dealerCode, dealerCode))
        .limit(1);

      if (existingByCode.length > 0) {
        application = existingByCode[0];
      }
    }

    if (application) {
      const updatedApplications = await db
        .update(dealerOnboardingApplications)
        .set({
          dealerUserId,
          dealerCode,
          companyName,
          companyType,
          gstNumber,
          panNumber,
          businessAddress,
          registeredAddress,
          financeEnabled,
          onboardingStatus,
          reviewStatus,
          submittedAt: onboardingStatus === "submitted" ? new Date() : null,
          ownerName,
          ownerPhone,
          ownerEmail,
          bankName,
          accountNumber,
          beneficiaryName,
          ifscCode,
          updatedAt: new Date(),

          salesManagerName,
          salesManagerEmail,
          salesManagerMobile,

          itarangSignatory1Name,
          itarangSignatory1Email,
          itarangSignatory1Mobile,

          itarangSignatory2Name,
          itarangSignatory2Email,
          itarangSignatory2Mobile,

          agreementStatus:
            onboardingStatus === "submitted"
              ? "not_generated"
              : (typeof agreementConfig["agreementStatus"] === "string" &&
                  agreementConfig["agreementStatus"]) ||
                "not_generated",

          providerSigningUrl: null,
          providerDocumentId: null,
          requestId: null,

          providerRawResponse: {
            agreement: agreementConfig,
          },

          stampStatus: "pending",
          completionStatus: "pending",
          lastActionTimestamp: new Date(),
        })
        .where(eq(dealerOnboardingApplications.id, application.id))
        .returning();

      application = updatedApplications[0] ?? null;
    } else {
      const insertedApplications = await db
        .insert(dealerOnboardingApplications)
        .values({
          dealerUserId,
          dealerCode,
          companyName,
          companyType,
          gstNumber,
          panNumber,
          businessAddress,
          registeredAddress,
          financeEnabled,
          onboardingStatus,
          reviewStatus,
          submittedAt: onboardingStatus === "submitted" ? new Date() : null,
          ownerName,
          ownerPhone,
          ownerEmail,
          bankName,
          accountNumber,
          beneficiaryName,
          ifscCode,

          salesManagerName,
          salesManagerEmail,
          salesManagerMobile,

          itarangSignatory1Name,
          itarangSignatory1Email,
          itarangSignatory1Mobile,

          itarangSignatory2Name,
          itarangSignatory2Email,
          itarangSignatory2Mobile,

          providerRawResponse: {
            agreement: agreementConfig,
          },

          agreementStatus: "not_generated",
          stampStatus: "pending",
          completionStatus: "pending",
          lastActionTimestamp: new Date(),
        })
        .returning();

      application = insertedApplications[0] ?? null;
    }

    if (!application) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to create or update onboarding application",
        },
        { status: 500 }
      );
    }

    await db
      .delete(dealerOnboardingDocuments)
      .where(eq(dealerOnboardingDocuments.applicationId, application.id));

    if (documents.length > 0) {
      const validDocuments = documents
        .filter((doc) => {
          return (
            typeof doc["documentType"] === "string" &&
            typeof doc["bucketName"] === "string" &&
            typeof doc["storagePath"] === "string" &&
            typeof doc["fileName"] === "string"
          );
        })
        .map((doc) => ({
          applicationId: application.id,
          documentType: String(doc["documentType"]),
          bucketName: String(doc["bucketName"]),
          storagePath: String(doc["storagePath"]),
          fileName: String(doc["fileName"]),
          fileUrl: typeof doc["fileUrl"] === "string" ? doc["fileUrl"] : null,
          mimeType:
            typeof doc["mimeType"] === "string" ? doc["mimeType"] : null,
          fileSize:
            typeof doc["fileSize"] === "number" ? doc["fileSize"] : null,
          uploadedBy: dealerUserId,
          docStatus:
            typeof doc["docStatus"] === "string" ? doc["docStatus"] : "uploaded",
          verificationStatus:
            typeof doc["verificationStatus"] === "string"
              ? doc["verificationStatus"]
              : "pending",
          metadata:
            doc["metadata"] &&
            typeof doc["metadata"] === "object" &&
            !Array.isArray(doc["metadata"])
              ? (doc["metadata"] as Record<string, unknown>)
              : {},
        }));

      if (validDocuments.length > 0) {
        await db.insert(dealerOnboardingDocuments).values(validDocuments);
      }
    }

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: any) {
    console.error("SAVE ONBOARDING ERROR FULL:", error);
    console.error("SAVE ONBOARDING ERROR MESSAGE:", error?.message);
    console.error("SAVE ONBOARDING ERROR CAUSE:", error?.cause);
    console.error("SAVE ONBOARDING ERROR DETAIL:", error?.cause?.detail);
    console.error("SAVE ONBOARDING ERROR CODE:", error?.cause?.code);

    return NextResponse.json(
      {
        success: false,
        message:
          error?.cause?.message ||
          error?.message ||
          "Failed to save onboarding application",
      },
      { status: 500 }
    );
  }
}