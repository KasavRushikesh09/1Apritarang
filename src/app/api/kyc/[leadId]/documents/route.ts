export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kycDocuments, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth-utils";

type RouteContext = {
  params: { leadId: string };
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireRole(["dealer"]);
    const { leadId } = params;

    // ---------------------------
    // Check lead exists
    // ---------------------------
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

    // ---------------------------
    // Fetch uploaded documents
    // ---------------------------
    const docs = await db
      .select()
      .from(kycDocuments)
      .where(eq(kycDocuments.lead_id, leadId));

    // Map to frontend format
    const data = docs.map((doc) => {
      const verification = String(doc.verification_status || "pending").toLowerCase();
      const hasFile = !!doc.file_url;
      const doc_status =
        verification === "success" ? "verified" : hasFile ? "uploaded" : "not_uploaded";

      return {
        id: doc.id,
        doc_type: doc.doc_type,
        file_url: doc.file_url || null,
        file_name: doc.file_name || null,
        file_size: doc.file_size || null,
        uploaded_at: doc.uploaded_at || null,
        updated_at: doc.updated_at || null,
        doc_status,
        verification_status: doc.verification_status || "pending",
        rejection_reason: doc.failed_reason || null,
        failed_reason: doc.failed_reason || null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[KYC Documents] Error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to fetch documents";

    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}
