import { NextResponse } from "next/server";

import { getMongoUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getMongoUser();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Student access is required." }, { status: 403 });
  }
  const notifications = await prisma.marksSheetNotification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      readAt: true,
      exam: { select: { id: true, title: true, marksSheetFileName: true, marksSheetPublishedAt: true } },
    },
  });
  const items = notifications
    .filter((notification) => notification.exam.marksSheetPublishedAt && notification.exam.marksSheetFileName)
    .map((notification) => ({
      id: notification.id,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      exam: notification.exam,
    }));
  return NextResponse.json({ items, unreadCount: items.filter((item) => !item.readAt).length });
}

export async function PATCH(request: Request) {
  const user = await getMongoUser();
  if (!user || user.role !== "student") {
    return NextResponse.json({ error: "Student access is required." }, { status: 403 });
  }

  let body: { id?: unknown; markAllRead?: unknown };
  try {
    body = await request.json() as { id?: unknown; markAllRead?: unknown };
  } catch {
    return NextResponse.json({ error: "Choose a notification to mark as read." }, { status: 400 });
  }

  if (body.markAllRead === true) {
    await prisma.marksSheetNotification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "Choose a notification to mark as read." }, { status: 400 });
  }
  const result = await prisma.marksSheetNotification.updateMany({
    where: { id: body.id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.marksSheetNotification.findFirst({ where: { id: body.id, userId: user.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
