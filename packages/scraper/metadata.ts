import { chromium } from "playwright";

export interface SocialLinks {
  linkedin: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface FullMetadata {
  title: string;
  description: string;
  socials: SocialLinks;
  bodyText: string;
}

export async function crawlPage(url: string): Promise<FullMetadata> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url, { timeout: 15000, waitUntil: "domcontentloaded" });

    const title = await page.title();
    const description = await page
      .$eval('meta[name="description"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => "");

    const links = await page.$$eval("a[href]", (els) =>
      els.map((a) => (a as any).href),
    );

    const bodyText = await page.$eval("body", (el) => el.textContent ?? "").catch(() => "");

    const socials: SocialLinks = {
      linkedin: links.find((l: string) => l.includes("linkedin.com/company")) ?? null,
      instagram: links.find((l: string) => l.includes("instagram.com/")) ?? null,
      facebook: links.find((l: string) => l.includes("facebook.com/") || l.includes("fb.com/")) ?? null,
    };

    return { title, description, socials, bodyText };
  } finally {
    await browser.close();
  }
}
