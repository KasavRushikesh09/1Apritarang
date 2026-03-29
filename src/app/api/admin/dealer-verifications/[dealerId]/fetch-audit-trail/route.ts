import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { insertAgreementEvent } from "@/lib/agreement/tracking";

type Context = {
  params: Promise<{ dealerId: string }>;
};

function cleanEnv(value?: string) {
  return value?.trim().replace(/^[\"']|[\"']$/g, "");
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function buildAuditTrailEndpoints(
  baseUrl: string,
  ids: {
    documentId?: string | null;
    requestId?: string | null;
  }
) {
  const safeBase = baseUrl.replace(/\/+$/, "");
  const envTemplate = cleanEnv(process.env.DIGIO_AUDIT_TRAIL_PATH_TEMPLATE);

  const documentId = ids.documentId ? encodeURIComponent(ids.documentId) : null;
  const requestId = ids.requestId ? encodeURIComponent(ids.requestId) : null;

  const endpoints: string[] = [];

  if (envTemplate && documentId) {
    const envPath = envTemplate.replace("{documentId}", documentId);
    endpoints.push(
      `${safeBase}${envPath.startsWith("/") ? "" : "/"}${envPath}`
    );
  }

  if (documentId) {
    endpoints.push(
      `${safeBase}/v2/client/document/${documentId}/audit-trail/download`
    );
    endpoints.push(
      `${safeBase}/v2/client/document/download_audit_trail?document_id=${documentId}`
    );
    endpoints.push(
      `${safeBase}/v2/client/document/audit-trail/download?document_id=${documentId}`
    );
    endpoints.push(
      `${safeBase}/v2/client/document/download/audit-trail?document_id=${documentId}`
    );
  }

  if (requestId) {
    endpoints.push(
      `${safeBase}/v2/client/document/download_audit_trail?request_id=${requestId}`
    );
    endpoints.push(
      `${safeBase}/v2/client/document/audit-trail/download?request_id=${requestId}`
    );
    endpoints.push(
      `${safeBase}/v2/client/document/download/audit-trail?request_id=${requestId}`
    );
    endpoints.push(
      `${safeBase}/v2/client/request/${requestId}/audit-trail/download`
    );
  }

  return [...new Set(endpoints)];
}

async function getApplicationOr404(dealerId: string) {
  const rows = await db
    .select()
    .from(dealerOnboardingApplications)
    .where(eq(dealerOnboardingApplications.id, dealerId))
    .limit(1);

  return rows[0] || null;
}

async function tryFetchDigioAuditTrail(ids: {
  documentId?: string | null;
  requestId?: string | null;
}) {
  const clientId = cleanEnv(process.env.DIGIO_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.DIGIO_CLIENT_SECRET);
  const baseUrl =
    cleanEnv(process.env.DIGIO_BASE_URL) || "https://ext.digio.in:444";

  if (!clientId || !clientSecret) {
    return {
      success: false as const,
      message:
        "Missing Digio configuration. Set DIGIO_CLIENT_ID and DIGIO_CLIENT_SECRET.",
      lastEndpoint: null,
      lastBody: null,
      response: null,
    };
  }

  const endpoints = buildAuditTrailEndpoints(baseUrl, ids);

  console.log("[DIGIO AUDIT TRAIL] documentId:", ids.documentId);
  console.log("[DIGIO AUDIT TRAIL] requestId:", ids.requestId);
  console.log("[DIGIO AUDIT TRAIL] endpoints:", endpoints);

  let lastBody: any = null;
  let lastEndpoint: string | null = null;

  for (const endpoint of endpoints) {
    console.log("[DIGIO AUDIT TRAIL] Trying endpoint:", endpoint);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        Accept: "application/pdf, application/json, */*",
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";

    if (response.ok) {
      console.log("[DIGIO AUDIT TRAIL] Success endpoint:", endpoint);
      return {
        success: true as const,
        response,
        endpoint,
      };
    }

    let raw: any = null;
    try {
      raw = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
    } catch {
      raw = null;
    }

    console.error("[DIGIO AUDIT TRAIL] Failed endpoint:", endpoint);
    console.error("[DIGIO AUDIT TRAIL] Status:", response.status);
    console.error("[DIGIO AUDIT TRAIL] Raw:", raw);

    lastBody = raw;
    lastEndpoint = endpoint;
  }

  return {
    success: false as const,
    message:
      "Audit trail is not available through the current Digio API response or endpoint for this agreement. Please check Digio dashboard and store the audit trail manually.",
    lastEndpoint,
    lastBody,
    response: null,
  };
}

export async function POST(_req: NextRequest, context: Context) {
  try {
    const { dealerId } = await context.params;

    const application = await getApplicationOr404(dealerId);

    if (!application) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 }
      );
    }

    if (application.auditTrailUrl) {
      return NextResponse.json({
        success: true,
        message: "Audit trail already available",
        data: {
          auditTrailUrl: application.auditTrailUrl,
          source: "stored",
        },
      });
    }

    if (!application.providerDocumentId && !application.requestId) {
      return NextResponse.json(
        {
          success: false,
          message: "Both providerDocumentId and requestId are missing.",
        },
        { status: 400 }
      );
    }

    const result = await tryFetchDigioAuditTrail({
      documentId: application.providerDocumentId,
      requestId: application.requestId,
    });

    if (!result.success) {
      await insertAgreementEvent({
        applicationId: application.id,
        providerDocumentId: application.providerDocumentId || null,
        requestId: application.requestId || null,
        eventType: "audit_trail_unavailable",
        eventStatus: "unavailable",
        eventPayload: {
          reason: result.message,
          lastEndpoint: result.lastEndpoint,
          lastBody: result.lastBody,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message:
            "Audit trail is not available through Digio API for this agreement yet. Please open Digio dashboard and download it manually.",
          data: {
            auditTrailUrl: null,
            providerDocumentId: application.providerDocumentId || null,
            requestId: application.requestId || null,
            lastEndpoint: result.lastEndpoint,
            providerError: result.lastBody || null,
          },
        },
        { status: 200 }
      );
    }

    const appBaseUrl = reqBaseUrlFromEnvOrLocal();
    const internalAuditTrailUrl = `${appBaseUrl}/api/admin/dealer-verifications/${dealerId}/fetch-audit-trail?download=1`;

    await db
      .update(dealerOnboardingApplications)
      .set({
        auditTrailUrl: internalAuditTrailUrl,
        lastActionTimestamp: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dealerOnboardingApplications.id, dealerId));

    await insertAgreementEvent({
      applicationId: application.id,
      providerDocumentId: application.providerDocumentId || null,
      requestId: application.requestId || null,
      eventType: "audit_trail_fetched",
      eventStatus: "available",
      eventPayload: {
        storedAs: "internal_proxy_url",
        auditTrailUrl: internalAuditTrailUrl,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Audit trail fetched successfully",
      data: {
        auditTrailUrl: internalAuditTrailUrl,
        source: "proxy",
      },
    });
  } catch (error: any) {
    console.error("FETCH AUDIT TRAIL ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Audit trail is not available right now. Please check Digio dashboard or try again later.",
      },
      { status: 200 }
    );
  }
}

export async function GET(req: NextRequest, context: Context) {
  try {
    const { dealerId } = await context.params;
    const download = req.nextUrl.searchParams.get("download");

    const application = await getApplicationOr404(dealerId);

    if (!application) {
      return NextResponse.json(
        { success: false, message: "Application not found" },
        { status: 404 }
      );
    }

    if (!application.providerDocumentId && !application.requestId) {
      return NextResponse.json(
        {
          success: false,
          message: "Both providerDocumentId and requestId are missing.",
        },
        { status: 400 }
      );
    }

    if (download !== "1") {
      return NextResponse.json({
        success: true,
        data: {
          applicationId: application.id,
          providerDocumentId: application.providerDocumentId || null,
          requestId: application.requestId || null,
          auditTrailUrl: application.auditTrailUrl || null,
        },
      });
    }

    const result = await tryFetchDigioAuditTrail({
      documentId: application.providerDocumentId,
      requestId: application.requestId,
    });

    if (!result.success || !result.response) {
      await insertAgreementEvent({
        applicationId: application.id,
        providerDocumentId: application.providerDocumentId || null,
        requestId: application.requestId || null,
        eventType: "audit_trail_download_unavailable",
        eventStatus: "unavailable",
        eventPayload: {
          reason: result.message,
          lastEndpoint: result.lastEndpoint,
          lastBody: result.lastBody,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message:
            "Audit trail PDF could not be downloaded from Digio API. Please use Digio dashboard for this agreement.",
          data: {
            providerDocumentId: application.providerDocumentId || null,
            requestId: application.requestId || null,
            lastEndpoint: result.lastEndpoint,
            providerError: result.lastBody || null,
          },
        },
        { status: 404 }
      );
    }

    const contentType =
      result.response.headers.get("content-type") || "application/pdf";
    const arrayBuffer = await result.response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = `audit-trail-${application.providerDocumentId || application.requestId}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType.includes("pdf")
          ? "application/pdf"
          : contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("DOWNLOAD AUDIT TRAIL ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Audit trail PDF is not available right now. Please use Digio dashboard.",
      },
      { status: 404 }
    );
  }
}

function reqBaseUrlFromEnvOrLocal() {
  return (
    cleanEnv(process.env.APP_URL) ||
    cleanEnv(process.env.NEXT_PUBLIC_APP_URL) ||
    "http://localhost:3000"
  );
}