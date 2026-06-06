import Link from "next/link";

export default function HomePage() {
  return (
    <main className="stack">
      <section className="card stack">
        <span className="badge">Lumenote MVP</span>
        <h1>Tolaria vault publishing</h1>
        <p className="muted">
          GitHub에 있는 Markdown vault를 읽어 frontmatter로 선택된 노트만 공개합니다.
        </p>
        <div className="row">
          <Link className="button" href="/vault">
            Open vault
          </Link>
          <Link className="button secondary" href="/login">
            Login
          </Link>
        </div>
      </section>
    </main>
  );
}
