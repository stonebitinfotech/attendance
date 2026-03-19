import "server-only";

export type HalfEntry = {
  enabled?: boolean;
  in?: string; // HH:mm
  out?: string; // HH:mm
};

export type AttendanceStatus = "working" | "leave" | "holiday" | "sunday";

export type AttendanceRecord = {
  employee: string;
  date: string; // YYYY-MM-DD
  status?: AttendanceStatus;
  half1?: HalfEntry;
  half2?: HalfEntry;
  updatedAt?: Date;
};

export function toMinutes(time?: string): number | null {
  if (!time) return null;
  const parts = String(time).split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesDiff(inTime?: string, outTime?: string): number | null {
  const a = toMinutes(inTime);
  const b = toMinutes(outTime);
  if (a === null || b === null) return null;
  if (b < a) return null; // ignore overnight
  return b - a;
}

export function formatHours(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function computeDayTotalMinutes(record: {
  status?: AttendanceStatus;
  half1?: HalfEntry;
  half2?: HalfEntry;
}): number {
  if (record.status && record.status !== "working" && record.status !== "sunday")
    return 0;

  const d1 = record.half1?.enabled ? minutesDiff(record.half1.in, record.half1.out) : null;
  const d2 = record.half2?.enabled ? minutesDiff(record.half2.in, record.half2.out) : null;

  return (d1 ?? 0) + (d2 ?? 0);
}

