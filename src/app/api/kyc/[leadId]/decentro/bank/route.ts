import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { kycVerifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyBankAccount } from '@/lib/decentro';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { leadId } = params;
        const { account_number, ifsc, name, perform_name_match, validation_type } = await req.json();

        if (!account_number || !ifsc) {
            return NextResponse.json({ success: false, error: 'account_number and ifsc are required' }, { status: 400 });
        }

        const decentroRes = await verifyBankAccount({
            account_number,
            ifsc: ifsc.toUpperCase().trim(),
            name,
            perform_name_match,
            validation_type,
        });

        const success = decentroRes.responseStatus === 'SUCCESS';
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

        const existing = await db.select({ id: kycVerifications.id })
            .from(kycVerifications)
            .where(and(eq(kycVerifications.lead_id, leadId), eq(kycVerifications.verification_type, 'bank')))
            .limit(1);

        const verData = {
            status: success ? 'success' as const : 'failed' as const,
            api_provider: 'decentro',
            api_request: { account_number, ifsc, perform_name_match, validation_type },
            api_response: decentroRes,
            failed_reason: success ? null : (decentroRes.message || 'Bank verification failed'),
            completed_at: now,
            updated_at: now,
        };

        if (existing.length > 0) {
            await db.update(kycVerifications).set(verData)
                .where(and(eq(kycVerifications.lead_id, leadId), eq(kycVerifications.verification_type, 'bank')));
        } else {
            await db.insert(kycVerifications).values({
                id: `KYCVER-${dateStr}-${seq}`,
                lead_id: leadId,
                verification_type: 'bank',
                submitted_at: now,
                created_at: now,
                ...verData,
            });
        }

        return NextResponse.json({
            success,
            responseStatus: decentroRes.responseStatus,
            message: decentroRes.message,
            data: decentroRes.data || null,
        });
    } catch (error) {
        console.error('Decentro bank verify error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
