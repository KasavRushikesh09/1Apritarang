import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { kycVerifications, leads } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { validateDocument } from '@/lib/decentro';

// Simple name similarity check (normalized Jaccard on words)
function nameSimilarity(a: string, b: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    const wordsA = new Set(normalize(a));
    const wordsB = new Set(normalize(b));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return Math.round((intersection / union) * 100);
}

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { leadId } = params;
        const { pan_number, dob, document_type = 'PAN' } = await req.json();

        if (!pan_number) {
            return NextResponse.json({ success: false, error: 'PAN number is required' }, { status: 400 });
        }

        // Fetch lead to compare name
        const [lead] = await db.select({ full_name: leads.full_name }).from(leads).where(eq(leads.id, leadId)).limit(1);
        if (!lead) {
            return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 });
        }

        // Call Decentro API
        const decentroRes = await validateDocument({
            document_type,
            id_number: pan_number.toUpperCase().trim(),
            dob,
        });

        console.log('[Decentro PAN] Response:', JSON.stringify(decentroRes));

        const apiSuccess = (decentroRes.responseStatus || decentroRes.status || '').toUpperCase() === 'SUCCESS'
            || decentroRes.message?.toLowerCase().includes('retrieved successfully');

        const kycResult = decentroRes.kycResult || decentroRes.data?.kycResult || decentroRes.data || {};
        const panName = kycResult.name || '';
        const panStatus = (kycResult.idStatus || '').toUpperCase();
        const isPanValid = panStatus === 'VALID' || panStatus === 'ACTIVE';

        // Build verification result
        const reasons: string[] = [];
        let overallSuccess = apiSuccess;

        if (!apiSuccess) {
            reasons.push(`API error: ${decentroRes.message || 'Unknown error'}`);
            overallSuccess = false;
        } else if (!isPanValid) {
            reasons.push(`PAN status: ${kycResult.idStatus || 'UNKNOWN'} (not valid)`);
            overallSuccess = false;
        }

        // Name comparison
        let matchScore: number | null = null;
        const leadName = lead.full_name || '';
        if (panName && leadName) {
            matchScore = nameSimilarity(panName, leadName);
            if (matchScore < 50) {
                reasons.push(`Name mismatch: PAN name "${panName}" does not match lead name "${leadName}" (${matchScore}% match)`);
                overallSuccess = false;
            } else if (matchScore < 80) {
                reasons.push(`Partial name match: PAN "${panName}" vs lead "${leadName}" (${matchScore}% match)`);
                // Partial match — still pass but flag it
            }
        } else if (!leadName) {
            reasons.push('Lead name not available for comparison');
        }

        const failedReason = reasons.length > 0 ? reasons.join('; ') : null;
        const verificationStatus = overallSuccess ? 'success' : 'failed';
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const seq = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

        const verRecord = {
            status: verificationStatus,
            api_provider: 'decentro' as const,
            api_request: { pan_number, document_type },
            api_response: decentroRes,
            failed_reason: failedReason,
            match_score: matchScore !== null ? matchScore.toString() : null,
            completed_at: now,
            updated_at: now,
        };

        // Upsert kycVerification record
        const existing = await db.select({ id: kycVerifications.id })
            .from(kycVerifications)
            .where(and(eq(kycVerifications.lead_id, leadId), eq(kycVerifications.verification_type, 'pan')))
            .limit(1);

        if (existing.length > 0) {
            await db.update(kycVerifications).set(verRecord)
                .where(and(eq(kycVerifications.lead_id, leadId), eq(kycVerifications.verification_type, 'pan')));
        } else {
            await db.insert(kycVerifications).values({
                id: `KYCVER-${dateStr}-${seq}`,
                lead_id: leadId,
                verification_type: 'pan',
                submitted_at: now,
                created_at: now,
                ...verRecord,
            });
        }

        // Build response message
        let message = decentroRes.message || '';
        if (overallSuccess) {
            message = isPanValid ? `PAN verified. Name: ${panName}` : message;
            if (matchScore !== null && matchScore >= 50) {
                message += ` (${matchScore}% name match with lead)`;
            }
        } else {
            message = reasons.join('. ');
        }

        return NextResponse.json({
            success: overallSuccess,
            message,
            data: {
                pan_name: panName,
                lead_name: leadName,
                pan_status: kycResult.idStatus || null,
                pan_category: kycResult.category || null,
                name_match_score: matchScore,
            },
            decentroTxnId: decentroRes.decentroTxnId,
        });
    } catch (error) {
        console.error('Decentro PAN verification error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
