import "@once-ui-system/core/css/styles.css";
import "@once-ui-system/core/css/tokens.css";
import "@/resources/custom.css";
import "./globals.css";

import classNames from "classnames";
import type { Viewport } from "next";
import { Column, Flex, Meta, Schema, ThemeInit } from "@once-ui-system/core";
import { Providers } from "@/components/providers";
import { SITE_NAME } from "@/lib/constants";
import { dataStyle, fonts, style } from "@/resources/once-ui.config";
import { baseURL, meta, schema } from "@/resources/seo";

export const viewport: Viewport = {
  themeColor: "#001428",
  colorScheme: "dark",
};

export async function generateMetadata() {
  const generated = Meta.generate({
    title: meta.home.title,
    description: meta.home.description,
    baseURL: meta.home.canonical,
    path: meta.home.path,
    robots: meta.home.robots,
    canonical: meta.home.canonical,
  });

  return {
    ...generated,
    metadataBase: new URL(baseURL),
    applicationName: SITE_NAME,
    openGraph: {
      title: meta.home.title,
      description: meta.home.description,
      type: "website",
      url: meta.home.canonical,
      siteName: SITE_NAME,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: meta.home.title,
      description: meta.home.description,
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <Flex
      as="html"
      lang="en"
      fill
      suppressHydrationWarning
      className={classNames(
        fonts.heading.variable,
        fonts.body.variable,
        fonts.label.variable,
        fonts.code.variable,
      )}
    >
      <head>
        <Schema
          as={schema.as}
          title={schema.title}
          description={schema.description}
          baseURL={schema.baseURL}
          path={schema.path}
          image={schema.image}
        />
        <ThemeInit
          config={{
            theme: style.theme,
            brand: style.brand,
            accent: style.accent,
            neutral: style.neutral,
            solid: style.solid,
            "solid-style": style.solidStyle,
            border: style.border,
            surface: style.surface,
            transition: style.transition,
            scaling: style.scaling,
            "viz-style": dataStyle.variant,
          }}
        />
      </head>
      <Providers>
        <Column as="body" fillWidth margin="0" padding="0" minHeight="100%">
          {children}
        </Column>
      </Providers>
    </Flex>
  );
}
