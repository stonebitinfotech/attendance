import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";
import {
  AttendanceRecord,
  AttendanceStatus,
  computeDayTotalMinutes,
} from "@/lib/attendance";

type MonthlyQuery = {
  employee: string;
  year: number;
  month: number; // 1-12
};

function parseQueryParams(
  searchParams: URLSearchParams
): MonthlyQuery | null {
  const employee = searchParams.get("employee");
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");

  const year = yearRaw ? Number(yearRaw) : NaN;
  const month = monthRaw ? Number(monthRaw) : NaN;
  if (!employee || !Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;

  return { employee, year, month };
}

function isoDate(year: number, month1to12: number, day: number): string {
  const mm = String(month1to12).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function getDaysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function isSunday(year: number, month1to12: number, day: number): boolean {
  const d = new Date(year, month1to12 - 1, day);
  return d.getDay() === 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = parseQueryParams(url.searchParams);
  if (!parsed) {
    return NextResponse.json(
      { error: "Missing/invalid query params. Use ?employee=...&year=YYYY&month=1-12" },
      { status: 400 }
    );
  }

  const { employee, year, month } = parsed;
  const days = getDaysInMonth(year, month);
  const db = await getDb();
  const collection = db.collection("attendance");

  // Fetch all records for month in one query.
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const cursor = collection.find({
    employee,
    date: {
      $gte: start.toISOString().slice(0, 10),
      $lt: end.toISOString().slice(0, 10),
    },
  });

  const byDate = new Map<string, AttendanceRecord>();
  await cursor.forEach((doc) => {
    const r = doc as unknown as AttendanceRecord;
    if (typeof r?.date === "string") byDate.set(r.date, r);
  });

  const rows = [];
  for (let day = 1; day <= days; day++) {
    const date = isoDate(year, month, day);
    const record = byDate.get(date);

    const sundayAuto = isSunday(year, month, day);
    const status: AttendanceStatus = record?.status ?? (sundayAuto ? "sunday" : "working");
    const totalMinutes = computeDayTotalMinutes({
      status,
      half1: record?.half1,
      half2: record?.half2,
    });

    rows.push({
      date,
      status,
      half1: record?.half1 ?? { enabled: false, in: "", out: "" },
      half2: record?.half2 ?? { enabled: false, in: "", out: "" },
      totalMinutes,
    });
  }

  return NextResponse.json({
    employee,
    year,
    month,
    rows,
  });
}

