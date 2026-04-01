import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads, consentRecords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;

        const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
        if (!lead.length) {
            return NextResponse.json({ success: false, error: { message: 'Lead not found' } }, { status: 404 });
        }

        const l = lead[0];

        // TODO: Generate actual PDF using pdfkit or puppeteer
        // For now, return a placeholder URL
        // The PDF should include:
        // - Company logo, Consent form title
        // - Pre-filled customer details (name, address, product details, loan terms)
        // - Consent text for credit check, loan agreement, data sharing
        // - Signature boxes: Customer signature, Date, Witness signature, Customer Thumb Print

        const pdfUrl = `/api/kyc/${leadId}/consent-pdf-download`;

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

        await db.insert(consentRecords).values({
            id: `CONSENT-${dateStr}-${seq}`,
            lead_id: leadId,
            consent_for: 'primary',
            consent_type: 'manual',
            consent_status: 'awaiting_signature',
            generated_pdf_url: pdfUrl,
            created_at: now,
            updated_at: now,
        });

        return NextResponse.json({
            success: true,
            pdfUrl,
            expiresIn: 3600,
        });
    } catch (error) {
        console.error('[Generate Consent PDF] Error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ success: false, error: { message } }, { status: 500 });
    }
}
