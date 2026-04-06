export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import QRCode from 'qrcode';

export async function GET(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const facilityId = request.nextUrl.searchParams.get('facilityId');
  if (!facilityId) {
    return NextResponse.json({ error: 'facilityId required' }, { status: 400 });
  }

  const appUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  const scanUrl = `${appUrl}/scan?facility=${facilityId}`;

  const pngBuffer = await QRCode.toBuffer(scanUrl, {
    type: 'png',
    width: 1024,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qrcode-${facilityId}.png"`,
    },
  });
}
