import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), "../../..");

/**
 * Backend #14 retired the *old* reporting-template stack, and Frontend #15
 * guarded the frontend against its return. Backend #22 / Frontend #23 bring a
 * document layer back, but deliberately a different one: templates live in the
 * backend behind `/admin/reports/{code}/template`, the licensed designer is a
 * page the deployment hosts, and this repo vendors none of it.
 *
 * What these guards still hold to is exactly what the retired stack got wrong:
 * bundled vendor code, `.mrt` files shipped as frontend assets, standalone
 * designer/viewer routes, the legacy `active_template_version` contract field,
 * and secrets written into source.
 */
const RETIRED_NEEDLES = [/active_template_version/];

/** Anything that reads like a credential pasted into the code. */
const HARDCODED_SECRET = /(licen[sc]e|activation|secret)[_a-z]*\s*[:=]\s*["'][^"']{16,}["']/i;

const CONFIG_FILES = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "Dockerfile",
  "compose.yaml",
  ".env.example",
  ".env.docker.example",
  "README.md",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function scan(paths: string[], needles: RegExp[]) {
  return paths
    .filter((path) => path !== SELF)
    .flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return needles.filter((needle) => needle.test(content)).map(
        (needle) => `${relative(ROOT, path)} matches ${needle}`,
      );
    });
}

describe("retired report surface", () => {
  it("keeps the retired template contract out of the application source", () => {
    expect(scan(walk(join(ROOT, "src")), RETIRED_NEEDLES)).toEqual([]);
  });

  it("keeps the retired template contract out of configuration and documentation", () => {
    expect(scan(CONFIG_FILES.map((file) => join(ROOT, file)), RETIRED_NEEDLES)).toEqual([]);
  });

  it("declares no dependency on the report vendor", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const declared = [
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
    ];
    expect(declared.filter((name) => /stimul/i.test(name))).toEqual([]);
  });

  it("ships no report template asset", () => {
    const assets = walk(join(ROOT, "public")).map((path) => relative(ROOT, path));
    expect(assets.filter((path) => path.endsWith(".mrt"))).toEqual([]);
  });

  it("exposes no designer or standalone viewer route", () => {
    // The document designer is a section of the report configuration page, not
    // a route of its own, and the panel never hosts the viewer.
    const segments = walk(join(ROOT, "src/app"))
      .map((path) => relative(ROOT, path).split(sep));
    expect(segments.filter((parts) => parts.includes("designer"))).toEqual([]);
    expect(
      segments.filter((parts) => parts.includes("reports") && parts.includes("view")),
    ).toEqual([]);
  });

  it("hardcodes no licence or activation secret", () => {
    expect(scan(walk(join(ROOT, "src")), [HARDCODED_SECRET])).toEqual([]);
    expect(scan(CONFIG_FILES.map((file) => join(ROOT, file)), [HARDCODED_SECRET])).toEqual([]);
  });

  it("reads the designer location from the environment only", () => {
    const designer = readFileSync(
      join(ROOT, "src/components/reports/report-document-designer.tsx"),
      "utf8",
    );
    expect(designer).toMatch(/process\.env\.NEXT_PUBLIC_STIMULSOFT_DESIGNER_URL/);
    // No absolute vendor URL may be compiled into the bundle.
    expect(designer).not.toMatch(/https?:\/\/[^\s"']*stimul/i);
  });
});
