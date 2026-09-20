import { PrecogLink as Link } from "@precog/next";
import { DOC_SLUGS, docTitle } from "./docs";

export default function Home() {
  return (
    <main>
      <h1>Your links, loaded before the click</h1>
      <p>
        Move the cursor towards a link. The module asks which one you are about to click and warms
        exactly that navigation.
      </p>
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
