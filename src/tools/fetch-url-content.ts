import { log } from "@clack/prompts";
import { tool } from "ai";
import { JSDOM } from "jsdom";
import { z } from "zod";

export function createFetchUrlContentTool() {
  return tool({
    description: "Fetches and extracts relevant text content from a given URL.",
    parameters: z.object({ url: z.string() }),
    execute: async ({ url }) => {
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
      let links = extractLinks(html, url);
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

function extractLinks(html: string, baseUrl: string): Link[] {
  let dom = new JSDOM(html);
  let document = dom.window.document;
  let links: Link[] = [];

  let anchorElements = document.querySelectorAll("a[href]");
  anchorElements.forEach((a) => {
    let href = a.getAttribute("href");
    if (!href) return;
    let url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    let description = a.textContent?.trim() || "";
    links.push({ url: url.href, description });
  });

  let uniqueLinksMap = new Map<string, Link>();
  for (let link of links) {
    if (!uniqueLinksMap.has(link.url)) {
      uniqueLinksMap.set(link.url, link);
    }
  }
  return Array.from(uniqueLinksMap.values());
}
