import { describe, it, expect, vi, beforeEach } from "vitest";

let nextResult: unknown[] = [];

interface Fragment {
  __fragment: true;
  strings: string[];
  values: unknown[];
}

// Mirrors postgres.js fragment composition: nested `sql` fragments are
// spliced into the parent's raw strings/values, and placeholders are only
// numbered once, at the outermost query, so reused sub-fragments don't
// collide on $1/$2.
function mergeFragment(strings: readonly string[], values: unknown[]): Fragment {
  const outStrings: string[] = [strings[0]];
  const outValues: unknown[] = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i] as Partial<Fragment>;
    if (value && typeof value === "object" && value.__fragment) {
      outStrings[outStrings.length - 1] += value.strings![0];
      for (let j = 0; j < value.values!.length; j++) {
        outValues.push(value.values![j]);
        outStrings.push(value.strings![j + 1]);
      }
    } else {
      outValues.push(value);
      outStrings.push("");
    }
    outStrings[outStrings.length - 1] += strings[i + 1];
  }

  return { __fragment: true, strings: outStrings, values: outValues };
}

function render(frag: Fragment): { text: string; params: unknown[] } {
  let text = frag.strings[0];
  const params: unknown[] = [];
  for (let i = 0; i < frag.values.length; i++) {
    params.push(frag.values[i]);
    text += `$${params.length}${frag.strings[i + 1]}`;
  }
  return { text, params };
}

const sqlMock = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
  const frag = mergeFragment(strings, values);
  return Object.assign(Promise.resolve(nextResult), frag, render(frag));
}) as any;

sqlMock.unsafe = vi.fn((_text: string, _params: unknown[]) => Promise.resolve(nextResult));

vi.mock("postgres", () => ({
  default: () => sqlMock,
}));

const { upsertJobPosting, listJobPostings, updateJobPostingStatus, findJobPostingByPlatformAndExternalId } =
  await import("./index.js");

beforeEach(() => {
  sqlMock.mockClear();
  sqlMock.unsafe.mockClear();
  nextResult = [];
});

describe("upsertJobPosting", () => {
  it("requires platform and external_id", async () => {
    await expect(upsertJobPosting({ platform: "99freelas" })).rejects.toThrow(
      "platform and external_id are required",
    );
    await expect(upsertJobPosting({ external_id: "123" })).rejects.toThrow(
      "platform and external_id are required",
    );
  });

  it("dedupes on (platform, external_id) via ON CONFLICT and returns the upserted row", async () => {
    const row = { id: 1, platform: "99freelas", external_id: "123", title: "Bot" };
    nextResult = [row];

    const result = await upsertJobPosting({
      platform: "99freelas",
      external_id: "123",
      title: "Bot",
      status: "discovered",
    });

    expect(result).toEqual(row);
    const [query, values] = sqlMock.unsafe.mock.calls[0];
    expect(query).toContain("INSERT INTO job_postings");
    expect(query).toContain("ON CONFLICT (platform, external_id)");
    expect(query).toContain("DO UPDATE SET");
    expect(values).toEqual(["99freelas", "123", "Bot", "discovered"]);
  });

  it("excludes undefined fields and never overwrites the conflict key columns", async () => {
    nextResult = [{ id: 1 }];

    await upsertJobPosting({
      platform: "99freelas",
      external_id: "123",
      title: undefined,
      score: 80,
    });

    const [query, values] = sqlMock.unsafe.mock.calls[0];
    expect(values).toEqual(["99freelas", "123", 80]);
    expect(query).not.toMatch(/platform = COALESCE/);
    expect(query).not.toMatch(/external_id = COALESCE/);
    expect(query).toMatch(/score = COALESCE\(EXCLUDED\.score, job_postings\.score\)/);
  });
});

describe("findJobPostingByPlatformAndExternalId", () => {
  it("returns the row when found", async () => {
    const row = { id: 1, platform: "99freelas", external_id: "123" };
    nextResult = [row];

    const result = await findJobPostingByPlatformAndExternalId("99freelas", "123");
    expect(result).toEqual(row);
  });

  it("returns null when not found", async () => {
    nextResult = [];
    const result = await findJobPostingByPlatformAndExternalId("99freelas", "missing");
    expect(result).toBeNull();
  });
});

describe("listJobPostings", () => {
  it("lists all postings ordered by score when no filters are given", async () => {
    nextResult = [{ id: 1 }];

    await listJobPostings({});

    const frag = sqlMock.mock.results.at(-1)!.value;
    expect(frag.text).not.toContain("WHERE");
    expect(frag.text).toContain("ORDER BY score DESC NULLS LAST, created_at DESC");
  });

  it("filters by tier only", async () => {
    nextResult = [{ id: 1 }];

    await listJobPostings({ tier: "APPLY" });

    const frag = sqlMock.mock.results.at(-1)!.value;
    expect(frag.text).toContain("WHERE tier = $1");
    expect(frag.text).not.toContain("AND");
    expect(frag.params).toEqual(["APPLY"]);
  });

  it("filters by status only", async () => {
    nextResult = [{ id: 1 }];

    await listJobPostings({ status: "reviewing" });

    const frag = sqlMock.mock.results.at(-1)!.value;
    expect(frag.text).toContain("WHERE status = $1");
    expect(frag.params).toEqual(["reviewing"]);
  });

  it("combines tier and status filters with AND", async () => {
    nextResult = [{ id: 1 }];

    await listJobPostings({ tier: "APPLY", status: "reviewing" });

    const frag = sqlMock.mock.results.at(-1)!.value;
    expect(frag.text).toContain("tier = $1 AND status = $2");
    expect(frag.params).toEqual(["APPLY", "reviewing"]);
  });
});

describe("updateJobPostingStatus", () => {
  it("updates the status and returns the row", async () => {
    const row = { id: 1, status: "proposal_ready" };
    nextResult = [row];

    const result = await updateJobPostingStatus(1, "proposal_ready");

    expect(result).toEqual(row);
    const frag = sqlMock.mock.results.at(-1)!.value;
    expect(frag.text).toContain("UPDATE job_postings SET status = $1");
    expect(frag.text).toContain("WHERE id = $2");
    expect(frag.params).toEqual(["proposal_ready", 1]);
  });

  it("returns null when the job posting does not exist", async () => {
    nextResult = [];
    const result = await updateJobPostingStatus(999, "proposal_ready");
    expect(result).toBeNull();
  });
});
