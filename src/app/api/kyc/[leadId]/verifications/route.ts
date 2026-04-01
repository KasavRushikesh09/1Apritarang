export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kycVerifications, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth-utils";

type RouteContext = {
  params: { leadId: string };
};

const LABELS: Record<string, string> = {
  aadhaar: "Aadhaar Verification",
  pan: "PAN Verification",
  bank: "Bank Verification",
  address: "Address Proof",
  rc: "RC Verification",
  mobile: "Mobile Number",
  cibil: "CIBIL Score",
  photo: "Photo Verification",
};

const DEFAULT_VERIFICATIONS = [
  "aadhaar",
  "pan",
  "bank",
  "address",
  "mobile",
  "photo",
];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireRole(["dealer"]);
    const { leadId } = params;

    const leadRows = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const lead = leadRows[0];

    if (!lead) {
      return NextResponse.json(
        { success: false, error: { message: "Lead not found" } },
        { status: 404 }
      );
    }

    const ownerId = (lead as any)?.created_by ?? null;
    if (ownerId && ownerId !== user.id) {
      return NextResponse.json(
        { success: false, error: { message: "You do not have access to this lead" } },
        { status: 403 }
      );
    }

    const paymentMethod = String(lead.payment_method || "").toLowerCase();
    const isFinance = ["finance", "dealer_finance", "other_finance", "loan"].includes(
      paymentMethod
    );

    const assetModel = String(lead.asset_model || "").toUpperCase();
    const isVehicle = ["2W", "3W", "4W"].includes(assetModel.toUpperCase());

    const expectedTypes = [...DEFAULT_VERIFICATIONS];

    if (isFinance) {
      expectedTypes.push("cibil");
    }

    if (isVehicle) {
      expectedTypes.push("rc");
    }

    const verificationRows = await db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.lead_id, leadId));

    const verificationMap = new Map(
      verificationRows.map((row) => [String(row.verification_type), row])
    );

    const data = expectedTypes.map((type) => {
      const row = verificationMap.get(type);

      if (row) {
        return {
          type: row.verification_type,
          label: LABELS[String(row.verification_type)] || String(row.verification_type),
          status: row.status || "pending",
          last_update: row.updated_at ? row.updated_at.toISOString() : null,
          failed_reason: row.failed_reason || null,
        };
      }

      return {
        type,
        label: LABELS[type] || type,
        status: "pending",
        last_update: null,
        failed_reason: null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[KYC Verifications] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch verifications";

    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}
