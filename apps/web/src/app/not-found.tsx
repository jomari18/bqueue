import Link from "next/link";
import en from "../../messages/en.json";
import fil from "../../messages/fil.json";

// A lost visitor may not read the language their cookie picked, so the 404 speaks both.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      {[en, fil].map((m, i) => (
        <section key={i} lang={i === 0 ? "en" : "fil"} className="flex flex-col items-center gap-3">
          <h1 className={i === 0 ? "font-heading text-3xl font-bold" : "font-heading text-2xl font-bold text-muted"}>{m.notFound.title}</h1>
          <p className="text-muted">{m.notFound.body}</p>
          <Link
            href="/"
            className={`inline-flex min-h-12 items-center rounded-pill px-5 font-semibold ${i === 0 ? "bg-accent text-on-accent" : "bg-raised text-text"}`}
          >
            {m.notFound.home}
          </Link>
        </section>
      ))}
    </main>
  );
}
