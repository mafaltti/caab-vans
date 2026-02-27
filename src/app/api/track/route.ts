import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, timestamp } = body as {
      event?: string;
      timestamp?: string;
    };

    if (!event || typeof event !== "string") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Missing event name" } },
        { status: 400 },
      );
    }

    console.log(`[track] ${event} at ${timestamp ?? new Date().toISOString()}`);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }
}
