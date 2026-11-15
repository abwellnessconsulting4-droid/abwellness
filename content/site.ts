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

/** Credibility facts shown on the home page and elsewhere. */
export const CREDENTIALS = [
  "20+ years in social work, behavioral health & housing",
  "Led by Angelica Berrios, MSW",
  "Services in English & Spanish",
];

export const LANGUAGES_NOTE = "Services available in English and Spanish.";

export const AUDIENCES: Feature[] = [
  {
    icon: "heart",
    title: "Individuals",
    description:
      "Adults facing housing instability or homelessness, mental health challenges, substance use, or other complex needs who want practical support and a clear plan.",
  },
  {
    icon: "people",
    title: "Families & caregivers",
    description:
      "Families and support networks helping a loved one, who need guidance, coordination with providers, and room to care for themselves too.",
  },
  {
    icon: "building",
    title: "Organizations",
    description:
      "Supportive housing providers, behavioral health agencies, and community-based organizations strengthening their staff, programs, and operations.",
  },
];

/** Services for people and families. */
export const INDIVIDUAL_SERVICES: Feature[] = [
  {
    icon: "home",
    title: "Housing stabilization support",
    description:
      "Guidance through housing searches, applications, and the steps that help keep a home stable, including supportive and transitional housing.",
    points: ["Housing readiness and service planning", "Application and document support", "Ongoing stability check-ins"],
  },
  {
    icon: "chat",
    title: "Resource navigation & care coordination",
    description:
      "Help finding and connecting with the healthcare, behavioral health, benefits, and community services you need, and keeping them working together.",
    points: ["Referrals and warm hand-offs", "Coordination with your providers", "Benefits and resource navigation"],
  },
  {
    icon: "checkCircle",
    title: "Case management support",
    description:
      "A consistent point of contact who helps you set goals, track progress, and stay on top of appointments and paperwork.",
    points: ["Individual service plan", "Goal tracking and follow-up", "Advocacy alongside you"],
  },
  {
    icon: "sparkles",
    title: "Skill-building & coping strategies",
    description:
      "Practical, CBT- and ABA-informed skill development for everyday life: coping strategies, emotional regulation, and constructive responses to challenges.",
    points: ["Coping and stress strategies", "Daily living and organization skills", "Building healthy routines"],
  },
  {
    icon: "users",
    title: "Family & caregiver support",
    description:
      "Guidance for the people supporting someone else, so the whole household can move forward together.",
    points: ["Caregiver planning", "Communication strategies", "Respite and resource referrals"],
  },
];

/** Services for organizations. */
export const ORGANIZATION_SERVICES: Feature[] = [
  {
    icon: "people",
    title: "Staff training & development",
    description:
      "Training that helps frontline staff strengthen communication, documentation, service delivery, and trauma-informed, person-centered practice.",
    points: ["Trauma-informed care", "Motivational interviewing", "ABA- and CBT-informed strategies"],
  },
  {
    icon: "shield",
    title: "Supervisory & leadership support",
    description:
      "Coaching and tools for supervisors to build accountability, support their teams, and lead with integrity.",
    points: ["Supervisory skill-building", "Staff performance development", "Collaborative problem-solving"],
  },
  {
    icon: "building",
    title: "Program development & consultation",
    description:
      "Consultation to identify service gaps, design or improve programs, and raise the quality of support your organization provides.",
    points: ["Program assessment", "Housing service coordination", "Service improvement plans"],
  },
  {
    icon: "checkCircle",
    title: "Compliance & operations",
    description:
      "Help putting effective policies, procedures, and workflows in place so services are consistent, compliant, and sustainable.",
    points: ["Policy and procedure implementation", "Quality assurance practices", "Workflow enhancement"],
  },
];

export const SERVICES: Feature[] = [...INDIVIDUAL_SERVICES, ...ORGANIZATION_SERVICES];

export const SERVICE_TRACKS = [
  {
    id: "individuals",
    title: "For individuals & families",
    description: "Practical, person-centered support for housing, resources, and everyday skills.",
    icon: "heart" as IconName,
    services: INDIVIDUAL_SERVICES,
  },
  {
    id: "organizations",
    title: "For organizations",
    description: "Training, consultation, and operational support for organizations that serve their communities.",
    icon: "building" as IconName,
    services: ORGANIZATION_SERVICES,
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
      "A structured start for building practical skills, positive coping strategies, and steadier daily routines.",
    audience: "Individuals ready to build skills and a plan they believe in",
    format: "One-on-one, in person or virtual [confirm]",
    duration: "8 weeks [confirm]",
    includes: [
      "Intake and individualized service plan",
      "Coping and emotional regulation skills",
      "Daily living and organization skills",
      "Progress review",
    ],
  },
  {
    name: "Stable Ground",
    summary:
      "Focused housing stabilization support, from paperwork and applications to move-in and keeping a home.",
    audience: "Individuals and families facing housing instability or transitions",
    format: "One-on-one with care coordination",
    duration: "12 weeks [confirm]",
    includes: [
      "Housing readiness and service plan",
      "Document and application support",
      "Coordination with housing providers and agencies",
      "Stability check-ins",
    ],
  },
  {
    name: "Thrive Together",
    summary:
      "Small-group workshops that build practical skills and a sense of community along the way.",
    audience: "Adults who learn best alongside others",
    format: "Small groups, English or Spanish [confirm]",
    duration: "6 sessions [confirm]",
    includes: ["Coping and life skills workshops", "Peer connection", "Take-home tools and worksheets"],
  },
  {
    name: "Staff Development Series",
    summary:
      "Training for frontline and supervisory staff in human services, housing, and behavioral health settings.",
    audience: "Supportive housing, behavioral health, and community organizations",
    format: "On-site or virtual training sessions",
    duration: "Custom engagements",
    includes: [
      "Trauma-informed, person-centered practice",
      "Documentation and service delivery",
      "ABA- and CBT-informed strategies",
      "Supervisory and leadership skills",
    ],
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
    icon: "shield",
    title: "Trauma-informed",
    description: "We recognize the impact of trauma and build safety, trust, and choice into every interaction.",
  },
  {
    icon: "heart",
    title: "Person-centered",
    description: "Your goals lead. We listen first and build every plan around your needs and strengths.",
  },
  {
    icon: "sparkles",
    title: "Recovery-oriented",
    description: "We believe in growth and support each person's path toward independence and wellbeing.",
  },
  {
    icon: "book",
    title: "Evidence-informed",
    description:
      "We draw on proven approaches, including motivational interviewing and CBT- and ABA-informed strategies, within professional scope of practice.",
  },
  {
    icon: "people",
    title: "Culturally responsive & bilingual",
    description: "We respect each person's background and lived experience, and we work in English and Spanish.",
  },
  {
    icon: "lock",
    title: "Confidential by design",
    description: "Your information is private, protected, and only shared with your permission or as the law requires.",
  },
];

export const VALUES: Feature[] = [
  { icon: "heart", title: "Dignity & respect", description: "Every person is treated with dignity, and their experiences and strengths are respected." },
  { icon: "lock", title: "Confidentiality", description: "Trust starts with protecting the information people share with us." },
  { icon: "shield", title: "Ethical responsibility", description: "Honest guidance, clear expectations, and practice within professional standards." },
  { icon: "chat", title: "Advocacy", description: "We stand alongside the people we serve and help their voices be heard." },
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
          "We work with adults and families, including people facing housing instability, mental health challenges, or substance use, and with organizations such as supportive housing providers, behavioral health agencies, and community-based programs. If you're not sure we're the right fit, request an introductory call and we'll talk it through.",
      },
      {
        question: "Do you offer services in Spanish?",
        answer: "Yes. Services are available in English and Spanish. Sí, ofrecemos servicios en español.",
      },
      {
        question: "Do you work with organizations?",
        answer:
          "Yes. We provide staff training and development, supervisory support, program development and consultation, and help with policies, procedures, and compliance practices. Request an organizational discovery call to talk about your needs.",
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
        question: "Do you provide therapy or clinical treatment?",
        answer:
          "No. We provide practical support, case management, skill-building, and consultation. We are not a substitute for therapy, medical care, or substance use treatment, and we can help connect you with licensed providers. [Confirm with Angelica.]",
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
  postNominal: "MSW",
  photo: "/images/angelica-berrios.jpg",
  title: "Founder & Principal Consultant",
  credentials: "Master of Social Work (MSW), Yeshiva University",
  alumniOf: "Yeshiva University",
  languages: ["English", "Spanish"],
  specialties: [
    "Social Work",
    "Behavioral Health",
    "Housing Services",
    "Staff Development",
    "Clinical and Program Consultation",
  ],
  /** Short introduction for the About and home pages. */
  summary: [
    "Angelica Berrios is a dedicated social services professional with over 20 years of experience in social work, behavioral health, mental health services, substance use support, housing services, case management, and community-based care coordination.",
    "She has worked with individuals and families from diverse backgrounds, including people experiencing homelessness, housing instability, mental health challenges, substance use disorders, and other complex psychosocial needs. Today she also supports organizations through staff training, program development, and professional consultation.",
  ],
  /** Full biography for the founder page (client-provided). */
  bio: [
    "Angelica Berrios is a dedicated social services professional with over 20 years of experience in social work, behavioral health, mental health services, substance use support, housing services, case management, and community-based care coordination. She holds a Master of Social Work (MSW) degree from Yeshiva University and brings extensive experience in program leadership, client advocacy, staff development, service coordination, professional consultation, and administrative operations.",
    "Throughout her career, Angelica has worked with individuals and families from diverse backgrounds, including people experiencing homelessness, housing instability, mental health challenges, substance use disorders, and other complex psychosocial needs. Her extensive housing experience includes supportive housing, transitional housing, housing stabilization, service planning, resource coordination, and collaboration with community-based organizations and multidisciplinary professionals to promote housing stability, independence, and improved quality of life.",
    "Angelica has experience supporting staff and clients through training, education, and skill development informed by Applied Behavior Analysis (ABA) and Cognitive Behavioral Therapy (CBT) approaches. Her work emphasizes the development of practical skills, behavioral awareness, emotional regulation, positive coping strategies, and constructive responses to challenging situations. She recognizes the importance of individualized support, consistent implementation of appropriate strategies, and collaboration among staff, clients, and service providers to promote meaningful outcomes. The use of these approaches is guided by individual needs, professional scope of practice, and applicable clinical oversight.",
    "In addition to her direct service experience, Angelica brings a strong background in staff training, supervisory leadership, program development, policy and procedure implementation, quality assurance, regulatory compliance, and operational management. She supports professional development by helping staff strengthen communication, documentation, service delivery, accountability, and adherence to organizational standards. Her leadership approach emphasizes professional integrity, collaborative problem-solving, trauma-informed practices, and the development of effective, person-centered services.",
    "Angelica also provides professional consultation informed by her extensive experience in social services, housing programs, behavioral health, and organizational operations. Her areas of professional expertise include program improvement, housing service coordination, staff performance development, workflow enhancement, compliance practices, resource navigation, and the implementation of procedures that support effective and consistent service delivery. She is committed to helping organizations identify service gaps, strengthen operational practices, and improve the quality of support provided to the populations they serve.",
    "As a bilingual professional fluent in English and Spanish, Angelica values culturally responsive communication and recognizes the importance of building trusting relationships with individuals, families, staff, and community partners. Her practice philosophy is grounded in dignity, confidentiality, ethical responsibility, advocacy, and respect for the unique experiences and strengths of every individual.",
    "With a Master of Social Work degree from Yeshiva University and more than two decades of experience across social work, housing, and behavioral health services, Angelica remains committed to professional growth and the advancement of evidence-informed, recovery-oriented, and person-centered approaches. Her professional interests include trauma-informed care, motivational interviewing, behavioral health education, psychosocial rehabilitation, staff development, and the integration of appropriate ABA- and CBT-informed strategies into service environments.",
    "Angelica's combination of extensive field experience, housing expertise, leadership capabilities, training experience, and professional consultation reflects her commitment to strengthening human services and promoting positive outcomes for individuals, organizations, and communities.",
  ],
  mission:
    "To contribute to environments where individuals are treated with dignity, staff are equipped with the knowledge and skills necessary to perform effectively, and organizations are supported in delivering ethical, responsive, and high-quality services.",
  highlights: [
    "20+ years in social work, behavioral health, and housing services",
    "Master of Social Work (MSW), Yeshiva University",
    "Bilingual: English and Spanish",
    "Trauma-informed, person-centered practice",
  ],
  expertise: [
    "Program improvement",
    "Housing service coordination",
    "Staff performance development",
    "Workflow enhancement",
    "Compliance practices",
    "Resource navigation",
  ],
};
