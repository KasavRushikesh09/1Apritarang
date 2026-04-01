import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const { step, data } = await req.json();

        await db.update(leads)
            .set({
                kyc_draft_data: data,
                kyc_status: 'draft',
                workflow_step: step || 2,
                updated_at: new Date(),
            })
            .where(eq(leads.id, leadId));

        return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
    } catch (error) {
        console.error('[KYC Save Draft] Error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ success: false, error: { message } }, { status: 500 });
    }
}
