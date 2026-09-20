import { PrecogLink as Link } from "next-precog";
import { DOC_SLUGS, docBody, docTitle } from "../../docs";

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export default async function Doc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const others = DOC_SLUGS.filter((other) => other !== slug).slice(0, 6);

  return (
    <main>
      <h1>{docTitle(slug)}</h1>
      {docBody(slug).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      <h2>See also</h2>
      <ul>
        {others.map((other) => (
          <li key={other}>
            <Link href={`/docs/${other}`}>{docTitle(other)}</Link>
          </li>
        ))}
      </ul>
      <Link href="/docs">Back to the docs</Link>
    </main>
  );
}
