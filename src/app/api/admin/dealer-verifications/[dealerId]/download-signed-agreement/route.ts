export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};

function cleanEnv(value?: string) {
  return value?.trim().replace(/^[\"']|[\"']$/g, "");
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
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
        { success: false, message: "Application not found" },
        { status: 404 }
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

    let pdfBuffer: ArrayBuffer | null = null;

    // 1. First try from Supabase storage path
    if (application.signedAgreementStoragePath) {
      console.log(
        "[DOWNLOAD SIGNED AGREEMENT] Trying Supabase path:",
        application.signedAgreementStoragePath
      );

      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(application.signedAgreementStoragePath);

      if (!error && data) {
        pdfBuffer = await data.arrayBuffer();
      } else {
        console.error(
          "[DOWNLOAD SIGNED AGREEMENT] Supabase download error:",
          error?.message
        );
      }
    }

    // 2. Fallback to signedAgreementUrl if present
    if (!pdfBuffer && application.signedAgreementUrl) {
      console.log(
        "[DOWNLOAD SIGNED AGREEMENT] Trying signedAgreementUrl:",
        application.signedAgreementUrl
      );

      const fileRes = await fetch(application.signedAgreementUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (fileRes.ok) {
        pdfBuffer = await fileRes.arrayBuffer();
      } else {
        console.error(
          "[DOWNLOAD SIGNED AGREEMENT] signedAgreementUrl fetch failed:",
          fileRes.status,
          fileRes.statusText
        );
      }
    }

    // 3. Final fallback to Digio
    if (!pdfBuffer) {
      if (!application.providerDocumentId) {
        return NextResponse.json(
          { success: false, message: "Signed agreement not available" },
          { status: 400 }
        );
      }

      const clientId = cleanEnv(process.env.DIGIO_CLIENT_ID);
      const clientSecret = cleanEnv(process.env.DIGIO_CLIENT_SECRET);
      const baseUrl =
        cleanEnv(process.env.DIGIO_BASE_URL) || "https://ext.digio.in:444";

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { success: false, message: "Missing Digio credentials" },
          { status: 500 }
        );
      }

      const downloadUrl = `${baseUrl}/v2/client/document/download?document_id=${application.providerDocumentId}`;

      console.log("[DOWNLOAD SIGNED AGREEMENT] Fallback Digio URL:", downloadUrl);

      const digioResponse = await fetch(downloadUrl, {
        method: "GET",
        headers: {
          Authorization: basicAuthHeader(clientId, clientSecret),
          Accept: "application/pdf",
        },
        cache: "no-store",
      });

      if (!digioResponse.ok) {
        const errorText = await digioResponse.text();
        console.error(
          "[DOWNLOAD SIGNED AGREEMENT] Digio download failed:",
          digioResponse.status,
          errorText
        );

        return NextResponse.json(
          {
            success: false,
            message: "Failed to download signed agreement from Digio",
            raw: errorText,
          },
          { status: digioResponse.status }
        );
      }

      pdfBuffer = await digioResponse.arrayBuffer();

      // Save to Supabase for future downloads
      const filePath =
        application.signedAgreementStoragePath ||
        `agreements/${dealerId}/signed-agreement.pdf`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(filePath);

        const signedAgreementUrl = publicUrlData?.publicUrl;

        await db
          .update(dealerOnboardingApplications)
          .set({
            signedAgreementStoragePath: filePath,
            signedAgreementUrl: signedAgreementUrl || application.signedAgreementUrl,
            updatedAt: new Date(),
          })
          .where(eq(dealerOnboardingApplications.id, dealerId));
      } else {
        console.error(
          "[DOWNLOAD SIGNED AGREEMENT] Supabase upload failed:",
          uploadError.message
        );
      }
    }

    if (!pdfBuffer) {
      return NextResponse.json(
        { success: false, message: "Signed agreement PDF could not be prepared" },
        { status: 500 }
      );
    }

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="signed-agreement-${dealerId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("DOWNLOAD SIGNED AGREEMENT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Download failed",
      },
      { status: 500 }
    );
  }
}