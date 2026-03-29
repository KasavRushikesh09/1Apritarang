import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  dealerAgreementSigners,
  dealerOnboardingApplications,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  mapDigioSignerStatus,
  mapDigioStatusToAgreementStatus,
} from "@/lib/agreement/status";
import { insertAgreementEvent } from "@/lib/agreement/tracking";

function extractSignedAgreementUrl(body: any) {
  return (
    body?.signed_agreement_url ||
    body?.download_url ||
    body?.document_url ||
    body?.file_url ||
    body?.signed_file_url ||
    body?.document?.download_url ||
    body?.document?.file_url ||
    body?.agreement?.download_url ||
    body?.agreement?.file_url ||
    null
  );
}

function extractAuditTrailUrl(body: any) {
  return (
    body?.audit_trail_url ||
    body?.auditTrailUrl ||
    body?.audit_url ||
    body?.document?.audit_trail_url ||
    body?.document?.auditTrailUrl ||
    body?.agreement?.audit_trail_url ||
    body?.agreement?.auditTrailUrl ||
    null
  );
}

function extractFailureReason(body: any) {
  return (
    body?.failure_reason ||
    body?.reason ||
    body?.message ||
    body?.error ||
    null
  );
}

async function findApplication(documentId?: string | null, requestId?: string | null) {
  if (documentId) {
    const byDocumentId = await db
      .select()
      .from(dealerOnboardingApplications)
      .where(eq(dealerOnboardingApplications.providerDocumentId, documentId))
      .limit(1);

    if (byDocumentId[0]) {
      return byDocumentId[0];
    }
  }

  if (requestId) {
    const byRequestId = await db
      .select()
      .from(dealerOnboardingApplications)
      .where(eq(dealerOnboardingApplications.requestId, requestId))
      .limit(1);

    if (byRequestId[0]) {
      return byRequestId[0];
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const documentId =
      body.document_id || body.documentId || body.id || null;
    const requestId = body.request_id || body.requestId || null;
    const rawStatus = body.status || "";
    const agreementStatus = mapDigioStatusToAgreementStatus(rawStatus);
    const signedAgreementUrl = extractSignedAgreementUrl(body);
    const auditTrailUrl = extractAuditTrailUrl(body);
    const failureReason = extractFailureReason(body);

    console.log("[DIGIO WEBHOOK] documentId:", documentId);
    console.log("[DIGIO WEBHOOK] requestId:", requestId);
    console.log("[DIGIO WEBHOOK] rawStatus:", rawStatus);
    console.log("[DIGIO WEBHOOK] mapped agreementStatus:", agreementStatus);
    console.log("[DIGIO WEBHOOK] extracted signedAgreementUrl:", signedAgreementUrl);
    console.log("[DIGIO WEBHOOK] extracted auditTrailUrl:", auditTrailUrl);
    console.log("[DIGIO WEBHOOK] full body:", JSON.stringify(body, null, 2));

    if (!documentId && !requestId) {
      return NextResponse.json(
        {
          success: false,
          message: "document_id or request_id is required in Digio webhook",
        },
        { status: 400 }
      );
    }

    const application = await findApplication(documentId, requestId);

    if (!application) {
      console.error("[DIGIO WEBHOOK] Application not found for documentId/requestId");
      return NextResponse.json(
        {
          success: false,
          message: "Application not found for provided Digio identifiers",
        },
        { status: 404 }
      );
    }

    const updatePayload: any = {
      agreementStatus,
      requestId: requestId || application.requestId || null,
      providerDocumentId: documentId || application.providerDocumentId || null,
      providerRawResponse: body,
      lastActionTimestamp: new Date(),
      updatedAt: new Date(),
    };

    if (agreementStatus === "completed") {
      updatePayload.reviewStatus = "pending_admin_review";
      updatePayload.completionStatus = "completed";
      updatePayload.signedAt = new Date();
      updatePayload.agreementCompletedAt = new Date();

      if (signedAgreementUrl) {
        updatePayload.signedAgreementUrl = signedAgreementUrl;
      }

      if (auditTrailUrl) {
        updatePayload.auditTrailUrl = auditTrailUrl;
      }

      try {
        const appBaseUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";

        if (!signedAgreementUrl) {
          await fetch(
            `${appBaseUrl}/api/admin/dealer-verifications/${application.id}/fetch-signed-agreement`,
            { method: "POST" }
          );
        }

        if (!auditTrailUrl) {
          await fetch(
            `${appBaseUrl}/api/admin/dealer-verifications/${application.id}/fetch-audit-trail`,
            { method: "POST" }
          );
        }
      } catch (e) {
        console.error("AUTO FETCH SIGNED DOCS ERROR:", e);
      }
    }

    if (agreementStatus === "failed") {
      updatePayload.reviewStatus = "pending_admin_review";
      updatePayload.completionStatus = "pending";
      updatePayload.agreementFailedAt = new Date();
      updatePayload.agreementFailureReason = failureReason;
    }

    if (agreementStatus === "expired") {
      updatePayload.reviewStatus = "pending_admin_review";
      updatePayload.completionStatus = "pending";
      updatePayload.agreementExpiredAt = new Date();
    }

    if (
      agreementStatus === "sent_to_external_party" ||
      agreementStatus === "sign_pending" ||
      agreementStatus === "partially_signed"
    ) {
      updatePayload.reviewStatus = "pending_admin_review";
      updatePayload.completionStatus = "pending";
    }

    await db
      .update(dealerOnboardingApplications)
      .set(updatePayload)
      .where(eq(dealerOnboardingApplications.id, application.id));

    const signingParties = Array.isArray(body?.signing_parties)
      ? body.signing_parties
      : [];

    const existingSigners = await db
      .select()
      .from(dealerAgreementSigners)
      .where(eq(dealerAgreementSigners.applicationId, application.id));

    for (const party of signingParties) {
      const identifier = String(
        party?.identifier || party?.email || party?.mobile || ""
      ).trim();

      if (!identifier) continue;

      const matchedSigner = existingSigners.find((row) => {
        return (
          String(row.providerSignerIdentifier || "")
            .trim()
            .toLowerCase() === identifier.toLowerCase() ||
          String(row.signerEmail || "")
            .trim()
            .toLowerCase() === identifier.toLowerCase() ||
          String(row.signerMobile || "").trim() === identifier
        );
      });

      if (!matchedSigner) continue;

      const signerStatus = mapDigioSignerStatus(party?.status);

      await db
        .update(dealerAgreementSigners)
        .set({
          signerStatus,
          providerSigningUrl:
            party?.authentication_url || matchedSigner.providerSigningUrl,
          providerRawResponse: party || {},
          signedAt:
            signerStatus === "signed" ? new Date() : matchedSigner.signedAt,
          lastEventAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dealerAgreementSigners.id, matchedSigner.id));

      await insertAgreementEvent({
        applicationId: application.id,
        providerDocumentId: documentId || application.providerDocumentId || null,
        requestId: requestId || application.requestId || null,
        eventType: "signer_status_updated",
        signerRole: matchedSigner.signerRole,
        eventStatus: signerStatus,
        eventPayload: party || {},
      });
    }

    await insertAgreementEvent({
      applicationId: application.id,
      providerDocumentId: documentId || application.providerDocumentId || null,
      requestId: requestId || application.requestId || null,
      eventType: agreementStatus,
      eventStatus: agreementStatus,
      eventPayload: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DIGIO WEBHOOK ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Digio webhook processing failed",
      },
      { status: 500 }
    );
  }
}