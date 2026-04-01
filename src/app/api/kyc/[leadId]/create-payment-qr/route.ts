import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leads, facilitationPayments, couponCodes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { createPaymentQr, calculateDiscount } from '@/lib/razorpay';

const BASE_FEE = Number(process.env.FACILITATION_FEE_BASE_AMOUNT) || 1500;

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { coupon_code, coupon_id } = body;

        // Verify lead exists and is finance
        const leadRows = await db.select({
            id: leads.id,
            payment_method: leads.payment_method,
            full_name: leads.full_name,
        }).from(leads).where(eq(leads.id, leadId)).limit(1);

        if (!leadRows.length) {
            return NextResponse.json({ success: false, error: { message: 'Lead not found' } }, { status: 404 });
        }

        const lead = leadRows[0];
        const isFinance = ['finance', 'other_finance', 'dealer_finance'].includes(lead.payment_method || '');
        if (!isFinance) {
            return NextResponse.json({
                success: false,
                error: { message: 'Facilitation fee is only for finance payment methods' },
            }, { status: 400 });
        }

        // Calculate fee with optional coupon
        let discountAmount = 0;
        let discountType: string | null = null;
        let discountValue: number | null = null;
        let validatedCouponId: string | null = null;
        let validatedCouponCode: string | null = null;

        if (coupon_code && coupon_id) {
            const coupons = await db.select().from(couponCodes)
                .where(and(eq(couponCodes.id, coupon_id), eq(couponCodes.status, 'available')))
                .limit(1);

            if (coupons.length) {
                const coupon = coupons[0];
                discountType = coupon.discount_type;
                discountValue = coupon.discount_value ? Number(coupon.discount_value) : null;
                discountAmount = calculateDiscount(
                    BASE_FEE,
                    discountType,
                    discountValue,
                    coupon.max_discount_cap ? Number(coupon.max_discount_cap) : null
                );
                validatedCouponId = coupon.id;
                validatedCouponCode = coupon.code;

                // Mark coupon as validated
                await db.update(couponCodes)
                    .set({ status: 'validated', validated_at: new Date(), used_by_lead_id: leadId, used_by: user.id })
                    .where(eq(couponCodes.id, coupon.id));
            }
        }

        const finalAmount = BASE_FEE - discountAmount;

        // Create Razorpay QR
        const qr = await createPaymentQr({
            amount: finalAmount,
            leadId,
            customerName: lead.full_name || 'Customer',
            description: `Facilitation Fee - ${leadId}`,
        });

        // Generate payment record ID
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const paymentId = `FP-${dateStr}-${seq}`;

        // Insert facilitation payment record
        await db.insert(facilitationPayments).values({
            id: paymentId,
            lead_id: leadId,
            payment_method: lead.payment_method,
            facilitation_fee_base_amount: String(BASE_FEE),
            coupon_code: validatedCouponCode,
            coupon_id: validatedCouponId,
            coupon_discount_type: discountType,
            coupon_discount_value: discountValue ? String(discountValue) : null,
            coupon_discount_amount: String(discountAmount),
            facilitation_fee_final_amount: String(finalAmount),
            razorpay_qr_id: qr.id,
            razorpay_qr_status: qr.status,
            razorpay_qr_image_url: qr.image_url,
            razorpay_qr_short_url: qr.short_url,
            razorpay_qr_expires_at: new Date(qr.close_by * 1000),
            facilitation_fee_status: 'QR_GENERATED',
            created_by: user.id,
        });

        return NextResponse.json({
            success: true,
            data: {
                payment_id: paymentId,
                qr_id: qr.id,
                qr_image_url: qr.image_url,
                qr_short_url: qr.short_url,
                qr_status: qr.status,
                expires_at: new Date(qr.close_by * 1000).toISOString(),
                base_amount: BASE_FEE,
                discount_amount: discountAmount,
                final_amount: finalAmount,
                coupon_code: validatedCouponCode,
            },
        });
    } catch (error) {
        console.error('[Create Payment QR] Error:', error);
        const message = error instanceof Error ? error.message : 'Server error';
        return NextResponse.json({ success: false, error: { message } }, { status: 500 });
    }
}
