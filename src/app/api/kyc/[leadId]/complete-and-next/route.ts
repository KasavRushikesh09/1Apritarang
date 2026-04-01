import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads, kycDocuments, kycVerifications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const { paymentMethod } = await req.json();

        // Server-side validations
        const docs = await db.select().from(kycDocuments).where(eq(kycDocuments.lead_id, leadId));
        const verifications = await db.select().from(kycVerifications).where(eq(kycVerifications.lead_id, leadId));
        const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);

        if (!lead.length) {
            return NextResponse.json({ success: false, error: { message: 'Lead not found' } }, { status: 404 });
        }

        // Check required docs
        const requiredCount = paymentMethod === 'upfront' ? 3 : 11;
        if (docs.length < requiredCount) {
            return NextResponse.json({
                success: false,
                error: { message: 'Not all required documents uploaded' },
                missingItems: [],
            }, { status: 400 });
        }

        // Check consent
        const consentOk = ['digitally_signed', 'manual_uploaded', 'verified'].includes(lead[0].consent_status || '');
        if (!consentOk) {
            return NextResponse.json({
                success: false,
                error: { message: 'Customer consent is required' },
            }, { status: 400 });
        }

        // Check for critical verification failures
        const failedVerifications = verifications.filter(v => v.status === 'failed');

        // Calculate KYC score
        const totalRequired = requiredCount;
        const docsUploaded = docs.length;
        const verificationsPassed = verifications.filter(v => v.status === 'success').length;
        const totalVerifications = verifications.length || 1;

        const kycScore = Math.round(
            (docsUploaded / totalRequired) * 40 +
            (verificationsPassed / totalVerifications) * 40 +
            (consentOk ? 20 : 0)
        );

        const now = new Date();

        // Check if interim step is needed (additional docs or co-borrower required)
        const requiresInterim = lead[0].has_co_borrower || lead[0].has_additional_docs_required;

        if (requiresInterim) {
            await db.update(leads)
                .set({
                    kyc_status: 'completed',
                    kyc_score: kycScore,
                    kyc_completed_at: now,
                    workflow_step: 2, // Stay at 2, interim is a sub-step
                    updated_at: now,
                })
                .where(eq(leads.id, leadId));

            return NextResponse.json({
                success: true,
                requiresInterim: true,
                nextStep: 'interim',
                kycScore,
            });
        }

        // Complete KYC and advance to step 3
        await db.update(leads)
            .set({
                kyc_status: 'completed',
                kyc_score: kycScore,
                kyc_completed_at: now,
                workflow_step: 3,
                updated_at: now,
            })
            .where(eq(leads.id, leadId));

        // TODO: Trigger notifications
        // - Email to dealer: 'KYC approved for {customer_name}'
        // - SMS to customer: 'Your KYC is verified. Next: Select product.'

        return NextResponse.json({
            success: true,
            requiresInterim: false,
            nextStep: 3,
            kycScore,
            message: 'KYC completed successfully',
        });
    } catch (error) {
        console.error('[KYC Complete] Error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ success: false, error: { message } }, { status: 500 });
    }
}
