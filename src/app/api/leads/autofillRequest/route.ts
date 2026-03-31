export const runtime = "nodejs";

import { db } from '@/lib/db';
import { auditLogs, kycDocuments } from '@/lib/db/schema';
import { successResponse, errorResponse, withErrorHandler } from '@/lib/api-utils';
import { requireRole } from '@/lib/auth-utils';
import { extractTextFromImageBuffer } from '@/lib/ocr/tesseractOcr';
import { parseAadhaarText } from '@/lib/ocr/aadhaarParser';
import { createClient } from '@/lib/supabase/server';

export const POST = withErrorHandler(async (req: Request) => {
    const user = await requireRole(['dealer']);

    let formData;
    try {
        formData = await req.formData();
    } catch (e) {
        return errorResponse("Multipart form-data expected", 400);
    }

    const aadhaarFront = formData.get('aadhaarFront') as File | null;
    const aadhaarBack = formData.get('aadhaarBack') as File | null;
    const leadId = (formData.get('leadId') as string | null) || null;
    const idType = (formData.get('idType') as string | null) || 'aadhaar';
    const idValue = (formData.get('idValue') as string | null) || null;

    if (!aadhaarFront || !aadhaarBack) {
        return errorResponse("Both Aadhaar Front and Back images are required", 400);
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    // PDF validation already handles size, but check for files here.
    if (aadhaarFront.size > MAX_SIZE || aadhaarBack.size > MAX_SIZE) {
        return errorResponse("File size exceeds 5MB limit", 400);
    }

    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!ALLOWED_TYPES.includes(aadhaarFront.type) || !ALLOWED_TYPES.includes(aadhaarBack.type)) {
        return errorResponse("Invalid file type. Allowed: PNG, JPEG, JPG, PDF", 400);
    }

    const requestId = `OCR-${Date.now()}`;

    // Optional: persist uploads to storage + DB when a leadId is present
    const supabase = await createClient();
    const uploadDoc = async (file: File, docType: 'aadhaar_front' | 'aadhaar_back') => {
        if (!leadId) return null;
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop() || 'bin';
        const fileName = `autofill/${leadId}/${docType}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, buffer, { contentType: file.type, upsert: true });
        if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const docId = `KYCDOC-${dateStr}-${seq}`;

        await db.insert(kycDocuments).values({
            id: docId,
            lead_id: leadId,
            doc_type: docType,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
            verification_status: 'pending',
            uploaded_at: now,
            updated_at: now,
        }).onConflictDoNothing();

        return urlData.publicUrl;
    };

    // 1. Initial Audit Log
    try {
        await db.insert(auditLogs).values({
            id: `AUDIT-REQ-${requestId}`,
            entity_type: 'system',
            entity_id: requestId,
            action: 'OCR_REQUESTED',
            changes: { front: aadhaarFront.name, back: aadhaarBack.name },
            performed_by: user.id,
            timestamp: new Date()
        });
    } catch (logErr) {
        console.error("Initial OCR log failed:", logErr);
    }

    try {
        // 2. Persist files if leadId present (non-blocking for OCR)
        let frontUrl: string | null = null;
        let backUrl: string | null = null;
        try {
            frontUrl = await uploadDoc(aadhaarFront, 'aadhaar_front');
            backUrl = await uploadDoc(aadhaarBack, 'aadhaar_back');
        } catch (uploadErr) {
            console.error("Autofill upload failed:", uploadErr);
            // continue with OCR even if upload fails
        }

        // 3. Process Images (Sequential to avoid worker contention)
        const frontBuffer = Buffer.from(await aadhaarFront.arrayBuffer());
        const backBuffer = Buffer.from(await aadhaarBack.arrayBuffer());

        const frontText = await extractTextFromImageBuffer(frontBuffer);
        const backText = await extractTextFromImageBuffer(backBuffer);

        const combinedText = `${frontText}\n${backText}`.trim();

        // 4. Length / Quality Check
        if (combinedText.length < 20) {
            try {
                await db.insert(auditLogs).values({
                    id: `AUDIT-FAIL-LOW-${requestId}`,
                    entity_type: 'system',
                    entity_id: requestId,
                    action: 'OCR_FAILED',
                    changes: { reason: "Could not read enough text from documents" },
                    performed_by: user.id,
                    timestamp: new Date()
                });
            } catch (l) { }
            return errorResponse("Could not read document. Please upload a clearer image.", 422);
        }

        const parsedData = parseAadhaarText(combinedText);

        // 5. Success Audit Log
        try {
            await db.insert(auditLogs).values({
                id: `AUDIT-OK-${requestId}`,
                entity_type: 'system',
                entity_id: requestId,
                action: 'OCR_SUCCESS',
                changes: {
                    fields_found: Object.keys(parsedData).filter(k => !!(parsedData as any)[k])
                },
                performed_by: user.id,
                timestamp: new Date()
            });
        } catch (logErr) {
            console.error("Success OCR log failed:", logErr);
        }

        // Return mapped keys for direct form compatibility
        return successResponse({
            requestId,
            frontUrl,
            backUrl,
            fullName: parsedData.fullName ?? "",
            fatherName: parsedData.fatherName ?? "",
            dob: parsedData.dob ?? "",
            address: parsedData.address ?? "",
            phone: parsedData.phone ?? "",
            full_name: parsedData.fullName ?? "",
            father_or_husband_name: parsedData.fatherName ?? "",
            current_address: parsedData.address ?? "",
            autoFilled: true,
            idType,
            idValue
        });

    } catch (err: any) {
        console.error("OCR Final Error:", err?.message, err?.stack);

        // 6. Failure Audit Log (Always log failure on exception)
        try {
            await db.insert(auditLogs).values({
                id: `AUDIT-ERR-${requestId}`,
                entity_type: 'system',
                entity_id: requestId,
                action: 'OCR_FAILED',
                changes: { reason: "Processing failed or service error" },
                performed_by: user.id,
                timestamp: new Date()
            });
        } catch (logErr) {
            console.error("Failure OCR log failed:", logErr);
        }

        return errorResponse("OCR failed to process images. Please enter details manually.", 500);
    }
});
