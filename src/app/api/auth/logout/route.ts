import { clearUserSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await clearUserSession();
  return Response.redirect(new URL("/login", request.url), 303);
}
