import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const user = await getMongoUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }
  return NextResponse.json({ error: "Quiz retakes are now started by students from their quiz list." }, { status: 410 });
}
