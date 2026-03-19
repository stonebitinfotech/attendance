import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

type EmployeeDoc = {
  name: string;
  createdAt: Date;
};

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export async function GET() {
  const db = await getDb();
  const collection = db.collection<EmployeeDoc>("employees");

  const docs = await collection
    .find({}, { projection: { _id: 0, name: 1 } })
    .sort({ name: 1 })
    .toArray();

  return NextResponse.json({ employees: docs.map((d) => d.name) });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<{ name: unknown }>;
  const raw = typeof body.name === "string" ? body.name : "";
  const name = normalizeName(raw);

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json(
      { error: "Name is too long (max 60 chars)" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const collection = db.collection<EmployeeDoc>("employees");

  // Make it idempotent (same name won't create duplicates)
  await collection.updateOne(
    { name },
    { $setOnInsert: { name, createdAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, name });
}

