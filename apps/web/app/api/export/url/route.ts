import { NextResponse } from "next/server";
import { getCurrentUser, AuthError } from "@/lib/server/auth";
import { getSignedDownloadUrl } from "@labo/lib/csv-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await getCurrentUser();

    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Missing key parameter" },
        { status: 400 },
      );
    }

    const signedUrl = getSignedDownloadUrl(key);

    return NextResponse.json(
      { url: signedUrl },
      {
        headers: {
          "Cache-Control": "private, max-age=3600",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof AuthError &&
      (error.code === "UNAUTHENTICATED" || error.code === "UNAUTHORIZED")
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    console.error("[GET /api/export/url] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
