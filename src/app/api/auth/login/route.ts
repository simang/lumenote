import { claimOrphanSitesForUser } from "@/lib/repositories";
import { createUserSession, verifyUserPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  const user = await verifyUserPassword(email, password);
  if (!user) {
    return Response.redirect(new URL("/login?error=1", request.url), 303);
  }

  await claimOrphanSitesForUser(user.id);
  await createUserSession(user);
  return Response.redirect(new URL("/dashboard", request.url), 303);
}
