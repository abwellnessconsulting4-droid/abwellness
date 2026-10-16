import { FAQ_GROUPS, FOUNDER } from "@/content/site";
import {
  CONTACT_EMAIL,
  SITE_DESCRIPTION,
  SITE_LEGAL_NAME,
  SITE_NAME,
  SOCIAL_LINKS,
} from "@/lib/constants";
import { baseURL } from "@/resources/seo";

type JsonLdData = Record<string, unknown>;

/** Structured data for search engines (escaped per the Next.js JSON-LD guide). */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

const ORGANIZATION_ID = `${baseURL}/#organization`;

export function organizationJsonLd(): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        legalName: SITE_LEGAL_NAME,
        url: baseURL,
        logo: `${baseURL}/images/icon.png`,
        image: `${baseURL}/opengraph-image.png`,
        description: SITE_DESCRIPTION,
        email: CONTACT_EMAIL,
        founder: { "@type": "Person", name: FOUNDER.name, jobTitle: FOUNDER.title },
        sameAs: SOCIAL_LINKS.filter((link) => link.href.startsWith("http")).map((link) => link.href),
      },
      {
        "@type": "WebSite",
        "@id": `${baseURL}/#website`,
        url: baseURL,
        name: SITE_NAME,
        publisher: { "@id": ORGANIZATION_ID },
        inLanguage: "en-US",
      },
    ],
  };
}

export function founderJsonLd(): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${baseURL}/founder`,
    mainEntity: {
      "@type": "Person",
      name: FOUNDER.name,
      jobTitle: FOUNDER.title,
      worksFor: { "@id": ORGANIZATION_ID },
    },
  };
}

export function faqJsonLd(): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_GROUPS.flatMap((group) =>
      group.items
        // Skip answers that still contain [placeholders].
        .filter((item) => !item.answer.includes("["))
        .map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
    ),
  };
}
