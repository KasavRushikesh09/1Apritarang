import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { kycVerifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { aadhaarValidateOtp } from '@/lib/decentro';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { leadId } = params;
        const { decentro_txn_id, otp } = await req.json();

        if (!decentro_txn_id || !otp) {
            return NextResponse.json({ success: false, error: 'decentro_txn_id and otp are required' }, { status: 400 });
        }

        const decentroRes = await aadhaarValidateOtp(decentro_txn_id, otp);
        const success = decentroRes.responseStatus === 'SUCCESS';
        const now = new Date();

        await db.update(kycVerifications).set({
            status: success ? 'success' : 'failed',
            api_response: decentroRes,
            failed_reason: success ? null : (decentroRes.message || 'OTP validation failed'),
            completed_at: now,
            updated_at: now,
        }).where(and(eq(kycVerifications.lead_id, leadId), eq(kycVerifications.verification_type, 'aadhaar')));

        return NextResponse.json({
            success,
            responseStatus: decentroRes.responseStatus,
            message: decentroRes.message,
            data: decentroRes.data || null,
        });
    } catch (error) {
        console.error('Decentro Aadhaar verify error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
