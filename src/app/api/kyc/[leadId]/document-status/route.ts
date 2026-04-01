export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kycDocuments, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth-utils";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

const ALWAYS_REQUIRED = [
  "aadhaar_front",
  "aadhaar_back",
  "pan_card",
  "passport_photo",
  "address_proof",
  "bank_statement",
  "cheque_1",
  "cheque_2",
  "cheque_3",
  "cheque_4",
];

export async function GET(_req: Request, context: RouteContext) {
  try {
    await requireRole(["dealer"]);
    const { leadId } = await context.params;

    if (!leadId) {
      return NextResponse.json(
        { success: false, message: "Lead id missing" },
        { status: 400 }
      );
    }

    const leadRows = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const lead = leadRows[0];

    if (!lead) {
      return NextResponse.json(
        { success: false, message: "Lead not found" },
        { status: 404 }
      );
    }

    const docs = await db
      .select()
      .from(kycDocuments)
      .where(eq(kycDocuments.lead_id, leadId));

    const requiredDocs = [...ALWAYS_REQUIRED];

    const assetCategory = String(lead.asset_model || "").toLowerCase();
    const isVehicleCategory =
      assetCategory.includes("2w") ||
      assetCategory.includes("3w") ||
      assetCategory.includes("4w");

    if (isVehicleCategory) {
      requiredDocs.push("rc_copy");
    }

    const uploadedTypes = new Set(
      docs.filter((d) => !!d.file_url).map((d) => String(d.doc_type))
    );

    const missingDocuments = requiredDocs.filter((doc) => !uploadedTypes.has(doc));
    const uploaded = requiredDocs.filter((doc) => uploadedTypes.has(doc)).length;
    const totalRequired = requiredDocs.length;
    const pending = totalRequired - uploaded;

    const adminVerificationCompleted =
      docs.length > 0 &&
      docs
        .filter((d) => requiredDocs.includes(String(d.doc_type)))
        .every((d) => String(d.verification_status || "").toLowerCase() === "success");

    return NextResponse.json({
      success: true,
      data: {
        totalRequired,
        uploaded,
        pending,
        missingDocuments,
        allUploaded: pending === 0,
        adminVerificationStatus: adminVerificationCompleted ? "completed" : "pending",
        canProceedToNextStep: false,
      },
    });
  } catch (error) {
    console.error("KYC document-status error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch document status" },
      { status: 500 }
    );
  }
}
