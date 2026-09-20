import Link from "next/link";

export default function Blog() {
  return (
    <main>
      <h1>Blog</h1>
      <p>A server-rendered section, so there is no prerendered payload to warm here.</p>
      <Link href="/docs">Back to the docs</Link>
    </main>
  );
}
