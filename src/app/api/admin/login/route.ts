import { createAdminSession, verifyAdminPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  if (!(await verifyAdminPassword(email, password))) {
    return Response.redirect(new URL("/admin/login?error=1", request.url), 303);
  }

  await createAdminSession(email);
  return Response.redirect(new URL("/admin", request.url), 303);
}
