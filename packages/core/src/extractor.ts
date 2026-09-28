import * as ts from "typescript";
import * as path from "node:path";
import { builtinModules } from "node:module";
import type {
  CodeLink,
  GraphDataResponse,
  LinkRelation,
  ReviewIssue,
} from "@codemap/shared";
import { isCode, type Snapshot } from "./snapshot";

export interface ImportExtractor {
  parse(
    snapshot: Snapshot,
    side: "baseline" | "current",
  ): { graph: GraphDataResponse; issues: ReviewIssue[] };
}
const extensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".json",
];
const builtins = new Set(
  builtinModules.flatMap((name) => [name, "node:" + name]),
);
const prefix = "/__codemap__/";
const key = (name: string) => name.replace(/\\/g, "/").slice(prefix.length);
export class TypeScriptSnapshotExtractor implements ImportExtractor {
  parse(snapshot: Snapshot, side: "baseline" | "current") {
    const issues: ReviewIssue[] = [];
    const links = new Map<string, CodeLink>();
    const files = snapshot.files;
    const readJson = (name: string): Record<string, any> | undefined => {
      const parsed = ts.parseConfigFileTextToJson(name, files.get(name) ?? "");
      if (
        parsed.error ||
        !parsed.config ||
        typeof parsed.config !== "object" ||
        Array.isArray(parsed.config)
      ) {
        issues.push({
          path: name,
          snapshot: side,
          message:
            "Invalid configuration JSON; dependency resolution may be incomplete.",
        });
        return;
      }
      return parsed.config as Record<string, any>;
    };
    const directories = new Set<string>([prefix.slice(0, -1)]);
    for (const name of files.keys()) {
      let dir = path.posix.dirname(prefix + name);
      while (dir.startsWith(prefix.slice(0, -1))) {
        directories.add(dir);
        dir = path.posix.dirname(dir);
      }
    }
    const host: ts.ParseConfigHost = {
      useCaseSensitiveFileNames: true,
      fileExists: (name) => name.startsWith(prefix) && files.has(key(name)),
      readFile: (name) =>
        name.startsWith(prefix) ? files.get(key(name)) : undefined,
      directoryExists: (name) => directories.has(name),
      readDirectory: () => [],
      realpath: (name) => name,
    };
    const configs = new Map<string, ts.CompilerOptions>();
    const packages = new Map<
      string,
      { dir: string; data: Record<string, any> }
    >();
    for (const name of files.keys()) {
      if (path.posix.basename(name) === "package.json") {
        const data = readJson(name);
        if (typeof data?.name === "string")
          packages.set(data.name, { dir: path.posix.dirname(name), data });
      }
    }
    const optionsFor = (name: string) => {
      let dir = path.posix.dirname(name);
      let config = "";
      while (true) {
        for (const candidate of ["tsconfig.json", "jsconfig.json"]) {
          const id = path.posix.join(dir, candidate);
          if (files.has(id)) {
            config = id;
            break;
          }
        }
        if (config || dir === ".") break;
        dir = path.posix.dirname(dir);
      }
      if (!configs.has(config)) {
        let options: ts.CompilerOptions = {
          allowJs: true,
          resolveJsonModule: true,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          module: ts.ModuleKind.ESNext,
        };
        if (config) {
          const parsed = ts.parseJsonConfigFileContent(
            readJson(config) ?? {},
            host,
            path.posix.dirname(prefix + config),
            options,
            prefix + config,
          );
          options = parsed.options;
          for (const error of parsed.errors.filter(
            (e) => ![18002, 18003].includes(e.code),
          ))
            issues.push({
              path: config,
              snapshot: side,
              message:
                "Configuration could not be fully resolved: " +
                ts
                  .flattenDiagnosticMessageText(error.messageText, " ")
                  .replaceAll(prefix, ""),
            });
        }
        configs.set(config, options);
      }
      return configs.get(config)!;
    };
    const candidate = (name: string): string | undefined => {
      const clean = path.posix.normalize(name);
      if (
        clean === ".." ||
        clean.startsWith("../") ||
        path.posix.isAbsolute(clean)
      )
        return;
      const replaced = clean.replace(
        /\.(mjs|cjs|js|jsx)$/,
        (_, ext: string) =>
          ({ mjs: ".mts", cjs: ".cts", js: ".ts", jsx: ".tsx" })[ext]!,
      );
      return [
        replaced,
        clean,
        ...extensions.map((ext) => clean + ext),
        ...extensions.map((ext) => path.posix.join(clean, "index" + ext)),
      ].find((id) => files.has(id));
    };
    const exportTarget = (
      value: unknown,
      relation: LinkRelation,
    ): string | undefined => {
      if (typeof value === "string") return value;
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      const conditions = new Set([
        relation === "type-import"
          ? "types"
          : relation === "dynamic-require"
            ? "require"
            : "import",
        "default",
      ]);
      for (const condition of Object.keys(record)) {
        if (!conditions.has(condition)) continue;
        const found = exportTarget(record[condition], relation);
        if (found) return found;
      }
    };
    const resolvePackage = (specifier: string, relation: LinkRelation) => {
      const parts = specifier.split("/");
      const packageName = parts
        .splice(0, specifier.startsWith("@") ? 2 : 1)
        .join("/");
      const pkg = packages.get(packageName);
      if (!pkg) return;
      const subpath = parts.length ? "./" + parts.join("/") : ".";
      let target: string | undefined;
      const exports: unknown = pkg.data.exports;
      if (exports !== undefined) {
        if (
          exports &&
          typeof exports === "object" &&
          !Array.isArray(exports) &&
          Object.keys(exports).some((k) => k.startsWith("."))
        ) {
          const entries = exports as Record<string, unknown>;
          target = exportTarget(entries[subpath], relation);
          if (!Object.hasOwn(entries, subpath))
            for (const pattern of Object.keys(entries)
              .filter((k) => k.includes("*"))
              .sort((a, b) => b.length - a.length)) {
              const [start, end] = pattern.split("*");
              if (subpath.startsWith(start) && subpath.endsWith(end)) {
                const mapped = exportTarget(entries[pattern], relation);
                if (mapped)
                  target = mapped.replaceAll(
                    "*",
                    subpath.slice(start.length, end ? -end.length : undefined),
                  );
                break;
              }
            }
        } else if (subpath === ".") target = exportTarget(exports, relation);
        if (!target?.startsWith("./")) return;
      } else {
        target = parts.length
          ? parts.join("/")
          : ((relation === "type-import" ? pkg.data.types : undefined) ??
            pkg.data.module ??
            pkg.data.main ??
            "index");
      }
      if (typeof target !== "string") return;
      const resolved = path.posix.normalize(path.posix.join(pkg.dir, target));
      if (
        pkg.dir !== "." &&
        resolved !== pkg.dir &&
        !resolved.startsWith(pkg.dir + "/")
      )
        return;
      return candidate(resolved);
    };
    const nodes = [...files]
      .filter(([name]) => isCode(name) || name.endsWith(".json"))
      .map(([id, content]) => ({
        id,
        name: path.posix.basename(id),
        type: path.posix.extname(id).slice(1),
        size: Buffer.byteLength(content),
        lines: content.split(/\r?\n/).length,
      }));
    for (const [name, content] of files) {
      if (!isCode(name)) continue;
      const options = optionsFor(name);
      const ast = ts.createSourceFile(
        name,
        content,
        ts.ScriptTarget.Latest,
        true,
      );
      const imports: { specifier: string; relation: LinkRelation }[] = [];
      const add = (node: ts.Node | undefined, relation: LinkRelation) => {
        if (
          node &&
          (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        )
          imports.push({ specifier: node.text, relation });
        else
          issues.push({
            path: name,
            snapshot: side,
            message: "A computed import cannot be resolved statically.",
          });
      };
      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node)) {
          const bindings = node.importClause?.namedBindings;
          const onlyTypes =
            node.importClause?.isTypeOnly ||
            (!node.importClause?.name &&
              bindings &&
              ts.isNamedImports(bindings) &&
              bindings.elements.length > 0 &&
              bindings.elements.every((e) => e.isTypeOnly));
          add(
            node.moduleSpecifier,
            onlyTypes ? "type-import" : "static-import",
          );
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
          const onlyTypes =
            node.isTypeOnly ||
            (node.exportClause &&
              ts.isNamedExports(node.exportClause) &&
              node.exportClause.elements.length > 0 &&
              node.exportClause.elements.every((e) => e.isTypeOnly));
          add(
            node.moduleSpecifier,
            onlyTypes ? "type-import" : "static-import",
          );
        } else if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference)
        )
          add(
            node.moduleReference.expression,
            node.isTypeOnly ? "type-import" : "dynamic-require",
          );
        else if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument)
        )
          add(node.argument.literal, "type-import");
        else if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === "require"))
        )
          add(
            node.arguments[0],
            node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? "dynamic-import"
              : "dynamic-require",
          );
        ts.forEachChild(node, visit);
      };
      visit(ast);
      for (const { specifier, relation } of imports) {
        if (builtins.has(specifier)) continue;
        const resolved = ts.resolveModuleName(
          specifier,
          prefix + name,
          options,
          host,
          undefined,
          undefined,
          relation === "dynamic-require"
            ? ts.ModuleKind.CommonJS
            : ts.ModuleKind.ESNext,
        ).resolvedModule?.resolvedFileName;
        let target =
          resolved?.startsWith(prefix) && files.has(key(resolved))
            ? key(resolved)
            : undefined;
        target ??= specifier.startsWith(".")
          ? candidate(path.posix.join(path.posix.dirname(name), specifier))
          : resolvePackage(specifier, relation);
        if (!target) {
          issues.push({
            path: name,
            snapshot: side,
            message: `Import ${JSON.stringify(specifier)} is unresolved or external; its dependencies are not analyzed.`,
          });
          continue;
        }
        const link = { source: name, target, relation };
        links.set(JSON.stringify(link), link);
      }
    }
    return {
      graph: {
        nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
        links: [...links.values()].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        ),
      },
      issues,
    };
  }
}
