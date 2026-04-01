import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractDocumentOcr, OcrDocType } from '@/lib/decentro';

const ALLOWED_TYPES: OcrDocType[] = ['PAN', 'AADHAAR', 'DRIVING_LICENSE', 'VOTERID'];

export async function POST(req: NextRequest, { params }: { params: { leadId: string } }) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const document_type = (formData.get('document_type') as string)?.toUpperCase() as OcrDocType;

        if (!file) return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
        if (!ALLOWED_TYPES.includes(document_type)) {
            return NextResponse.json({ success: false, error: `document_type must be one of: ${ALLOWED_TYPES.join(', ')}` }, { status: 400 });
        }
        if (file.size > 6 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: 'File must be under 6MB' }, { status: 400 });
        }

        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        const decentroRes = await extractDocumentOcr(document_type, blob, file.name);

        return NextResponse.json({
            success: decentroRes.responseStatus === 'SUCCESS',
            responseStatus: decentroRes.responseStatus,
            message: decentroRes.message,
            data: decentroRes.data || null,
        });
    } catch (error) {
        console.error('Decentro OCR error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
