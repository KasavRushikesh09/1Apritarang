export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  dealerAgreementEvents,
  dealerAgreementSigners,
  dealerOnboardingApplications,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { canReInitiateAgreement } from "@/lib/agreement/status";

type Context = {
  params: Promise<{ dealerId: string }>;
};

export async function GET(_req: NextRequest, context: Context) {
  try {
    const { dealerId } = await context.params;

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

    const signerRows = await db
      .select()
      .from(dealerAgreementSigners)
      .where(eq(dealerAgreementSigners.applicationId, application.id));

    const signerOrder = [
      "dealer",
      "financier",
      "itarang_signatory_1",
      "itarang_signatory_2",
    ];

    const signers = [...signerRows]
      .sort((a, b) => {
        const aIndex = signerOrder.indexOf(a.signerRole || "");
        const bIndex = signerOrder.indexOf(b.signerRole || "");
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      })
      .map((signer) => ({
        id: signer.id,
        signerRole: signer.signerRole || "unknown",
        signerName: signer.signerName || "Not available",
        signerEmail: signer.signerEmail || null,
        signerMobile: signer.signerMobile || null,
        signingMethod: signer.signingMethod || null,
        signerStatus: signer.signerStatus || "pending",
        signedAt: signer.signedAt || null,
        providerSigningUrl: signer.providerSigningUrl || null,
      }));

    const eventRows = await db
      .select()
      .from(dealerAgreementEvents)
      .where(eq(dealerAgreementEvents.applicationId, application.id))
      .orderBy(desc(dealerAgreementEvents.createdAt));

    const timeline = eventRows.map((event) => ({
      id: event.id,
      eventType: event.eventType || "event",
      signerRole: event.signerRole || null,
      eventStatus: event.eventStatus || null,
      createdAt: event.createdAt || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        applicationId: application.id,
        agreementId: application.providerDocumentId || null,
        requestId: application.requestId || null,
        agreementStatus: application.agreementStatus || "not_generated",
        reviewStatus: application.reviewStatus || null,
        signedAgreementUrl: application.signedAgreementUrl || null,
        auditTrailUrl: application.auditTrailUrl || null,
        completionStatus: application.completionStatus || null,
        stampStatus: application.stampStatus || null,
        failureReason: application.agreementFailureReason || null,
        lastActionTimestamp: application.lastActionTimestamp || null,
        canReInitiate: canReInitiateAgreement(application.agreementStatus),
        signers,
        timeline,
      },
    });
  } catch (error: any) {
    console.error("AGREEMENT TRACKING GET ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to fetch agreement tracking",
      },
      { status: 500 }
    );
  }
}