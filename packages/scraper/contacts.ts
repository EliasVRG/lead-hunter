export interface ContactInfo {
  emails: string[];
  phones: string[];
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g;

export function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) ?? [];
  return [...new Set(matches)].filter((e) => {
    const blocked = ["@example.com", "@domain.com", "@email.com", "@site.com"];
    return !blocked.some((b) => e.endsWith(b));
  });
}

export function extractPhones(html: string): string[] {
  const matches = html.match(PHONE_REGEX) ?? [];
  return [...new Set(matches)];
}
