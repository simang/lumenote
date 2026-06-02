export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="stack">
      <section className="card stack">
        <h1>Admin login</h1>
        {params.error ? <p className="danger">Invalid admin credentials.</p> : null}
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
      </section>
    </main>
  );
}
