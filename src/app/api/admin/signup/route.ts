import { createPasswordUser, createUserSession, publicSignupEnabled } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await publicSignupEnabled())) {
    return Response.json({ error: "signup disabled" }, { status: 403 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!email || password.length < 12) {
    return Response.redirect(new URL("/admin/signup?error=1", request.url), 303);
  }

  try {
    const user = await createPasswordUser(email, password);
    await createUserSession(user);
    return Response.redirect(new URL("/admin", request.url), 303);
  } catch {
    return Response.redirect(new URL("/admin/signup?error=1", request.url), 303);
  }
}
