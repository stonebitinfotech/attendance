import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getQrString, getWhatsAppStatus, startWhatsApp } from "@/lib/whatsapp";

export async function GET() {
  await startWhatsApp();

  const status = await getWhatsAppStatus();
  if (status.connected) {
    return NextResponse.json({ connected: true, connection: status.connection });
  }

  const qr = await getQrString();
  if (!qr) {
    return NextResponse.json({
      connected: false,
      connection: status.connection,
      qrDataUrl: null,
    });
  }

  const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8 });
  return NextResponse.json({
    connected: false,
    connection: status.connection,
    qrDataUrl,
  });
}

