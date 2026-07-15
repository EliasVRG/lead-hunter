interface RobotsRule {
  path: string;
  allow: boolean;
}

function parseRobots(text: string, userAgent: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === "disallow" && current && value) {
      current.rules.push({ path: value, allow: false });
    } else if (key === "allow" && current && value) {
      current.rules.push({ path: value, allow: true });
    }
  }

  const ua = userAgent.toLowerCase();
  const specific = groups.filter((g) => g.agents.includes(ua));
  const wildcard = groups.filter((g) => g.agents.includes("*"));
  const chosen = specific.length > 0 ? specific : wildcard;

  return chosen.flatMap((g) => g.rules);
}

export function isPathAllowed(robotsTxt: string, path: string, userAgent = "*"): boolean {
  const rules = parseRobots(robotsTxt, userAgent);
  let best: RobotsRule | null = null;

  for (const rule of rules) {
    if (path.startsWith(rule.path) && (!best || rule.path.length > best.path.length)) {
      best = rule;
    }
  }

  return best ? best.allow : true;
}

export async function isAllowedByRobots(url: string, userAgent = "*"): Promise<boolean> {
  try {
    const target = new URL(url);
    const robotsUrl = `${target.protocol}//${target.host}/robots.txt`;
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return true;
    const text = await res.text();
    return isPathAllowed(text, target.pathname || "/", userAgent);
  } catch {
    return true;
  }
}
