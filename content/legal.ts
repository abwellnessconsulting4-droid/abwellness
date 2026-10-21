/**
 * DRAFT legal copy for the client preview. Must be reviewed by counsel before launch.
 * If AB Wellness is a HIPAA covered entity, a separate Notice of Privacy Practices is also required.
 */
import { CONTACT_EMAIL, SITE_LEGAL_NAME, SITE_NAME } from "@/lib/constants";

export interface LegalSection {
  /** Anchor for deep links, e.g. /accessibility#translation. */
  id?: string;
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface LegalDocument {
  title: string;
  summary: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy policy",
  summary: `How ${SITE_NAME} collects, uses, and protects your information.`,
  effectiveDate: "[Effective date]",
  sections: [
    {
      heading: "Who we are",
      paragraphs: [
        `${SITE_LEGAL_NAME} ("we," "us") provides wellness consulting services. This policy explains how we handle information collected through this website.`,
      ],
    },
    {
      heading: "Information we collect",
      list: [
        "Contact details you provide, such as your name, email address, and phone number.",
        "Information you choose to share in forms, such as the services you're interested in.",
        "Basic technical data, such as browser type and pages visited, used to keep the site secure and working well.",
      ],
    },
    {
      heading: "How we use information",
      list: [
        "To respond to your inquiries and requests for services.",
        "To send updates you've asked for, such as launch announcements. You can unsubscribe at any time.",
        "To maintain the security and performance of the website.",
      ],
      paragraphs: ["We do not sell your personal information."],
    },
    {
      heading: "Health information",
      paragraphs: [
        "Please don't include medical or other sensitive details in website forms. Once you become a client, health-related information is collected through our secure client portal and handled under [our Notice of Privacy Practices / applicable law].",
      ],
    },
    {
      heading: "Sharing",
      paragraphs: [
        "We share information only with service providers who help us operate (for example, email delivery and secure hosting), under agreements that require them to protect it, or when required by law.",
      ],
    },
    {
      heading: "Translation",
      paragraphs: [
        "If you choose a language other than English from the language menu, the page loads Google Translate, which sends the page's text to Google to translate it and sets a cookie to remember your choice. Google's privacy policy applies to that service. If you don't choose a language, the translation service is never loaded.",
      ],
    },
    {
      heading: "Security and retention",
      paragraphs: [
        "We use encryption in transit and at rest, access controls, and audit logging to protect information. We keep information only as long as needed for the purposes above or as required by law.",
      ],
    },
    {
      heading: "Your choices and rights",
      paragraphs: [
        `You may request access to, correction of, or deletion of your information by emailing ${CONTACT_EMAIL}. Depending on where you live, you may have additional rights under [applicable state law].`,
      ],
    },
    {
      heading: "Children",
      paragraphs: ["This website is not directed to children under 13, and we do not knowingly collect their information."],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        `We may update this policy and will post the new effective date here. Questions? Contact ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: "Terms of use",
  summary: `The terms that apply when you use the ${SITE_NAME} website.`,
  effectiveDate: "[Effective date]",
  sections: [
    {
      heading: "Using this website",
      paragraphs: [
        `By using this website, you agree to these terms. If you don't agree, please don't use the site. These terms cover the website only; services are governed by a separate client agreement.`,
      ],
    },
    {
      heading: "Not medical or emergency care",
      paragraphs: [
        "Content on this website is for general information and is not medical, psychological, legal, or financial advice. It does not create a client relationship. If you are in an emergency, call 911. For a mental health crisis, call or text 988.",
      ],
    },
    {
      heading: "Acceptable use",
      list: [
        "Don't misuse the site, attempt to gain unauthorized access, or interfere with its operation.",
        "Don't submit false information or information about others without their permission.",
        "Don't use the site in violation of any law.",
      ],
    },
    {
      heading: "Intellectual property",
      paragraphs: [
        `The site's content, logo, and design belong to ${SITE_LEGAL_NAME} and may not be reused without permission, except for personal, non-commercial use.`,
      ],
    },
    {
      heading: "Links to other sites",
      paragraphs: ["We link to outside resources for convenience. We aren't responsible for their content or practices."],
    },
    {
      heading: "Disclaimers and limitation of liability",
      paragraphs: [
        "The website is provided \"as is.\" To the extent permitted by law, we disclaim warranties and are not liable for indirect or consequential damages arising from use of the site.",
      ],
    },
    {
      heading: "Governing law and changes",
      paragraphs: [
        `These terms are governed by the laws of [State]. We may update them and will post the new effective date here. Questions? Contact ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const ACCESSIBILITY_STATEMENT: LegalDocument = {
  title: "Accessibility statement",
  summary: `${SITE_NAME} is committed to a website everyone can use.`,
  effectiveDate: "[Effective date]",
  sections: [
    {
      heading: "Our commitment",
      paragraphs: [
        "We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA, and we treat accessibility as an ongoing responsibility rather than a one-time task.",
      ],
    },
    {
      heading: "What we do",
      list: [
        "Use semantic structure, headings, and landmarks so assistive technologies can navigate the site.",
        "Support full keyboard navigation with visible focus indicators and a skip-to-content link.",
        "Maintain sufficient color contrast and avoid conveying meaning through color alone.",
        "Provide text alternatives for meaningful images and label every form field.",
        "Respect reduced-motion preferences set in your device.",
        "Test with automated tools and manual keyboard and screen reader checks.",
      ],
    },
    {
      id: "translation",
      heading: "Translations",
      paragraphs: [
        "Our services are offered in English and Spanish. To read this website in another language, use the language menu at the top of any page. It uses Google Translate, an automatic machine-translation service, so translations may be inaccurate or incomplete. For anything important, such as fees, agreements, or privacy terms, the English version is the official one, and we're happy to talk it through with you in English or Spanish.",
      ],
    },
    {
      heading: "Known limitations",
      paragraphs: ["[List any known issues and planned fixes, or remove this section if none.]"],
    },
    {
      heading: "Feedback and assistance",
      paragraphs: [
        `If you have trouble accessing any part of this site, or need information in another format, email ${CONTACT_EMAIL} or call [phone]. We aim to respond within [two business days].`,
      ],
    },
  ],
};
