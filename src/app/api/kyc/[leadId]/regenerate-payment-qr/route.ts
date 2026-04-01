import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads, facilitationPayments } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { createPaymentQr, closeQrCode } from '@/lib/razorpay';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        // Get lead info
        const leadRows = await db.select({ id: leads.id, full_name: leads.full_name })
            .from(leads).where(eq(leads.id, leadId)).limit(1);

        if (!leadRows.length) {
            return NextResponse.json({ success: false, error: { message: 'Lead not found' } }, { status: 404 });
        }

        // Get existing payment record
        const existing = await db.select()
            .from(facilitationPayments)
            .where(eq(facilitationPayments.lead_id, leadId))
            .orderBy(desc(facilitationPayments.created_at))
            .limit(1);

        if (!existing.length) {
            return NextResponse.json({
                success: false,
                error: { message: 'No existing payment record. Use create-payment-qr first.' },
            }, { status: 400 });
        }

        const payment = existing[0];

        if (payment.facilitation_fee_status === 'PAID') {
            return NextResponse.json({
                success: false,
                error: { message: 'Payment already completed' },
            }, { status: 400 });
        }

        // Close old QR if exists
        if (payment.razorpay_qr_id) {
            try { await closeQrCode(payment.razorpay_qr_id); } catch { /* already closed/expired */ }
        }

        const finalAmount = Number(payment.facilitation_fee_final_amount);

        // Create new QR
        const qr = await createPaymentQr({
            amount: finalAmount,
            leadId,
            customerName: leadRows[0].full_name || 'Customer',
            description: `Facilitation Fee - ${leadId} (regenerated)`,
        });

        // Update payment record with new QR
        await db.update(facilitationPayments)
            .set({
                razorpay_qr_id: qr.id,
                razorpay_qr_status: qr.status,
                razorpay_qr_image_url: qr.image_url,
                razorpay_qr_short_url: qr.short_url,
                razorpay_qr_expires_at: new Date(qr.close_by * 1000),
                facilitation_fee_status: 'QR_GENERATED',
                updated_at: new Date(),
            })
            .where(eq(facilitationPayments.id, payment.id));

        return NextResponse.json({
            success: true,
            data: {
                payment_id: payment.id,
                qr_id: qr.id,
                qr_image_url: qr.image_url,
                qr_short_url: qr.short_url,
                qr_status: qr.status,
                expires_at: new Date(qr.close_by * 1000).toISOString(),
                final_amount: finalAmount,
            },
        });
    } catch (error) {
        console.error('[Regenerate QR] Error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ success: false, error: { message } }, { status: 500 });
    }
}
