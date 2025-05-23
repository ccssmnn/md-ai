import { log } from "@clack/prompts";
import { tool } from "ai";
import { JSDOM } from "jsdom";
import { z } from "zod";

export function createFetchUrlContentTool() {
  return tool({
    description:
      "Fetches and extracts relevant text content from a given URL. Optionally filters extracted links by regex patterns and limits the number of links.",
    parameters: z.object({
      url: z.string(),
      linkPatterns: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of regex patterns. Only links whose URLs match all patterns will be included.",
        ),
      maxLinks: z
        .number()
        .optional()
        .describe(
          "Optional maximum number of links to return. Defaults to 20.",
        ),
    }),
    execute: async ({ url, linkPatterns, maxLinks }) => {
      let response = await fetch(url);
      if (!response.ok) {
        log.step(`failed to fetch url: ${url}`);
        return {
          success: false,
          status: response.status,
          statusText: response.statusText,
        };
      }
      let html = await response.text();
      let content = extractRelevantContent(html);
      let links = extractLinks(html, url, linkPatterns, maxLinks);
      log.step(`fetch url: ${url}`);
      return { success: true, content, links };
    },
  });
}

import { Readability } from "@mozilla/readability";

function extractRelevantContent(html: string): string {
  let dom = new JSDOM(html);
  let document = dom.window.document;

  // Use Readability to parse the main article content
  let reader = new Readability(document);
  let article = reader.parse();

  if (!article || !article.textContent) {
    // fallback to body text if Readability fails
    return document.body.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  return article.textContent.replace(/\s+/g, " ").trim();
}

type Link = { url: string; description: string };

function extractLinks(
  html: string,
  baseUrl: string,
  linkPatterns?: string[],
  maxLinks?: number,
): Link[] {
  let dom = new JSDOM(html);
  let document = dom.window.document;
  let links: Link[] = [];

  let anchorElements = document.querySelectorAll("a[href]");
  anchorElements.forEach((a) => {
    let href = a.getAttribute("href");
    if (!href) return;
    // Ignore same-page anchor links
    if (href.startsWith("#")) {
      return;
    }

    let url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    let description = a.textContent?.trim() || "";

    // Filter out links with empty description or common navigation keywords
    if (
      !description ||
      /^(home|about|contact|privacy|terms|login|signup|register)$/i.test(
        description,
      )
    ) {
      return;
    }

    // If linkPatterns provided, filter links that do not match any pattern
    if (linkPatterns && linkPatterns.length > 0) {
      let matchesPattern = linkPatterns.every((pattern) => {
        try {
          let regex = new RegExp(pattern);
          return regex.test(url.href);
        } catch {
          // fallback to includes if invalid regex
          return url.href.includes(pattern);
        }
      });
      if (!matchesPattern) {
        return;
      }
    }

    links.push({ url: url.href, description });
  });

  let uniqueLinksMap = new Map<string, Link>();
  for (let link of links) {
    if (!uniqueLinksMap.has(link.url)) {
      uniqueLinksMap.set(link.url, link);
    }
  }

  // Limit to maxLinks or default 20
  return Array.from(uniqueLinksMap.values()).slice(0, maxLinks ?? 20);
}
