import Link from "next/link";
import { publicSignupEnabled } from "@/lib/auth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const enabled = await publicSignupEnabled();

  return (
    <main className="stack">
      <section className="card stack">
        <h1>Create account</h1>
        {!enabled ? (
          <>
            <p className="muted">
              Public signup is disabled. Set <code>ALLOW_PUBLIC_SIGNUP=true</code> to enable it.
            </p>
            <Link className="button secondary" href="/admin/login">
              Back to login
            </Link>
          </>
        ) : (
          <>
            {params.error ? <p className="danger">Could not create account.</p> : null}
            <form action="/api/admin/signup" method="post">
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Password
                <input name="password" type="password" autoComplete="new-password" minLength={12} required />
              </label>
              <button type="submit">Create account</button>
            </form>
            <Link href="/admin/login">Already have an account?</Link>
          </>
        )}
      </section>
    </main>
  );
}
