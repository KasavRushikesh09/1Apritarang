export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { downloadDigioAuditTrail } from "@/lib/digio";

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};


function cleanEnv(value?: string) {
  return value?.trim().replace(/^[\"']|[\"']$/g, "");
}

export async function GET(_req: NextRequest, context: RouteContext) {
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
        { success: false, message: "Dealer application not found" },
        { status: 404 }
      );
    }

    const documentId = application.providerDocumentId || null;

    if (!documentId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Digio document ID not found. Agreement may not be created yet.",
        },
        { status: 400 }
      );
    }

    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const bucketName = "dealer-documents";
    const filePath =
      application.auditTrailStoragePath ||
      `agreements/${dealerId}/audit-trail.pdf`;

    let fileBuffer: ArrayBuffer | null = null;

    // 1. Try existing Supabase stored file first
    if (application.auditTrailStoragePath) {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(application.auditTrailStoragePath);

      if (!error && data) {
        fileBuffer = await data.arrayBuffer();
      } else {
        console.error(
          "[AUDIT TRAIL DOWNLOAD] Supabase stored file download failed:",
          error?.message
        );
      }
    }

    // 2. If not already stored, download from Digio and upload to Supabase
    if (!fileBuffer) {
      const { buffer, contentType } = await downloadDigioAuditTrail(documentId);

      fileBuffer =
        buffer instanceof ArrayBuffer ? buffer : await new Response(buffer).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, fileBuffer, {
          contentType: contentType || "application/pdf",
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
    }

    if (!fileBuffer) {
      return NextResponse.json(
        {
          success: false,
          message: "Audit trail file could not be prepared",
        },
        { status: 500 }
      );
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="audit-trail-${dealerId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[DIGIO_AUDIT_TRAIL_DOWNLOAD_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to download audit trail",
      },
      { status: 500 }
    );
  }
}