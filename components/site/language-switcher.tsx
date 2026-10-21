"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { Icon, Row } from "@once-ui-system/core";

/**
 * Machine translation via Google's Website Translator script. The script only loads
 * after a visitor picks a language (stored in Google's `googtrans` cookie), so most
 * visitors never contact Google. Public site only: never render this on portal or
 * admin pages, where translated text would be sent to Google.
 */

// English plus ten of the most widely spoken languages at home in the US.
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "tl", label: "Tagalog" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" },
  { code: "ko", label: "한국어" },
  { code: "ru", label: "Русский" },
  { code: "ht", label: "Kreyòl ayisyen" },
  { code: "pt", label: "Português" },
] as const;

const SCRIPT_ID = "google-translate-script";

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate: {
        TranslateElement: new (
          options: { pageLanguage: string; includedLanguages: string; autoDisplay: boolean },
          elementId: string,
        ) => unknown;
      };
    };
  }
}

function readLanguage(): string {
  const match = document.cookie.match(/(?:^|;\s*)googtrans=\/en\/([^;]+)/);
  const code = match ? decodeURIComponent(match[1]) : "en";
  return LANGUAGES.some((language) => language.code === code) ? code : "en";
}

function writeLanguage(code: string) {
  // Google sets the cookie on the host and on the parent domain; clear every variant.
  const host = window.location.hostname;
  const parent = host.split(".").slice(-2).join(".");
  for (const domain of ["", host, `.${host}`, `.${parent}`]) {
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ""}`;
  }
  if (code !== "en") {
    document.cookie = `googtrans=/en/${code}; path=/; SameSite=Lax`;
  }
  window.location.reload();
}

/**
 * Google Translate replaces text nodes React still references; React then throws
 * when it later removes or reorders them. Tolerate nodes that were moved
 * (workaround from facebook/react#11538). Applied only while translation is active.
 */
function tolerateTranslatedDom() {
  const proto = Node.prototype as Node & { __abwPatched?: boolean };
  if (proto.__abwPatched) return;
  proto.__abwPatched = true;

  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) return node;
    return insertBefore.call(this, node, reference) as T;
  };
}

const subscribe = () => () => {};

export function LanguageSwitcher() {
  const selectId = useId();
  const current = useSyncExternalStore(subscribe, readLanguage, () => "en");

  useEffect(() => {
    if (current === "en" || document.getElementById(SCRIPT_ID)) return;

    tolerateTranslatedDom();
    window.googleTranslateElementInit = () => {
      new window.google!.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: LANGUAGES.map((language) => language.code).join(","),
          autoDisplay: false,
        },
        "google-translate-element",
      );
    };
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);
  }, [current]);

  return (
    <Row gap="8" vertical="center" className="notranslate" translate="no">
      <Icon name="language" size="s" onBackground="neutral-medium" decorative />
      <label htmlFor={selectId} className="sr-only">
        Translate this page
      </label>
      <select
        id={selectId}
        className="language-select"
        value={current}
        onChange={(event) => writeLanguage(event.target.value)}
      >
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} lang={language.code}>
            {language.label}
          </option>
        ))}
      </select>
      <div id="google-translate-element" hidden />
    </Row>
  );
}
