import "@once-ui-system/core/css/styles.css";
import "@once-ui-system/core/css/tokens.css";
import "@/resources/custom.css";
import "./globals.css";

import classNames from "classnames";
import { Column, Flex, Meta, Schema, ThemeInit } from "@once-ui-system/core";
import { Providers } from "@/components/providers";
import { dataStyle, fonts, style } from "@/resources/once-ui.config";
import { meta, schema } from "@/resources/seo";

export async function generateMetadata() {
  return Meta.generate({
    title: meta.home.title,
    description: meta.home.description,
    baseURL: meta.home.canonical,
    path: meta.home.path,
    image: meta.home.image,
    robots: meta.home.robots,
    canonical: meta.home.canonical,
  });
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
