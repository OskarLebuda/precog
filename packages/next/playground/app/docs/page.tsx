import { PrecogLink as Link } from "@precog/next";
import { DOC_SLUGS, docTitle } from "../docs";

export default function Docs() {
  return (
    <main>
      <h1>Docs</h1>
      <p>Every page here is rendered at build time, so it has an RSC payload to warm up.</p>
      <ul>
        {DOC_SLUGS.map((slug) => (
          <li key={slug}>
            <Link href={`/docs/${slug}`}>{docTitle(slug)}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
