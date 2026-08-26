import type { IconType } from "react-icons";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import { HiOutlineEnvelope, HiOutlinePaperAirplane } from "react-icons/hi2";

export const iconLibrary: Record<string, IconType> = {
  instagram: FaInstagram,
  linkedin: FaLinkedinIn,
  facebook: FaFacebookF,
  mail: HiOutlineEnvelope,
  send: HiOutlinePaperAirplane,
};

export type IconLibrary = typeof iconLibrary;
export type IconName = keyof IconLibrary;
