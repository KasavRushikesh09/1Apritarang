export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { consentRecords, kycDocuments, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth-utils";

type RouteContext = {
    params: { leadId: string };
};

const FINANCE_DOCUMENTS = [
    { key: "aadhaar_front", label: "Aadhaar Front", required: true },
    { key: "aadhaar_back", label: "Aadhaar Back", required: true },
    { key: "pan_card", label: "PAN Card", required: true },
    { key: "passport_photo", label: "Passport Size Photo", required: true },
    { key: "address_proof", label: "Address Proof", required: true },
    { key: "rc_copy", label: "RC Copy", required: false, conditional: true },
    { key: "bank_statement", label: "Bank Statement", required: true },
    { key: "cheque_1", label: "Undated Cheque 1", required: true },
    { key: "cheque_2", label: "Undated Cheque 2", required: true },
    { key: "cheque_3", label: "Undated Cheque 3", required: true },
    { key: "cheque_4", label: "Undated Cheque 4", required: true },
] as const;

const UPFRONT_DOCUMENTS = [
    { key: "aadhaar_front", label: "Aadhaar Front", required: true },
    { key: "aadhaar_back", label: "Aadhaar Back", required: true },
    { key: "pan_card", label: "PAN Card", required: true },
] as const;

function isConsentVerified(status?: string | null) {
    const value = String(status || "").toLowerCase();
    return ["verified", "admin_verified", "manual_verified"].includes(value);
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
    try {
        const user = await requireRole(["dealer"]);
        const { leadId } = params;

        // ---------------------------
        // Load lead
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
        // Ownership check
        // ---------------------------
        const ownerUserId = (lead as any)?.created_by ?? (lead as any)?.uploader_id ?? null;
        if (ownerUserId && ownerUserId !== user.id) {
            return NextResponse.json(
                { success: false, error: { message: "You do not have access to this lead" } },
                { status: 403 }
            );
        }

        // ---------------------------
        // Step 2 access rule
        // ---------------------------
        const paymentMethod = String(lead.payment_method || "").toLowerCase();
        const interestLevel = String(lead.interest_level || "").toLowerCase();

        // Step 2 allowed only for hot leads with non-cash payment method
        const canBeInStep2 =
            interestLevel === "hot" &&
            paymentMethod !== "cash";

        if (!canBeInStep2) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        message: "Step 2 completion allowed only for hot leads with non-cash payment method",
                    },
                },
                { status: 400 }
            );
        }

        // ---------------------------
        // Required documents by flow
        // ---------------------------
        const isFinance = ["finance", "dealer_finance", "other_finance", "loan"].includes(
            paymentMethod
        );

        const assetModel = String(lead.asset_model || "").toUpperCase();
        const isVehicleCategory =
            assetModel.includes("2W") ||
            assetModel.includes("3W") ||
            assetModel.includes("4W");

        const requiredDocs = (isFinance ? FINANCE_DOCUMENTS : UPFRONT_DOCUMENTS)
            .map((doc) => (doc.key === "rc_copy" ? { ...doc, required: isVehicleCategory } : doc))
            .filter((doc) => doc.required)
            .map((doc) => doc.key);

        // ---------------------------
        // Load documents
        // ---------------------------
        const docRows = await db
            .select()
            .from(kycDocuments)
            .where(eq(kycDocuments.lead_id, leadId));

        const docMap = new Map(docRows.map((row) => [String(row.doc_type), row]));

        const missingDocuments = requiredDocs.filter((docType) => {
            const row = docMap.get(docType);
            return !row || !row.file_url;
        });

        if (missingDocuments.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        message: `Missing required documents: ${missingDocuments.join(", ")}`,
                    },
                },
                { status: 400 }
            );
        }

        // ---------------------------
        // Enforce admin verification
        // Dealer uploaded docs are not enough
        // ---------------------------
        const unverifiedDocuments = requiredDocs.filter((docType) => {
            const row = docMap.get(docType);
            const verificationStatus = String(row?.verification_status || "").toLowerCase();
            return verificationStatus !== "success";
        });

        if (unverifiedDocuments.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        message: `Admin verification pending for: ${unverifiedDocuments.join(", ")}`,
                    },
                },
                { status: 400 }
            );
        }

        // ---------------------------
        // Consent check
        // ---------------------------
        const consentRows = await db
            .select()
            .from(consentRecords)
            .where(eq(consentRecords.lead_id, leadId));

        const latestConsent = consentRows
            .sort(
                (a, b) =>
                    new Date(b.updated_at || b.created_at || 0).getTime() -
                    new Date(a.updated_at || a.created_at || 0).getTime()
            )[0];

        const leadConsentStatus = String(lead.consent_status || "");
        const consentRecordStatus = String(latestConsent?.consent_status || "");

        if (!isConsentVerified(leadConsentStatus) && !isConsentVerified(consentRecordStatus)) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        message: "Consent is not admin verified yet",
                    },
                },
                { status: 400 }
            );
        }

        // ---------------------------
        // Complete Step 2
        // ---------------------------
        const now = new Date();

        await db
            .update(leads)
            .set({
                workflow_step: 3,
                kyc_status: "completed",
                kyc_completed_at: now,
                status: "ACTIVE",
                updated_at: now,
            })
            .where(eq(leads.id, leadId));

        return NextResponse.json({
            success: true,
            data: {
                leadId,
                workflow_step: 3,
                kyc_status: "completed",
                nextStep: "/dealer-portal/leads/" + leadId + "/options",
                completedAt: now.toISOString(),
                message: "Step 2 completed successfully",
            },
        });
    } catch (error) {
        console.error("[Complete Step2] Error:", error);
        const message =
            error instanceof Error ? error.message : "Failed to complete Step 2";

        return NextResponse.json(
            { success: false, error: { message } },
            { status: 500 }
        );
    }
}
