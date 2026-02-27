import { NextResponse } from "next/server";
import type { ErrorCode } from "@/types";

export function apiError(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function validationError(zodError: { issues: { message: string }[] }) {
  const message = zodError.issues.map((i) => i.message).join("; ");
  return apiError("VALIDATION_ERROR", message, 400);
}
