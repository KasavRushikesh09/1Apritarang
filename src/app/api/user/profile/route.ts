import { requireAuth, AuthError } from "@/lib/auth-utils";
import { successResponse } from "@/lib/api-utils";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireAuth();
    return successResponse(user);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }

    console.error("[/api/user/profile] GET error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load profile" },
      { status: 500 }
    );
  }
}