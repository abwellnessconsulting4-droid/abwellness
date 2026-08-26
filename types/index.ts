export interface SubscribeRequest {
  email: string;
}

export interface SubscribeResponse {
  success: boolean;
  message: string;
  alreadySubscribed?: boolean;
  code?: "invalid_email" | "duplicate" | "config_error" | "server_error";
}

export interface EmailSubscriber {
  email: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export interface SocialLink {
  label: string;
  href: string;
  icon: "instagram" | "linkedin" | "facebook" | "mail";
}
