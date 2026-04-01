import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads, consentRecords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ success: false, error: { message: 'File is required' } }, { status: 400 });
        }

        if (file.type !== 'application/pdf') {
            return NextResponse.json({ success: false, error: { message: 'Only PDF files are accepted' } }, { status: 400 });
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: { message: 'File must be less than 10MB' } }, { status: 400 });
        }

        // Upload to Supabase Storage
        const supabase = await createClient();
        const fileName = `kyc/${leadId}/signed_consent_${Date.now()}.pdf`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true });

        if (uploadError) {
            return NextResponse.json({ success: false, error: { message: 'Upload failed' } }, { status: 500 });
        }

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName);

        // Update consent record
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

        await db.insert(consentRecords).values({
            id: `CONSENT-${dateStr}-${seq}`,
            lead_id: leadId,
            consent_for: 'primary',
            consent_type: 'manual',
            consent_status: 'manual_uploaded',
            signed_consent_url: urlData.publicUrl,
            signed_at: now,
            created_at: now,
            updated_at: now,
        });

        // Update lead
        await db.update(leads)
            .set({ consent_status: 'manual_uploaded', updated_at: now })
            .where(eq(leads.id, leadId));

        return NextResponse.json({ success: true, fileUrl: urlData.publicUrl });
    } catch (error) {
        console.error('[Upload Signed Consent] Error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ success: false, error: { message } }, { status: 500 });
    }
}
