"use client";

import { useEffect, useMemo, useState } from "react";

type HalfEntryUI = {
  enabled?: boolean;
  in?: string;
  out?: string;
};

type RowUI = {
  date: string; // YYYY-MM-DD
  status: "working" | "leave" | "holiday" | "sunday";
  half1: HalfEntryUI;
  half2: HalfEntryUI;
  totalMinutes: number;
};

function statusSelectClass(status: RowUI["status"]): string {
  if (status === "working") {
    return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
  }
  if (status === "leave") {
    return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200";
  }
  if (status === "holiday") {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
  }
  return "border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600/30 dark:bg-zinc-700/10 dark:text-zinc-200";
}

type MonthlyResp = {
  employee: string;
  year: number;
  month: number;
  rows: RowUI[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toMonthKey(year: number, month1to12: number): string {
  return `${year}-${pad2(month1to12)}`;
}

function minutesToHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!Number.isFinite(mins) || mins <= 0) return "0.00";
  return m === 0 ? `${h}.00` : `${(h + m / 60).toFixed(2)}`;
}

function nowHHmm(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function csvEscape(value: string): string {
  // RFC4180-ish: wrap in quotes if needed, double quotes inside
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export default function AttendancePage() {
  const now = new Date();
  const [employee, setEmployee] = useState<string>("Pal");
  const [employees, setEmployees] = useState<string[]>(["Pal", "Hardik"]);
  const [newEmployeeName, setNewEmployeeName] = useState<string>("");
  const [savingEmployee, setSavingEmployee] = useState<boolean>(false);
  const [monthKey, setMonthKey] = useState<string>(
    toMonthKey(now.getFullYear(), now.getMonth() + 1)
  );
  const [rows, setRows] = useState<RowUI[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const { year, month } = useMemo(() => {
    const [y, m] = monthKey.split("-");
    return { year: Number(y), month: Number(m) };
  }, [monthKey]);

  async function loadMonth() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/attendance/monthly?employee=${encodeURIComponent(
        employee
      )}&year=${year}&month=${month}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = (await res.json()) as MonthlyResp;
      setRows(data.rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load month");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, monthKey]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/employees", { cache: "no-store" });
        const data = (await res.json()) as { employees?: unknown };
        const list = Array.isArray(data.employees)
          ? data.employees.filter((x): x is string => typeof x === "string")
          : [];
        if (list.length > 0) {
          setEmployees(list);
          if (!list.includes(employee)) setEmployee(list[0]);
        }
      } catch {
        // ignore (fallback to local default list)
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveEmployee() {
    const name = newEmployeeName.replace(/\s+/g, " ").trim();
    if (!name) return;
    setSavingEmployee(true);
    setError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { ok?: boolean; name?: string; error?: string };
      if (!res.ok || !data.ok || !data.name) {
        throw new Error(data.error || "Failed to save employee");
      }
      setEmployees((prev) => {
        const merged = Array.from(new Set([...prev, data.name!]));
        merged.sort((a, b) => a.localeCompare(b));
        return merged;
      });
      setEmployee(data.name);
      setNewEmployeeName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save employee");
    } finally {
      setSavingEmployee(false);
    }
  }

  function updateRow(date: string, patch: Partial<RowUI>) {
    setRows((prev) =>
      prev.map((r) => (r.date === date ? { ...r, ...patch } : r))
    );
  }

  function updateHalf(date: string, half: 1 | 2, patch: Partial<HalfEntryUI>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.date !== date) return r;
        return {
          ...r,
          ...(half === 1
            ? { half1: { ...r.half1, ...patch } }
            : { half2: { ...r.half2, ...patch } }),
        };
      })
    );
  }

  async function saveDay(row: RowUI) {
    const key = row.date;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/attendance/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee,
          date: row.date,
          status: row.status,
          half1: row.half1,
          half2: row.half2,
        }),
      });
      if (!res.ok) throw new Error(`Save failed for ${row.date}`);
      await loadMonth();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  function exportCsv() {
    const header = [
      "Employee",
      "Date",
      "Status",
      "Half1Enabled",
      "Half1In",
      "Half1Out",
      "Half2Enabled",
      "Half2In",
      "Half2Out",
      "TotalHours",
    ];

    const lines = [
      header.join(","),
      ...rows.map((r) => {
        const total = minutesToHours(r.totalMinutes);
        const cells = [
          employee,
          r.date,
          r.status,
          r.half1?.enabled ? "1" : "0",
          r.half1?.in ?? "",
          r.half1?.out ?? "",
          r.half2?.enabled ? "1" : "0",
          r.half2?.in ?? "",
          r.half2?.out ?? "",
          total,
        ].map((v) => csvEscape(String(v ?? "")));
        return cells.join(",");
      }),
    ];

    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${employee}_${monthKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const monthLabel = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [year, month]);

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <div className="mb-4 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold">Attendance</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Employee
              </span>
              <select
                className="w-44 rounded-md border border-black/[.08] bg-white px-2 py-1 text-sm dark:border-white/[.145] dark:bg-black"
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
              >
                {employees.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                className="w-44 rounded-md border border-black/[.08] bg-white px-2 py-1 text-sm dark:border-white/[.145] dark:bg-black"
                placeholder="New employee name"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
              />
              <button
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                onClick={() => void saveEmployee()}
                disabled={savingEmployee || newEmployeeName.trim().length === 0}
              >
                {savingEmployee ? "Saving..." : "Save Employee"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Month
              </span>
              <input
                type="month"
                className="rounded-md border border-black/[.08] bg-white px-2 py-1 text-sm dark:border-white/[.145] dark:bg-black"
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
              />
            </div>

            <button
              className="rounded-md border border-black/[.08] bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[.03] dark:border-white/[.145] dark:bg-black dark:hover:bg-white/[.06] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              title={rows.length === 0 ? "No data to export" : "Download CSV"}
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Showing: {employee} - {monthLabel}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? <div className="text-sm text-zinc-600">Loading...</div> : null}

      <div className="overflow-auto rounded-xl border border-black/[.08] bg-white p-2 dark:border-white/[.145] dark:bg-black">
        <table className="min-w-[1350px] table-auto border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left dark:bg-white/[.04]">
              <th className="sticky left-0 bg-zinc-50 px-3 py-2.5 font-semibold dark:bg-white/[.06]">
                Date
              </th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Half1 In</th>
              <th className="px-3 py-2.5 font-semibold">Half1 Out</th>
              <th className="px-3 py-2.5 font-semibold">Half2 In</th>
              <th className="px-3 py-2.5 font-semibold">Half2 Out</th>
              <th className="px-3 py-2.5 font-semibold">Total (hrs)</th>
              <th className="px-3 py-2.5 font-semibold">Save</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isWorking = r.status === "working";
              const sKey = r.date;
              return (
                <tr
                  key={r.date}
                  className="border-t border-black/[.06] dark:border-white/[.08] hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                >
                  <td className="sticky left-0 bg-white px-3 py-2 font-medium dark:bg-black">
                    {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={`w-40 rounded-md border px-2 py-1 text-xs ${statusSelectClass(
                        r.status
                      )}`}
                      value={r.status}
                      onChange={(e) =>
                        updateRow(r.date, { status: e.target.value as RowUI["status"] })
                      }
                    >
                      <option value="working">working</option>
                      <option value="leave">leave</option>
                      <option value="holiday">holiday</option>
                      <option value="sunday">sunday</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!r.half1?.enabled}
                        onChange={(e) =>
                          updateHalf(r.date, 1, {
                            enabled: e.target.checked,
                            in: e.target.checked ? r.half1?.in ?? "" : "",
                            out: e.target.checked ? r.half1?.out ?? "" : "",
                          })
                        }
                        disabled={!isWorking}
                      />
                      <input
                        type="time"
                      className="w-24 rounded-md border border-black/[.08] bg-white px-2 py-1 text-xs dark:border-white/[.145] dark:bg-black disabled:opacity-50 disabled:bg-zinc-100 dark:disabled:bg-zinc-900/50"
                        value={r.half1?.in ?? ""}
                        onChange={(e) =>
                          updateHalf(r.date, 1, { in: e.target.value })
                        }
                        disabled={!isWorking || !r.half1?.enabled}
                      />
                    </div>
                    <div className="mt-1">
                      <button
                        className="rounded-md border border-black/[.08] px-1.5 py-0.5 text-[10px] font-medium leading-none hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06] disabled:opacity-50 disabled:cursor-not-allowed"
                        type="button"
                        disabled={!isWorking}
                        onClick={() => {
                          updateHalf(r.date, 1, {
                            enabled: true,
                            in: nowHHmm(),
                          });
                        }}
                      >
                        Set Now
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        className="w-24 rounded-md border border-black/[.08] bg-white px-2 py-1 text-xs dark:border-white/[.145] dark:bg-black disabled:opacity-50 disabled:bg-zinc-100 dark:disabled:bg-zinc-900/50"
                        value={r.half1?.out ?? ""}
                        onChange={(e) =>
                          updateHalf(r.date, 1, { out: e.target.value })
                        }
                        disabled={!isWorking || !r.half1?.enabled}
                      />
                    </div>
                    <div className="mt-1">
                      <button
                        className="rounded-md border border-black/[.08] px-1.5 py-0.5 text-[10px] font-medium leading-none hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06] disabled:opacity-50 disabled:cursor-not-allowed"
                        type="button"
                        disabled={!isWorking}
                        onClick={() => {
                          updateHalf(r.date, 1, {
                            enabled: true,
                            out: nowHHmm(),
                          });
                        }}
                      >
                        Set Now
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!r.half2?.enabled}
                        onChange={(e) =>
                          updateHalf(r.date, 2, {
                            enabled: e.target.checked,
                            in: e.target.checked ? r.half2?.in ?? "" : "",
                            out: e.target.checked ? r.half2?.out ?? "" : "",
                          })
                        }
                        disabled={!isWorking}
                      />
                      <input
                        type="time"
                        className="w-24 rounded-md border border-black/[.08] bg-white px-2 py-1 text-xs dark:border-white/[.145] dark:bg-black disabled:opacity-50 disabled:bg-zinc-100 dark:disabled:bg-zinc-900/50"
                        value={r.half2?.in ?? ""}
                        onChange={(e) =>
                          updateHalf(r.date, 2, { in: e.target.value })
                        }
                        disabled={!isWorking || !r.half2?.enabled}
                      />
                    </div>
                    <div className="mt-1">
                      <button
                        className="rounded-md border border-black/[.08] px-1.5 py-0.5 text-[10px] font-medium leading-none hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06] disabled:opacity-50 disabled:cursor-not-allowed"
                        type="button"
                        disabled={!isWorking}
                        onClick={() => {
                          updateHalf(r.date, 2, {
                            enabled: true,
                            in: nowHHmm(),
                          });
                        }}
                      >
                        Set Now
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="mt-0.5 flex items-center gap-2">
                      <input
                        type="time"
                        className="w-24 rounded-md border border-black/[.08] bg-white px-2 py-1 text-xs dark:border-white/[.145] dark:bg-black disabled:opacity-50 disabled:bg-zinc-100 dark:disabled:bg-zinc-900/50"
                        value={r.half2?.out ?? ""}
                        onChange={(e) =>
                          updateHalf(r.date, 2, { out: e.target.value })
                        }
                        disabled={!isWorking || !r.half2?.enabled}
                      />
                    </div>
                    <div className="mt-1">
                      <button
                        className="rounded-md border border-black/[.08] px-1.5 py-0.5 text-[10px] font-medium leading-none hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06] disabled:opacity-50 disabled:cursor-not-allowed"
                        type="button"
                        disabled={!isWorking}
                        onClick={() => {
                          updateHalf(r.date, 2, {
                            enabled: true,
                            out: nowHHmm(),
                          });
                        }}
                      >
                        Set Now
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {minutesToHours(r.totalMinutes)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:opacity-50 disabled:cursor-not-allowed"
                      type="button"
                      disabled={saving[sKey]}
                      onClick={() => void saveDay(r)}
                    >
                      {saving[sKey] ? "Saving..." : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

