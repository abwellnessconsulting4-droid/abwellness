import { createElement } from "react";
import type { IconType } from "react-icons";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import {
  Accessibility,
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,

  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  CircleUserRound,
  ClipboardList,
  Clock,
  Compass,
  GraduationCap,
  HandHeart,
  Heart,
  HeartHandshake,
  House,
  Info,
  Languages,
  Library,
  LifeBuoy,
  Lock,
  Mail,
  MapPin,
  Menu,
  MessagesSquare,
  Phone,
  Plus,
  Route,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon set: Lucide (https://lucide.dev), with Font Awesome for brand logos
 * (Lucide 1.x has none). Once UI sizes icons with font-size, so each Lucide
 * icon renders at 1em with one consistent stroke weight.
 */
function lucide(Icon: LucideIcon): IconType {
  const Wrapped = (props: Record<string, unknown>) => createElement(Icon, { size: "1em", strokeWidth: 1.75, absoluteStrokeWidth: false, "aria-hidden": true, ...props });
  Wrapped.displayName = `Lucide(${Icon.displayName ?? "Icon"})`;
  return Wrapped as unknown as IconType;
}

// Merged over Once UI's built-in icons by IconProvider; the chevrons, check,
// plus, info, and close are overridden so built-in components match too.
export const iconLibrary: Record<string, IconType> = {
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  facebook: FaFacebookF,
  mail: lucide(Mail),
  send: lucide(Send),
  menu: lucide(Menu),
  close: lucide(X),
  arrowRight: lucide(ArrowRight),
  phone: lucide(Phone),
  mapPin: lucide(MapPin),
  clock: lucide(Clock),
  calendar: lucide(CalendarDays),
  calendarCheck: lucide(CalendarCheck),
  heart: lucide(Heart),
  home: lucide(House),
  language: lucide(Languages),
  book: lucide(BookOpen),
  building: lucide(Building2),
  chat: lucide(MessagesSquare),
  checkCircle: lucide(CircleCheck),
  lifebuoy: lucide(LifeBuoy),
  lock: lucide(Lock),
  shield: lucide(ShieldCheck),
  sparkles: lucide(Sparkles),
  people: lucide(UsersRound),
  users: lucide(UsersRound),
  account: lucide(CircleUserRound),
  // Page heroes
  heartHandshake: lucide(HeartHandshake),
  handHeart: lucide(HandHeart),
  graduationCap: lucide(GraduationCap),
  compass: lucide(Compass),
  route: lucide(Route),
  library: lucide(Library),
  help: lucide(CircleHelp),
  clipboard: lucide(ClipboardList),
  award: lucide(Award),
  scale: lucide(Scale),
  accessibility: lucide(Accessibility),
  // Once UI built-ins, restyled
  chevronUp: lucide(ChevronUp),
  chevronDown: lucide(ChevronDown),
  chevronLeft: lucide(ChevronLeft),
  chevronRight: lucide(ChevronRight),
  check: lucide(CircleCheck), // Once UI's built-in "check" is a circled check (checkboxes use "checkbox")
  plus: lucide(Plus),
  info: lucide(Info),
};

export type IconLibrary = typeof iconLibrary;
export type IconName = keyof IconLibrary;
