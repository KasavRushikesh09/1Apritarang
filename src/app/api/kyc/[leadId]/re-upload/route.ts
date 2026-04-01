import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { kycDocuments, kycVerifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const verificationType = formData.get('verificationType') as string;

        if (!file || !verificationType) {
            return NextResponse.json({ success: false, error: { message: 'File and verificationType required' } }, { status: 400 });
        }

        // Upload new file
        const supabase = await createClient();
        const fileName = `kyc/${leadId}/${verificationType}_reupload_${Date.now()}.${file.name.split('.').pop()}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, buffer, { contentType: file.type, upsert: true });

        if (uploadError) {
            return NextResponse.json({ success: false, error: { message: 'Upload failed' } }, { status: 500 });
        }

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);

        // Update document record
        const docTypeMap: Record<string, string> = {
            aadhaar: 'aadhaar_front',
            pan: 'pan_card',
            bank: 'bank_statement',
            address: 'address_proof',
            rc: 'rc_copy',
        };

        const docType = docTypeMap[verificationType] || verificationType;
        const now = new Date();

        // Update document
        await db.update(kycDocuments)
            .set({
                file_url: urlData.publicUrl,
                verification_status: 'pending',
                failed_reason: null,
                updated_at: now,
            })
            .where(and(
                eq(kycDocuments.lead_id, leadId),
                eq(kycDocuments.doc_type, docType)
            ));

        // Reset verification status
        await db.update(kycVerifications)
            .set({
                status: 'awaiting_action',
                failed_reason: null,
                updated_at: now,
            })
            .where(and(
                eq(kycVerifications.lead_id, leadId),
                eq(kycVerifications.verification_type, verificationType)
            ));

        // TODO: Re-trigger specific verification API

        return NextResponse.json({ success: true, newStatus: 'awaiting_action' });
    } catch (error) {
        return NextResponse.json({ success: false, error: { message: 'Server error' } }, { status: 500 });
    }
}
