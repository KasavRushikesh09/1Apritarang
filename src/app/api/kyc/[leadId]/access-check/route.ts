export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth-utils";

type RouteContext = {
  params: Promise<{ leadId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  try {
    await requireRole(["dealer"]);

    const { leadId } = await context.params;

    if (!leadId) {
      return NextResponse.json(
        { success: false, message: "Lead id missing" },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const lead = rows[0];

    if (!lead) {
      return NextResponse.json(
        { success: false, message: "Lead not found" },
        { status: 404 }
      );
    }

    const interestLevel = (lead.interest_level || "").toLowerCase().trim();
    const paymentMethod = (lead.payment_method || "").toLowerCase().trim();

    // Access rule: lead exists AND hot interest AND payment method is not cash
    const canAccess =
      !!lead.id &&
      interestLevel === "hot" &&
      paymentMethod !== "cash";

    return NextResponse.json({
      success: true,
      data: {
        leadId,
        canAccess,
        reason: canAccess
          ? null
          : "Step 2 allowed only for hot leads with non-cash payment method",
      },
    });
  } catch (error) {
    console.error("KYC access-check error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to check KYC access" },
      { status: 500 }
    );
  }
}
