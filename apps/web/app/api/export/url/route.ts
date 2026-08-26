import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, AUTH_COOKIE_NAMES, AuthError } from "@/lib/server/auth";
import { getSignedDownloadUrl } from "@labo/lib/csv-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 1. Verify user is authenticated
    await getCurrentUser();

    // 2. Parse key from URL
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Missing key parameter" },
        { status: 400 },
      );
    }

    // 3. Get access token from cookies for InsForge client
    const jar = cookies();
    const accessToken = jar.get(AUTH_COOKIE_NAMES.access)?.value;

    // 4. Get signed URL
    const signedUrl = await getSignedDownloadUrl(key, accessToken);

    // 5. Return it with Cache-Control
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
