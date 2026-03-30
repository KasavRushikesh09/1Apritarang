export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: { dealerId: string };
};

function cleanEnv(value?: string) {
  return value?.trim().replace(/^[\"']|[\"']$/g, "");
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { dealerId } = context.params;

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
        { success: false, message: "Audit trail not available" },
        { status: 400 }
      );
    }

    // If already saved, return existing URL
    if (application.auditTrailUrl) {
      return NextResponse.json({
        success: true,
        auditTrailUrl: application.auditTrailUrl,
      });
    }

    const clientId = cleanEnv(process.env.DIGIO_CLIENT_ID);
    const clientSecret = cleanEnv(process.env.DIGIO_CLIENT_SECRET);
    const baseUrl =
      cleanEnv(process.env.DIGIO_BASE_URL) || "https://ext.digio.in:444";
    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, message: "Missing Digio credentials" },
        { status: 500 }
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const auditUrl = `${baseUrl}/v2/client/document/audit?document_id=${application.providerDocumentId}`;

    const digioResponse = await fetch(auditUrl, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        Accept: "application/pdf",
      },
      cache: "no-store",
    });

    if (!digioResponse.ok) {
      const errorText = await digioResponse.text();
      return NextResponse.json(
        {
          success: false,
          message: "Failed to download audit trail from Digio",
          raw: errorText,
        },
        { status: digioResponse.status }
      );
    }

    const pdfBuffer = await digioResponse.arrayBuffer();

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const bucketName = "dealer-documents";
    const filePath = `agreements/${dealerId}/audit-trail.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to upload audit trail to Supabase",
          raw: uploadError.message,
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    const auditTrailUrl = publicUrlData?.publicUrl;

    if (!auditTrailUrl) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to generate audit trail public URL",
        },
        { status: 500 }
      );
    }

    await db
      .update(dealerOnboardingApplications)
      .set({
        auditTrailUrl,
        auditTrailStoragePath: filePath,
        updatedAt: new Date(),
      })
      .where(eq(dealerOnboardingApplications.id, dealerId));

    return NextResponse.json({
      success: true,
      auditTrailUrl,
    });
  } catch (error: any) {
    console.error("FETCH AUDIT TRAIL ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to fetch audit trail",
      },
      { status: 500 }
    );
  }
}