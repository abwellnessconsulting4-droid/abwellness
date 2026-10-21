import type { IconType } from "react-icons";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import {
  HiOutlineArrowRight,
  HiOutlineBars3,
  HiOutlineBookOpen,
  HiOutlineBuildingOffice2,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineEnvelope,
  HiOutlineHeart,
  HiOutlineHome,
  HiOutlineLanguage,
  HiOutlineLifebuoy,
  HiOutlineLockClosed,
  HiOutlineMapPin,
  HiOutlinePaperAirplane,
  HiOutlinePhone,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineUserGroup,
  HiOutlineUsers,
  HiOutlineXMark,
} from "react-icons/hi2";

// Merged over Once UI's built-in icons (chevronDown, info, check, …) by IconProvider.
export const iconLibrary: Record<string, IconType> = {
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  facebook: FaFacebookF,
  mail: HiOutlineEnvelope,
  send: HiOutlinePaperAirplane,
  menu: HiOutlineBars3,
  close: HiOutlineXMark,
  arrowRight: HiOutlineArrowRight,
  phone: HiOutlinePhone,
  mapPin: HiOutlineMapPin,
  clock: HiOutlineClock,
  calendar: HiOutlineCalendarDays,
  heart: HiOutlineHeart,
  home: HiOutlineHome,
  language: HiOutlineLanguage,
  book: HiOutlineBookOpen,
  building: HiOutlineBuildingOffice2,
  chat: HiOutlineChatBubbleLeftRight,
  checkCircle: HiOutlineCheckCircle,
  lifebuoy: HiOutlineLifebuoy,
  lock: HiOutlineLockClosed,
  shield: HiOutlineShieldCheck,
  sparkles: HiOutlineSparkles,
  people: HiOutlineUserGroup,
  users: HiOutlineUsers,
};

export type IconLibrary = typeof iconLibrary;
export type IconName = keyof IconLibrary;
