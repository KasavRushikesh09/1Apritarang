import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads, facilitationPayments } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

// POST - Record manual payment (UTR / screenshot)
export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { utr_number, screenshot_url } = body;

        // Get existing payment record
        const existing = await db.select()
            .from(facilitationPayments)
            .where(eq(facilitationPayments.lead_id, leadId))
            .orderBy(desc(facilitationPayments.created_at))
            .limit(1);

        if (!existing.length) {
            return NextResponse.json({
                success: false,
                error: { message: 'No payment record found. Generate QR first.' },
            }, { status: 400 });
        }

        const payment = existing[0];

        if (payment.facilitation_fee_status === 'PAID') {
            return NextResponse.json({
                success: true,
                data: payment,
                message: 'Payment already recorded',
            });
        }

        // Update with manual payment info
        await db.update(facilitationPayments)
            .set({
                utr_number_manual: utr_number || null,
                payment_screenshot_url: screenshot_url || null,
                facilitation_fee_status: 'PAYMENT_PENDING_CONFIRMATION',
                updated_at: new Date(),
            })
            .where(eq(facilitationPayments.id, payment.id));

        return NextResponse.json({
            success: true,
            data: {
                payment_id: payment.id,
                facilitation_fee_status: 'PAYMENT_PENDING_CONFIRMATION',
                utr_number,
            },
        });
    } catch (error) {
        console.error('[Facilitation Payment] Error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ success: false, error: { message } }, { status: 500 });
    }
}

// GET - Check facilitation fee status
export async function GET(_req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;

        const rows = await db.select()
            .from(facilitationPayments)
            .where(eq(facilitationPayments.lead_id, leadId))
            .orderBy(desc(facilitationPayments.created_at))
            .limit(1);

        const payment = rows[0] || null;

        return NextResponse.json({
            success: true,
            data: payment,
            fee_paid: payment?.facilitation_fee_status === 'PAID',
            status: payment?.facilitation_fee_status || 'UNPAID',
        });
    } catch (error) {
        console.error('[Facilitation Payment Check] Error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
