import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { couponCodes, leads } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { calculateDiscount } from '@/lib/razorpay';

const BASE_FEE = Number(process.env.FACILITATION_FEE_BASE_AMOUNT) || 1500;

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const { leadId } = params;
        const { couponCode } = await req.json();

        if (!couponCode) {
            return NextResponse.json({ valid: false, message: 'Coupon code is required' });
        }

        // Verify lead exists
        const leadRows = await db.select({ id: leads.id, payment_method: leads.payment_method })
            .from(leads).where(eq(leads.id, leadId)).limit(1);

        if (!leadRows.length) {
            return NextResponse.json({ valid: false, message: 'Lead not found' }, { status: 404 });
        }

        // Find coupon
        const coupons = await db.select()
            .from(couponCodes)
            .where(and(
                eq(couponCodes.code, couponCode.toUpperCase().trim()),
                eq(couponCodes.status, 'available')
            ))
            .limit(1);

        if (!coupons.length) {
            return NextResponse.json({ valid: false, message: 'Invalid or already used coupon code' });
        }

        const coupon = coupons[0];

        // Check expiry
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
            return NextResponse.json({ valid: false, message: 'Coupon has expired' });
        }

        // Check minimum amount
        const minAmount = coupon.min_amount ? Number(coupon.min_amount) : 0;
        if (minAmount > BASE_FEE) {
            return NextResponse.json({ valid: false, message: `Minimum order amount is ₹${minAmount}` });
        }

        // Calculate discount
        const discountAmount = calculateDiscount(
            BASE_FEE,
            coupon.discount_type,
            coupon.discount_value ? Number(coupon.discount_value) : null,
            coupon.max_discount_cap ? Number(coupon.max_discount_cap) : null
        );

        const finalAmount = BASE_FEE - discountAmount;

        return NextResponse.json({
            valid: true,
            coupon_id: coupon.id,
            coupon_code: coupon.code,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value ? Number(coupon.discount_value) : 0,
            discount_amount: discountAmount,
            base_amount: BASE_FEE,
            final_amount: finalAmount,
            message: discountAmount > 0
                ? `Coupon applied! You save ₹${discountAmount}`
                : 'Coupon validated successfully',
        });
    } catch (error) {
        console.error('[Validate Coupon] Error:', error);
        return NextResponse.json({ valid: false, message: 'Server error' }, { status: 500 });
    }
}
