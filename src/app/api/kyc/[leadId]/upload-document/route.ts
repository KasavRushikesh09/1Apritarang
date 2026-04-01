export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kycDocuments, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth-utils";
import { uploadFileToStorage } from "@/lib/storage"; // your storage helper

type RouteContext = {
  params: { leadId: string };
};

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireRole(["dealer"]);
    const { leadId } = params;

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const docType = String(formData.get("documentType") || formData.get("docType"));

    if (!file || !docType) {
      return NextResponse.json(
        { success: false, error: { message: "File and documentType are required" } },
        { status: 400 }
      );
    }

    // ---------------------------
    // Upload file to storage
    // ---------------------------
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadResult = await uploadFileToStorage({
      fileBuffer: buffer,
      fileName: file.name,
      folder: `kyc/${leadId}`,
    });

    const fileUrl = uploadResult.url;

    // ---------------------------
    // Upsert document row
    // ---------------------------
    const existingRows = await db
      .select()
      .from(kycDocuments)
      .where(eq(kycDocuments.lead_id, leadId));

    const existingDoc = existingRows.find((d) => d.doc_type === docType);

    const now = new Date();

    if (existingDoc) {
      await db
        .update(kycDocuments)
        .set({
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          verification_status: "pending",
          failed_reason: null,
          uploaded_at: now,
          updated_at: now,
        })
        .where(eq(kycDocuments.id, existingDoc.id));
    } else {
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const seq = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0");

      const docId = `KYCDOC-${dateStr}-${seq}`;

      await db.insert(kycDocuments).values({
        id: docId,
        lead_id: leadId,
        doc_type: docType,
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        verification_status: "pending",
        uploaded_at: now,
        updated_at: now,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Document uploaded successfully",
      fileUrl,
    });
  } catch (error) {
    console.error("[Upload Document] Error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to upload document";

    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}
