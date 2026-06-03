import Link from "next/link";
import { publicSignupEnabled } from "@/lib/auth";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const signupEnabled = await publicSignupEnabled();

  return (
    <main className="stack">
      <section className="card stack">
        <h1>Login</h1>
        {params.error ? <p className="danger">Invalid credentials.</p> : null}
        <form action="/api/admin/login" method="post">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Login</button>
        </form>
        {signupEnabled ? <Link href="/admin/signup">Create an account</Link> : null}
      </section>
    </main>
  );
}
