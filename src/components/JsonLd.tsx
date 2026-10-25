interface JsonLdProps {
  data: Record<string, unknown>;
}

function safeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function JsonLd({ data }: JsonLdProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
