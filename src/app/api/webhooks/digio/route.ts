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

function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function extractSignedAgreementUrl(body: any) {
  return (
    body?.signed_agreement_url ||
    body?.download_url ||
    body?.document_url ||
    body?.file_url ||
    body?.signed_file_url ||
    body?.document?.download_url ||
    body?.document?.file_url ||
    body?.document?.signed_agreement_url ||
    body?.agreement?.download_url ||
    body?.agreement?.file_url ||
    body?.agreement?.signed_agreement_url ||
    body?.data?.download_url ||
    body?.data?.file_url ||
    body?.data?.signed_agreement_url ||
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
    body?.data?.audit_trail_url ||
    body?.data?.auditTrailUrl ||
    null
  );
}

function extractFailureReason(body: any) {
  return (
    body?.failure_reason ||
    body?.reason ||
    body?.message ||
    body?.error ||
    body?.error_msg ||
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

    if (byDocumentId[0]) return byDocumentId[0];
  }

  if (requestId) {
    const byRequestId = await db
      .select()
      .from(dealerOnboardingApplications)
      .where(eq(dealerOnboardingApplications.requestId, requestId))
      .limit(1);

    if (byRequestId[0]) return byRequestId[0];
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid webhook JSON body" },
        { status: 400 }
      );
    }

    const documentId = cleanString(
      body?.document_id || body?.documentId || body?.id || ""
    ) || null;

    const requestId = cleanString(
      body?.request_id || body?.requestId || ""
    ) || null;

    const rawStatus = cleanString(body?.status || "");
    const agreementStatus = mapDigioStatusToAgreementStatus(rawStatus);
    const signedAgreementUrl = extractSignedAgreementUrl(body);
    const auditTrailUrl = extractAuditTrailUrl(body);
    const failureReason = extractFailureReason(body);

    console.log("[DIGIO WEBHOOK] raw status:", rawStatus);
    console.log("[DIGIO WEBHOOK] mapped agreement status:", agreementStatus);
    console.log("[DIGIO WEBHOOK] documentId:", documentId);
    console.log("[DIGIO WEBHOOK] requestId:", requestId);
    console.log("[DIGIO WEBHOOK] signedAgreementUrl:", signedAgreementUrl);
    console.log("[DIGIO WEBHOOK] auditTrailUrl:", auditTrailUrl);

    if (!documentId && !requestId) {
      return NextResponse.json(
        { success: false, message: "document_id or request_id missing" },
        { status: 400 }
      );
    }

    const application = await findApplication(documentId, requestId);

    if (!application) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
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

    // In-progress statuses
    if (
      agreementStatus === "sent_to_external_party" ||
      agreementStatus === "partially_signed"
    ) {
      updatePayload.reviewStatus = "agreement_in_progress";
      updatePayload.completionStatus = "pending";
    }

    // Completed
    if (agreementStatus === "completed") {
      updatePayload.reviewStatus = "agreement_completed";
      updatePayload.completionStatus = "completed";
      updatePayload.signedAt = new Date();
      updatePayload.agreementCompletedAt = new Date();

      if (signedAgreementUrl) {
        updatePayload.signedAgreementUrl = signedAgreementUrl;
      }

      if (auditTrailUrl) {
        updatePayload.auditTrailUrl = auditTrailUrl;
      }

      // Auto-fetch/store files if provider did not send direct URLs
      try {
        const appBaseUrl =
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";

        if (!signedAgreementUrl) {
          const signedFetchRes = await fetch(
            `${appBaseUrl}/api/admin/dealer-verifications/${application.id}/download-signed-agreement`,
            { method: "GET" }
          );

          console.log(
            "[DIGIO WEBHOOK] auto signed-agreement fetch status:",
            signedFetchRes.status
          );
        }

        if (!auditTrailUrl) {
          const auditFetchRes = await fetch(
            `${appBaseUrl}/api/admin/dealer-verifications/${application.id}/fetch-audit-trail`,
            { method: "POST" }
          );

          console.log(
            "[DIGIO WEBHOOK] auto audit-trail fetch status:",
            auditFetchRes.status
          );
        }
      } catch (e) {
        console.error("[DIGIO WEBHOOK] AUTO FETCH ERROR:", e);
      }
    }

    // Failed
    if (agreementStatus === "failed") {
      updatePayload.reviewStatus = "pending_admin_review";
      updatePayload.completionStatus = "pending";
      updatePayload.agreementFailedAt = new Date();
      updatePayload.agreementFailureReason = failureReason;
    }

    // Expired
    if (agreementStatus === "expired") {
      updatePayload.reviewStatus = "pending_admin_review";
      updatePayload.completionStatus = "pending";
      updatePayload.agreementExpiredAt = new Date();
    }

    await db
      .update(dealerOnboardingApplications)
      .set(updatePayload)
      .where(eq(dealerOnboardingApplications.id, application.id));

    // Update signer rows
    const signingParties = Array.isArray(body?.signing_parties)
      ? body.signing_parties
      : [];

    const existingSigners = await db
      .select()
      .from(dealerAgreementSigners)
      .where(eq(dealerAgreementSigners.applicationId, application.id));

    for (const party of signingParties) {
      const identifier = cleanString(
        party?.identifier || party?.email || party?.mobile || ""
      );

      if (!identifier) continue;

      const matchedSigner = existingSigners.find((row) => {
        return (
          cleanString(row.providerSignerIdentifier || "").toLowerCase() ===
            identifier.toLowerCase() ||
          cleanString(row.signerEmail || "").toLowerCase() ===
            identifier.toLowerCase() ||
          cleanString(row.signerMobile || "") === identifier
        );
      });

      if (!matchedSigner) continue;

      const signerStatus = mapDigioSignerStatus(party?.status);

      await db
        .update(dealerAgreementSigners)
        .set({
          signerStatus,
          providerSigningUrl:
            party?.authentication_url ||
            party?.authenticationUrl ||
            matchedSigner.providerSigningUrl,
          providerRawResponse: party || {},
          signedAt:
            signerStatus === "signed"
              ? matchedSigner.signedAt || new Date()
              : matchedSigner.signedAt,
          lastEventAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dealerAgreementSigners.id, matchedSigner.id));
    }

    await insertAgreementEvent({
      applicationId: application.id,
      providerDocumentId: documentId || application.providerDocumentId || null,
      requestId: requestId || application.requestId || null,
      eventType: agreementStatus,
      eventStatus: agreementStatus,
      eventPayload: body,
    });

    return NextResponse.json({
      success: true,
      agreementStatus,
      signedAgreementUrl,
      auditTrailUrl,
    });
  } catch (error: any) {
    console.error("DIGIO WEBHOOK ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Webhook processing failed",
      },
      { status: 500 }
    );
  }
}