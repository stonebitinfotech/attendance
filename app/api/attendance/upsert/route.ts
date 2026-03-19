import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";
import { AttendanceStatus, AttendanceRecord } from "@/lib/attendance";

type UpsertBody = {
  employee: string;
  date: string; // YYYY-MM-DD
  status?: AttendanceStatus;
  half1?: {
    enabled?: boolean;
    in?: string;
    out?: string;
  };
  half2?: {
    enabled?: boolean;
    in?: string;
    out?: string;
  };
};

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<UpsertBody>;

  const employee = typeof body.employee === "string" ? body.employee.trim() : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!employee || !isIsoDate(date)) {
    return NextResponse.json(
      { error: "Invalid body. Required: employee (string) and date (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  const status = body.status;
  const half1 = body.half1;
  const half2 = body.half2;

  const db = await getDb();
  const collection = db.collection("attendance");

  // Upsert by unique (employee, date)
  const update: Partial<AttendanceRecord> & { updatedAt: Date } = {
    employee,
    date,
    status: status,
    half1: {
      enabled: !!half1?.enabled,
      in: typeof half1?.in === "string" ? half1.in : undefined,
      out: typeof half1?.out === "string" ? half1.out : undefined,
    },
    half2: {
      enabled: !!half2?.enabled,
      in: typeof half2?.in === "string" ? half2.in : undefined,
      out: typeof half2?.out === "string" ? half2.out : undefined,
    },
    updatedAt: new Date(),
  };

  await collection.updateOne(
    { employee, date },
    { $set: update },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

