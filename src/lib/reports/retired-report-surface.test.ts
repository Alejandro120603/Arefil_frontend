import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), "../../..");

/**
 * Backend #14 retired the reporting-template stack: there is no `GET/PUT
 * /api/reports/{code}/template`, no `.mrt` asset, and no `active_template_version`
 * on the public contract. The official experience is Report Builder -> preview web
 * -> XLSX, so the frontend must not reference any of it. These guards fail loudly
 * if the retired surface is reintroduced.
 *
 * The vendor needle is matched on the `stimul` prefix on purpose: the full product
 * name must not appear anywhere in active code, this guard included.
 */
const RETIRED_NEEDLES = [/stimul/i, /\.mrt\b/, /active_template_version/];

/**
 * The retired vocabulary the user must never read again (Frontend #15 §22). The
 * shipped copy says Generar, Configurar, Vista previa and Descargar Excel instead.
 */
const RETIRED_COPY = [/template/i, /plantilla/i, /\bMRT\b/, /Diseñador?\b/, /\bVisor\b/];

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

function scan(paths: string[]) {
  return paths
    .filter((path) => path !== SELF)
    .flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return RETIRED_NEEDLES.filter((needle) => needle.test(content)).map(
        (needle) => `${relative(ROOT, path)} matches ${needle}`,
      );
    });
}

describe("retired report surface", () => {
  it("keeps the retired template stack out of the application source", () => {
    expect(scan(walk(join(ROOT, "src")))).toEqual([]);
  });

  it("keeps the retired template stack out of configuration and documentation", () => {
    expect(scan(CONFIG_FILES.map((file) => join(ROOT, file)))).toEqual([]);
  });

  it("declares no dependency on the retired report vendor", () => {
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
    const segments = walk(join(ROOT, "src/app"))
      .map((path) => relative(ROOT, path).split(sep));
    expect(segments.filter((parts) => parts.includes("designer"))).toEqual([]);
    expect(
      segments.filter((parts) => parts.includes("reports") && parts.includes("view")),
    ).toEqual([]);
  });

  it("keeps the retired vocabulary out of the shipped user interface", () => {
    const shipped = [...walk(join(ROOT, "src/app")), ...walk(join(ROOT, "src/components"))]
      .filter((path) => !/\.test\.[jt]sx?$/.test(path));
    const found = shipped.flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return RETIRED_COPY.filter((needle) => needle.test(content)).map(
        (needle) => `${relative(ROOT, path)} matches ${needle}`,
      );
    });
    expect(found).toEqual([]);
  });

  it("exposes no template accessor on the reports API client", () => {
    const client = readFileSync(join(ROOT, "src/lib/api/reports.ts"), "utf8");
    expect(client).not.toMatch(/template/i);
    expect(client).not.toMatch(/ReportTemplate/);
  });
});
