import { NextResponse } from "next/server";
import { requestPairingCode, getWhatsAppStatus, startWhatsApp } from "@/lib/whatsapp";

export async function POST(req: Request) {
  await startWhatsApp();

  const status = await getWhatsAppStatus();
  if (status.connected) {
    return NextResponse.json({ connected: true });
  }

  let body: { phoneNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "phoneNumber is required" },
      { status: 400 }
    );
  }

  const result = await requestPairingCode(phoneNumber);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ pairingCode: result.code });
}
