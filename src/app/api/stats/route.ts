import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  try {
    const [activeStudents, practiceExams] = await prisma.$transaction([
      prisma.user.count({
        where: {
          role: "STUDENT",
          OR: [
            { attempts: { some: { startedAt: { gte: activeSince } } } },
            { quizAttemptHistory: { some: { startedAt: { gte: activeSince } } } },
          ],
        },
      }),
      prisma.exam.count({ where: { published: true, endsAt: { gt: now } } }),
    ]);

    return NextResponse.json(
      { activeStudents, practiceExams },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Landing page statistics could not be loaded:", error);
    return NextResponse.json(
      { error: "Statistics are temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
