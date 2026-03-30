export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function uploadFileToSupabase(url: string, path: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from("dealer-documents")
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error("Supabase upload failed: " + error.message);
  }

  const { data } = supabase.storage.from("dealer-documents").getPublicUrl(path);
  return data.publicUrl;
}

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};

function cleanEnv(value?: string) {
  return value?.trim().replace(/^[\"']|[\"']$/g, "");
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function normalizeAgreementStatus(rawStatus?: string | null) {
  const status = String(rawStatus || "").trim().toLowerCase();

  if (["completed", "signed"].includes(status)) return "completed";
  if (["partially_signed", "partial"].includes(status)) return "partially_signed";
  if (["expired"].includes(status)) return "expired";
  if (["failed", "cancelled", "rejected"].includes(status)) return "failed";

  return "sent_for_signature";
}

function extractSigningUrl(parsed: any) {
  const signingParties = Array.isArray(parsed?.signing_parties)
    ? parsed.signing_parties
    : [];

  const dealerParty =
    signingParties.find(
      (party: any) =>
        String(party?.reason || "").toLowerCase() === "dealer signer"
    ) || signingParties[0];

  return (
    dealerParty?.authentication_url ||
    parsed?.signing_url ||
    parsed?.redirect_url ||
    null
  );
}

function extractSignedAgreementUrl(parsed: any) {
  return (
    parsed?.signed_agreement_url ||
    parsed?.executed_file_url ||
    parsed?.file_url ||
    parsed?.download_url ||
    parsed?.document_url ||
    parsed?.agreement?.signed_agreement_url ||
    parsed?.agreement?.executed_file_url ||
    parsed?.agreement?.file_url ||
    parsed?.agreement?.download_url ||
    parsed?.agreement?.document_url ||
    parsed?.data?.signed_agreement_url ||
    parsed?.data?.executed_file_url ||
    parsed?.data?.file_url ||
    parsed?.data?.download_url ||
    parsed?.data?.document_url ||
    parsed?.raw?.signed_agreement_url ||
    parsed?.raw?.executed_file_url ||
    parsed?.raw?.file_url ||
    parsed?.raw?.download_url ||
    parsed?.raw?.document_url ||
    null
  );
}

function extractSignedAt(parsed: any) {
  return parsed?.signed_at || parsed?.completed_at || parsed?.execution_date || null;
}

export async function POST(_req: NextRequest, context: RouteContext) {
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

    if (!application.providerDocumentId) {
      return NextResponse.json(
        { success: false, message: "Agreement not initiated yet." },
        { status: 400 }
      );
    }

    const clientId = cleanEnv(process.env.DIGIO_CLIENT_ID);
    const clientSecret = cleanEnv(process.env.DIGIO_CLIENT_SECRET);
    const baseUrl = cleanEnv(process.env.DIGIO_BASE_URL) || "https://ext.digio.in:444";

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, message: "Missing Digio credentials" },
        { status: 500 }
      );
    }

    const digioUrl = `${baseUrl}/v2/client/document/${application.providerDocumentId}`;

    const digioResponse = await fetch(digioUrl, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const rawText = await digioResponse.text();

    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!digioResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed?.message ||
            parsed?.error_msg ||
            parsed?.error ||
            "Failed to fetch agreement status from Digio",
          raw: parsed || rawText,
        },
        { status: digioResponse.status }
      );
    }

    const normalizedStatus = normalizeAgreementStatus(
      parsed?.agreement_status || parsed?.status
    );

    const signingUrl = extractSigningUrl(parsed);
    let signedAgreementUrl =
      extractSignedAgreementUrl(parsed) || application.signedAgreementUrl || null;

    let auditTrailUrl = application.auditTrailUrl || null;

    if (normalizedStatus === "completed") {
      try {
        const signedStoragePath = `agreements/${dealerId}/signed-agreement.pdf`;

        // First preference: use URL from Digio status response
        const extractedSignedUrl = extractSignedAgreementUrl(parsed);

        if (extractedSignedUrl && !application.signedAgreementStoragePath) {
          const publicUrl = await uploadFileToSupabase(
            extractedSignedUrl,
            signedStoragePath
          );

          signedAgreementUrl = publicUrl;

          await db
            .update(dealerOnboardingApplications)
            .set({
              signedAgreementStoragePath: signedStoragePath,
              signedAgreementUrl: publicUrl,
            })
            .where(eq(dealerOnboardingApplications.id, dealerId));
        } else if (!application.signedAgreementStoragePath) {
          // Fallback: try Digio direct download only if no signed URL available
          const directDownloadUrl = `${baseUrl}/v2/client/document/download?document_id=${application.providerDocumentId}`;

          console.log("[REFRESH AGREEMENT] trying Digio direct PDF download:", directDownloadUrl);

          const directPdfRes = await fetch(directDownloadUrl, {
            method: "GET",
            headers: {
              Authorization: basicAuthHeader(clientId, clientSecret),
              Accept: "application/pdf",
            },
          });

          if (directPdfRes.ok) {
            const buffer = await directPdfRes.arrayBuffer();

            const { error } = await supabase.storage
              .from("dealer-documents")
              .upload(signedStoragePath, buffer, {
                contentType: "application/pdf",
                upsert: true,
              });

            if (!error) {
              const { data } = supabase.storage
                .from("dealer-documents")
                .getPublicUrl(signedStoragePath);

              signedAgreementUrl = data.publicUrl;

              await db
                .update(dealerOnboardingApplications)
                .set({
                  signedAgreementStoragePath: signedStoragePath,
                  signedAgreementUrl: signedAgreementUrl,
                })
                .where(eq(dealerOnboardingApplications.id, dealerId));
            } else {
              console.error("[REFRESH AGREEMENT] Supabase upload failed:", error.message);
            }
          } else {
            const errText = await directPdfRes.text();
            console.error("[REFRESH AGREEMENT] Digio direct download failed:", directPdfRes.status, errText);
          }
        }

        // Audit trail
        if (!application.auditTrailStoragePath) {
          const auditTrailDigioUrl = `${baseUrl}/v2/client/document/${application.providerDocumentId}/audit_trail`;
          const auditPath = `agreements/${dealerId}/audit-trail.pdf`;

          const publicUrl = await uploadFileToSupabase(auditTrailDigioUrl, auditPath);

          auditTrailUrl = publicUrl;

          await db
            .update(dealerOnboardingApplications)
            .set({
              auditTrailStoragePath: auditPath,
              auditTrailUrl: publicUrl,
            })
            .where(eq(dealerOnboardingApplications.id, dealerId));
        }
      } catch (err) {
        console.error("[REFRESH AGREEMENT] file upload error:", err);
      }
    }
    await db
      .update(dealerOnboardingApplications)
      .set({
        agreementStatus: normalizedStatus,
        providerSigningUrl: signingUrl,
        signedAgreementUrl,
        auditTrailUrl,
        providerRawResponse: parsed || {},
        completionStatus: normalizedStatus === "completed" ? "completed" : "pending",
        reviewStatus:
          normalizedStatus === "completed"
            ? "agreement_completed"
            : "agreement_in_progress",
        signedAt:
          normalizedStatus === "completed"
            ? new Date(extractSignedAt(parsed) || new Date())
            : application.signedAt || null,
        lastActionTimestamp: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dealerOnboardingApplications.id, dealerId));

    return NextResponse.json({
      success: true,
      agreementStatus: normalizedStatus,
      signedAgreementUrl,
      auditTrailUrl,
    });
  } catch (error: any) {
    console.error("REFRESH AGREEMENT ERROR:", error);

    return NextResponse.json(
      { success: false, message: error?.message || "Failed to refresh agreement status" },
      { status: 500 }
    );
  }
}