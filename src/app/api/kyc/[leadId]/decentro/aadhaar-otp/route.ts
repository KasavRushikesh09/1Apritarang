import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { kycVerifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { aadhaarGenerateOtp } from '@/lib/decentro';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { leadId } = params;
        const { aadhaar_number } = await req.json();

        if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
            return NextResponse.json({ success: false, error: 'Valid 12-digit Aadhaar number is required' }, { status: 400 });
        }

        const decentroRes = await aadhaarGenerateOtp(aadhaar_number);
        console.log('[Decentro Aadhaar OTP] Response:', JSON.stringify(decentroRes));
        const success = (decentroRes.responseStatus || decentroRes.status || '').toUpperCase() === 'SUCCESS';
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

        // Save initiating verification record with txn_id for OTP validation
        const existing = await db.select({ id: kycVerifications.id })
            .from(kycVerifications)
            .where(and(eq(kycVerifications.lead_id, leadId), eq(kycVerifications.verification_type, 'aadhaar')))
            .limit(1);

        const verData = {
            status: success ? 'awaiting_action' as const : 'failed' as const,
            api_provider: 'decentro',
            api_request: { aadhaar_number: '************' }, // masked
            api_response: decentroRes,
            failed_reason: success ? null : (decentroRes.message || 'Failed to send OTP'),
            updated_at: now,
        };

        if (existing.length > 0) {
            await db.update(kycVerifications).set(verData)
                .where(and(eq(kycVerifications.lead_id, leadId), eq(kycVerifications.verification_type, 'aadhaar')));
        } else {
            await db.insert(kycVerifications).values({
                id: `KYCVER-${dateStr}-${seq}`,
                lead_id: leadId,
                verification_type: 'aadhaar',
                submitted_at: now,
                created_at: now,
                ...verData,
            });
        }

        return NextResponse.json({
            success,
            responseStatus: decentroRes.responseStatus,
            message: decentroRes.message,
            // Return txn ID so client can pass it to the validate step
            decentroTxnId: decentroRes.decentroTxnId,
        });
    } catch (error) {
        console.error('Decentro Aadhaar OTP error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
