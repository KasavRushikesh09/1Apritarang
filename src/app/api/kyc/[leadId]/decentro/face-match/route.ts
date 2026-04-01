import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { faceMatch } from '@/lib/decentro';

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const formData = await req.formData();
        const image1 = formData.get('image1') as File | null;
        const image2 = formData.get('image2') as File | null;

        if (!image1 || !image2) {
            return NextResponse.json({ success: false, error: 'Both image1 and image2 are required' }, { status: 400 });
        }
        if (image1.size > 6 * 1024 * 1024 || image2.size > 6 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: 'Each image must be under 6MB' }, { status: 400 });
        }

        const blob1 = new Blob([await image1.arrayBuffer()], { type: image1.type });
        const blob2 = new Blob([await image2.arrayBuffer()], { type: image2.type });

        const decentroRes = await faceMatch(blob1, blob2);
        const success = decentroRes.responseStatus === 'SUCCESS';

        return NextResponse.json({
            success,
            responseStatus: decentroRes.responseStatus,
            message: decentroRes.message,
            match_score: decentroRes.data?.match_score ?? null,
            is_match: decentroRes.data?.is_match ?? null,
            data: decentroRes.data || null,
        });
    } catch (error) {
        console.error('Decentro face match error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
