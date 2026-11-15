"use client";

import { useEffect, useState } from "react";
import { Icon } from "@once-ui-system/core";

/**
 * "Back to top" button for long public pages. A real <button> (keyboard and
 * screen-reader friendly), shown after scrolling, honoring reduced motion,
 * and moving focus back to the main content after scrolling.
 */
export function BackToTop({ offset = 600 }: { offset?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVisible(window.scrollY > offset));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [offset]);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // Keyboard and screen-reader users continue from the top of the page.
    document.getElementById("main-content")?.focus({ preventScroll: true });
  };

  return (
    <button type="button" className="back-to-top" data-visible={visible} aria-hidden={!visible} tabIndex={visible ? 0 : -1} onClick={toTop} aria-label="Back to top">
      <Icon name="chevronUp" size="s" decorative />
    </button>
  );
}
