export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { consentRecords, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth-utils";

type RouteContext = {
  params: { leadId: string };
};

const ALLOWED_CHANNELS = new Set(["sms", "whatsapp"]);

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireRole(["dealer"]);
    const { leadId } = params;
    const body = await req.json().catch(() => ({}));
    const channel = String(body?.channel || "").toLowerCase();

    if (!ALLOWED_CHANNELS.has(channel)) {
      return NextResponse.json(
        { success: false, error: { message: "Channel must be sms or whatsapp" } },
        { status: 400 }
      );
    }

    // ---------------------------
    // Check lead
    // ---------------------------
    const leadRows = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const lead = leadRows[0];

    if (!lead) {
      return NextResponse.json(
        { success: false, error: { message: "Lead not found" } },
        { status: 404 }
      );
    }

    const paymentMethod = String(lead.payment_method || "").toLowerCase();
    const interestLevel = String(lead.interest_level || "").toLowerCase();

    const canSendConsent =
      interestLevel === "hot" &&
      paymentMethod !== "cash" &&
      paymentMethod !== "upfront";

    if (!canSendConsent) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Consent allowed only for hot leads with finance payment method",
          },
        },
        { status: 400 }
      );
    }

    const customerPhone = lead.phone || lead.owner_contact;

    if (!customerPhone) {
      return NextResponse.json(
        { success: false, error: { message: "Customer phone not available" } },
        { status: 400 }
      );
    }

    // ---------------------------
    // Generate Consent Link
    // ---------------------------
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const consentLink = `${appUrl}/consent/${leadId}/${token}`;

    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const seq = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");

    const consentId = `CONSENT-${dateStr}-${seq}`;

    // ---------------------------
    // Insert Consent Record
    // ---------------------------
    await db.insert(consentRecords).values({
      id: consentId,
      lead_id: leadId,
      consent_for: "primary",
      consent_type: channel,
      consent_status: "link_sent",
      consent_token: token,
      consent_link_url: consentLink,
      consent_link_sent_at: now,
      created_at: now,
      updated_at: now,
    });

    // ---------------------------
    // Update Lead Consent Status
    // ---------------------------
    await db
      .update(leads)
      .set({
        consent_status: "link_sent",
        updated_at: now,
      })
      .where(eq(leads.id, leadId));

    // TODO: Integrate SMS / WhatsApp provider
    // Message:
    // "Dear Customer, please provide consent for loan processing:
    //  {consentLink}
    //  - iTarang"

    return NextResponse.json({
      success: true,
      data: {
        leadId,
        channel,
        phone: customerPhone,
        consentLink,
        sentAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Send Consent] Error:", error);
    const message =
      error instanceof Error ? error.message : "Server error";

    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}
