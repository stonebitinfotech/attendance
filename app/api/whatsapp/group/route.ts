import { NextResponse } from "next/server";
import { getGroupByName, getWhatsAppStatus, startWhatsApp } from "@/lib/whatsapp";

const GROUP_NAME_QUERY = process.env.WHATSAPP_GROUP_QUERY ?? "stonewall infotech";

export async function GET() {
  await startWhatsApp();

  const status = await getWhatsAppStatus();
  if (!status.connected) {
    return NextResponse.json(
      { connected: false, error: "WhatsApp not connected yet." },
      { status: 409 }
    );
  }

  const group = await getGroupByName(GROUP_NAME_QUERY);
  if (!group) {
    return NextResponse.json(
      {
        connected: true,
        error: `Group not found (query: "${GROUP_NAME_QUERY}").`,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ connected: true, group });
}

