/**
 * Public-site copy. DRAFT: written for the client preview.
 * Anything in [brackets] is a placeholder the client needs to supply or confirm.
 */
import type { IconName } from "@/resources/icons";

export interface NavLink {
  label: string;
  href: string;
}

export const MAIN_NAV: NavLink[] = [
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Programs", href: "/programs" },
  { label: "Approach", href: "/approach" },
  { label: "Resources", href: "/resources" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

export const FOOTER_NAV: { title: string; links: NavLink[] }[] = [
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Our founder", href: "/founder" },
      { label: "Our approach", href: "/approach" },
    ],
  },
  {
    title: "Get support",
    links: [
      { label: "Services", href: "/services" },
      { label: "Programs", href: "/programs" },
      { label: "Schedule a consultation", href: "/schedule" },
      { label: "Request services", href: "/request-services" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Resources", href: "/resources" },
      { label: "FAQ", href: "/faq" },
      { label: "Contact", href: "/contact" },
      { label: "Client login", href: "/login" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of use", href: "/terms" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
];

export const CONTACT_DETAILS = {
  phone: "[(555) 000-0000]",
  address: "[Street address, City, State ZIP]",
  serviceArea: "[Service area: city / county / state]",
  hours: "Monday–Friday, 9:00 AM – 5:00 PM ET [confirm]",
};

export interface Feature {
  icon: IconName;
  title: string;
  description: string;
  points?: string[];
  href?: string;
}

export const AUDIENCES: Feature[] = [
  {
    icon: "heart",
    title: "Individuals",
    description:
      "Adults who want steadier routines, a clear plan, and someone in their corner while they make changes that last.",
  },
  {
    icon: "people",
    title: "Families & caregivers",
    description:
      "Families supporting a loved one who need guidance, coordination, and room to take care of themselves too.",
  },
  {
    icon: "building",
    title: "Organizations",
    description:
      "Employers, nonprofits, and community partners building healthier teams and programs for the people they serve.",
  },
];

export const SERVICES: Feature[] = [
  {
    icon: "sparkles",
    title: "Individual wellness coaching",
    description:
      "One-on-one sessions to set meaningful goals, build daily routines, and manage stress with practical tools.",
    points: ["Personal wellness plan", "Goal-setting and check-ins", "Stress and routine management"],
  },
  {
    icon: "chat",
    title: "Care coordination & navigation",
    description:
      "Help finding, connecting with, and keeping track of the healthcare, benefits, and community services you need.",
    points: ["Referrals and warm hand-offs", "Appointment and paperwork support", "Benefits navigation"],
  },
  {
    icon: "home",
    title: "Housing stability support",
    description:
      "Guidance through housing searches, applications, documentation, and the steps that keep a home stable.",
    points: ["Application and document prep", "Landlord communication support", "Move-in and stability planning"],
  },
  {
    icon: "checkCircle",
    title: "Life skills & independent living",
    description:
      "Hands-on support with the everyday skills that make independence feel achievable and sustainable.",
    points: ["Budgeting and money basics", "Scheduling and organization", "Healthy daily habits"],
  },
  {
    icon: "users",
    title: "Family & caregiver support",
    description:
      "Guidance for the people who support someone else, so the whole household can move forward together.",
    points: ["Caregiver planning sessions", "Communication strategies", "Respite and resource referrals"],
  },
  {
    icon: "building",
    title: "Organizational wellness consulting",
    description:
      "Workshops and program design that help organizations support the wellbeing of their teams and communities.",
    points: ["Staff wellness workshops", "Program design and evaluation", "Community partnerships"],
  },
];

export interface Program {
  name: string;
  summary: string;
  audience: string;
  format: string;
  duration: string;
  includes: string[];
}

export const PROGRAMS: Program[] = [
  {
    name: "Foundations",
    summary:
      "A structured start for anyone ready to build steadier routines and a plan they believe in.",
    audience: "Individuals beginning their wellness journey",
    format: "One-on-one, in person or virtual [confirm]",
    duration: "8 weeks [confirm]",
    includes: ["Intake and wellness assessment", "Personal wellness plan", "Weekly coaching sessions", "Progress review"],
  },
  {
    name: "Stable Ground",
    summary:
      "Focused support for finding and keeping stable housing, from paperwork to move-in and beyond.",
    audience: "Individuals and families facing housing transitions",
    format: "One-on-one with care coordination",
    duration: "12 weeks [confirm]",
    includes: ["Housing readiness plan", "Document and application support", "Landlord and agency coordination", "Stability check-ins"],
  },
  {
    name: "Thrive Together",
    summary:
      "Small-group workshops that build practical skills and a sense of community along the way.",
    audience: "Adults who learn best alongside others",
    format: "Small groups [confirm size]",
    duration: "6 sessions [confirm]",
    includes: ["Life skills workshops", "Peer connection", "Take-home tools and worksheets"],
  },
  {
    name: "Workplace Wellness",
    summary:
      "Tailored workshops and program design for organizations investing in their people.",
    audience: "Employers, nonprofits, and community organizations",
    format: "On-site or virtual sessions",
    duration: "Custom engagements",
    includes: ["Needs assessment", "Custom workshop series", "Program recommendations", "Outcome summary"],
  },
];

export const APPROACH_STEPS: { title: string; description: string }[] = [
  {
    title: "Connect",
    description:
      "A free, no-pressure introductory call to hear what you're looking for and whether we're the right fit.",
  },
  {
    title: "Understand",
    description:
      "A guided intake to learn about your goals, strengths, and the challenges standing in the way.",
  },
  {
    title: "Plan",
    description:
      "Together we build a personal wellness plan with clear, realistic steps, written in your words.",
  },
  {
    title: "Support",
    description:
      "Regular sessions, coordination with other services, and steady encouragement as you put the plan to work.",
  },
  {
    title: "Grow",
    description:
      "We review progress, celebrate wins, and adjust. The goal is independence and support that lasts.",
  },
];

export const PRINCIPLES: Feature[] = [
  {
    icon: "heart",
    title: "Person-centered",
    description: "Your goals lead. We listen first and build every plan around what matters to you.",
  },
  {
    icon: "sparkles",
    title: "Strengths-based",
    description: "We start from what's already working and build on it, rather than focusing only on problems.",
  },
  {
    icon: "people",
    title: "Culturally responsive",
    description: "We respect each person's background, identity, and lived experience, and we adapt to them.",
  },
  {
    icon: "lock",
    title: "Confidential by design",
    description: "Your information is private, protected, and only shared with your permission or as the law requires.",
  },
];

export const VALUES: Feature[] = [
  { icon: "heart", title: "Compassion", description: "Calm, patient support without judgment." },
  { icon: "shield", title: "Integrity", description: "Honest guidance and clear expectations." },
  { icon: "sparkles", title: "Growth", description: "Progress that builds on itself over time." },
  { icon: "people", title: "Community", description: "Nobody should have to navigate alone." },
];

export const APPOINTMENT_TYPES: { name: string; duration: string; description: string; icon: IconName }[] = [
  {
    name: "Introductory call",
    duration: "20 minutes · Free",
    description: "A quick conversation to understand your needs and answer your questions.",
    icon: "phone",
  },
  {
    name: "Intake consultation",
    duration: "60 minutes [confirm]",
    description: "A deeper session to complete intake and begin shaping your wellness plan.",
    icon: "calendar",
  },
  {
    name: "Organizational discovery",
    duration: "45 minutes",
    description: "For organizations exploring workshops or program design.",
    icon: "building",
  },
];

export const FAQ_GROUPS: { title: string; items: { question: string; answer: string }[] }[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "Who do you work with?",
        answer:
          "We work with adults, families and caregivers, and organizations. If you're not sure we're the right fit, request an introductory call and we'll talk it through.",
      },
      {
        question: "How do I get started?",
        answer:
          "Submit a request for services or schedule a free introductory call. We'll follow up within [two business days] to talk about your goals and next steps.",
      },
      {
        question: "Can I refer someone else?",
        answer:
          "Yes. Family members, caregivers, and partner organizations can submit a request on someone's behalf with their permission.",
      },
    ],
  },
  {
    title: "Services & sessions",
    items: [
      {
        question: "Do you offer virtual sessions?",
        answer: "Yes. Many services are available in person or virtually. [Confirm which services and locations.]",
      },
      {
        question: "Where do you provide services?",
        answer: "[Service area.] Virtual sessions may be available outside this area. Contact us to confirm.",
      },
      {
        question: "How long do programs last?",
        answer:
          "Most programs run between 6 and 12 weeks, and individual coaching can continue as long as it's helpful. Your plan is reviewed regularly.",
      },
    ],
  },
  {
    title: "Fees & privacy",
    items: [
      {
        question: "How much do services cost? Do you accept insurance?",
        answer:
          "[Fees, sliding scale, and insurance options are being finalized.] We'll review costs with you before any service begins.",
      },
      {
        question: "Is my information kept confidential?",
        answer:
          "Yes. Your information is protected and only shared with your written permission or when required by law. See our privacy policy for details.",
      },
      {
        question: "Is this crisis or emergency care?",
        answer:
          "No. If you are in danger or having a medical emergency, call 911. For a mental health crisis, call or text 988 to reach the 988 Suicide & Crisis Lifeline, available 24/7.",
      },
    ],
  },
];

export const CRISIS_RESOURCES: { name: string; contact: string; description: string; href: string }[] = [
  {
    name: "Emergency services",
    contact: "Call 911",
    description: "For any situation where someone is in immediate danger.",
    href: "tel:911",
  },
  {
    name: "988 Suicide & Crisis Lifeline",
    contact: "Call or text 988",
    description: "Free, confidential support 24/7 for anyone in emotional distress.",
    href: "tel:988",
  },
  {
    name: "211 community services",
    contact: "Call 211",
    description: "Connects you with local help for housing, food, utilities, and more.",
    href: "tel:211",
  },
];

export const RESOURCE_COLLECTIONS: Feature[] = [
  {
    icon: "book",
    title: "Guides & worksheets",
    description: "Practical tools for routines, budgeting, goal-setting, and stress management. Coming soon.",
  },
  {
    icon: "home",
    title: "Housing toolkit",
    description: "Checklists for applications, documents to gather, and tips for working with landlords. Coming soon.",
  },
  {
    icon: "people",
    title: "For families & caregivers",
    description: "Resources to help you support a loved one while caring for yourself. Coming soon.",
  },
  {
    icon: "building",
    title: "For organizations",
    description: "Briefs and templates for building wellness programs that work. Coming soon.",
  },
];

export const FOUNDER = {
  name: "Angelica Berrios",
  firstName: "Angelica",
  title: "Founder & Principal Consultant",
  credentials: "[Degrees, licenses, and certifications]",
  bio: [
    "Angelica Berrios founded AB Wellness Consulting after [number] years of [field / experience], helping people [what that work involved]. [Replace with Angelica's story in Angelica's own words.]",
    "[What led Angelica to start the company, and the gap Angelica saw in how people were being supported.]",
    "[Angelica's approach in practice: how sessions work, and what clients can expect.]",
  ],
  quote: "[A short quote from Angelica about why this work matters.]",
  highlights: [
    "[Years of experience]",
    "[Specialty or focus area]",
    "[Community involvement or affiliations]",
  ],
};
