import { NextResponse } from "next/server";
import { getWhatsAppStatus } from "@/lib/whatsapp";

/** Status-only endpoint. Does NOT start WhatsApp or touch QR. Use in phone mode to avoid interfering with pairing. */
export async function GET() {
  const status = await getWhatsAppStatus();
  return NextResponse.json({
    connected: status.connected,
    connection: status.connection,
  });
}
