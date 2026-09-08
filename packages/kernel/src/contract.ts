import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";
import type { Finding, ToolSpec } from "@ours/schemas";

/**
 * The static contract check — M-0006, rebuilt after the independent
 * verification of 8 September 2026 found sixteen ways past its first form.
 *
 * The first form recognised exactly one shape, `layer.method(...)`, and a
 * source tree in which the client was aliased, indexed, or destructured
 * passed with "0 client call(s)". A check that sees nothing is not a check.
 * This one refuses by default:
 *
 * - the identifier `layer` may appear only as the receiver of a direct call
 *   to `read`, `write`, or `disclose`, or as a declaration name; any other
 *   reference — an alias, a bracket, a destructuring, an argument, a
 *   parenthesis — is refused as undecidable;
 * - the reserved method names on any other receiver, or as bare calls, are
 *   refused;
 * - imports are an allowlist: the application's own files by relative path,
 *   the layer client package, and the packages its contract declares —
 *   nothing else, and never a Node built-in, never a dynamic `import()`,
 *   never `import.meta`;
 * - the names that reach the network, the file system, or the runtime by
 *   another door are refused wherever they appear;
 * - every class, origin, field list, and record is a literal, or it is
 *   refused;
 * - every file the runtime could execute is read, not only `.ts`.
 *
 * Still not checked here, and said in every message: what a declared
 * dependency does inside itself, and anything at runtime. Runtime
 * confinement is a later mandate's. Class: ENFORCED at admission.
 */

export const CONTRACT_RULE = "S-CONTRACT-DECLARED";

const CLIENT = "layer";
const CLIENT_PACKAGE = "@ours/layer";
const CLIENT_METHODS = new Set(["read", "write", "disclose"]);

/** Names that reach around the client. Refused wherever they appear. */
const REFUSED_NAMES = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "sendBeacon",
  "importScripts",
  "require",
  "createRequire",
  "eval",
  "Function",
  "process",
  "globalThis",
  "window",
  "self",
  "navigator",
  "Worker",
  "SharedWorker",
  "Deno",
  "Bun",
]);

/** Packages that reach the network or a database. Refused by root name, any subpath. */
const IO_PACKAGES = new Set([
  "pg",
  "mysql",
  "mysql2",
  "better-sqlite3",
  "sqlite3",
  "mongodb",
  "mongoose",
  "ioredis",
  "redis",
  "undici",
  "node-fetch",
  "cross-fetch",
  "isomorphic-fetch",
  "axios",
  "got",
  "ky",
  "superagent",
  "ws",
  "knex",
  "prisma",
  "@prisma/client",
  "drizzle-orm",
  "kysely",
  "typeorm",
  "sequelize",
]);

const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));

const EXTENSIONS: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

interface Tree {
  sources: string[];
  /** Files in the tree that are not read, by extension, so the report can say so. */
  unread: Record<string, number>;
}

async function listTree(dir: string): Promise<Tree> {
  const tree: Tree = { sources: [], unread: {} };
  const walk = async (d: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        await walk(full);
        continue;
      }
      if (entry.name.endsWith(".d.ts")) continue;
      const ext = path.extname(entry.name);
      if (ext in EXTENSIONS) tree.sources.push(full);
      else tree.unread[ext || "(none)"] = (tree.unread[ext || "(none)"] ?? 0) + 1;
    }
  };
  await walk(dir);
  tree.sources.sort();
  return tree;
}

function literal(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function literalArray(node: ts.Node | undefined): string[] | null {
  if (!node || !ts.isArrayLiteralExpression(node)) return null;
  const out: string[] = [];
  for (const el of node.elements) {
    const s = literal(el);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/** The keys of an object literal written to the store; null if any key is computed or spread. */
function literalKeys(node: ts.Node | undefined): string[] | null {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  const out: string[] = [];
  for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) return null;
    const name = prop.name;
    if (!name) return null;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) out.push(name.text);
    else return null;
  }
  return out;
}

/** The package root of a specifier: `pg/lib` → `pg`, `@scope/name/x` → `@scope/name`. */
function packageRoot(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] as string);
}

/**
 * An import is allowed if it is the application's own file, the client, or
 * a package the contract declares. Everything else is refused: a built-in,
 * an I/O package, or a package nobody declared.
 */
export function specifierVerdict(spec: string, declared: readonly string[]): string | null {
  if (spec.startsWith("./") || spec.startsWith("../")) return null;
  if (spec.startsWith("/")) return `imports ${spec}: an absolute path reaches outside the application`;
  const bare = spec.replace(/^node:/, "");
  const root = packageRoot(bare);
  if (spec.startsWith("node:") || BUILTINS.has(root)) {
    return `imports ${spec}: a built-in module — an application has no file system, sockets, or runtime of its own; reach the layer through the client`;
  }
  if (root === CLIENT_PACKAGE) return null;
  if (IO_PACKAGES.has(root)) {
    return `imports ${spec}: a package that reaches a network or a database, which the client alone may do`;
  }
  if (declared.includes(root)) return null;
  return `imports ${spec}: not the application's own file, not the client, and not a dependency the contract declares`;
}

export interface ContractProblem {
  file: string;
  line: number;
  message: string;
}

/** Whether an identifier node is the receiver of a direct `layer.<method>(...)` call. */
function isClientReceiver(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent || !ts.isPropertyAccessExpression(parent) || parent.expression !== node) return false;
  if (!CLIENT_METHODS.has(parent.name.text)) return false;
  const call = parent.parent;
  return !!call && ts.isCallExpression(call) && call.expression === parent;
}

/** Whether an identifier node is the name being declared, not a reference. */
function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return true;
  if (ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) return true;
  if (ts.isTypeAliasDeclaration(parent) || ts.isInterfaceDeclaration(parent)) return true;
  return false;
}

/** Scans one source file. Every refusal names the line and the cause. */
export function scanSource(
  fileName: string,
  text: string,
  spec: ToolSpec,
  kind: ts.ScriptKind = ts.ScriptKind.TS,
): { problems: ContractProblem[]; calls: number } {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const problems: ContractProblem[] = [];
  let calls = 0;
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const problem = (node: ts.Node, message: string) => problems.push({ file: fileName, line: at(node), message });

  const reads = new Map(spec.contract.reads.map((r) => [r.class, r]));
  const writes = new Map(spec.contract.writes.map((w) => [w.class, w]));
  const disclosures = new Map(spec.contract.disclosures.map((d) => [d.origin, d]));
  const declared = spec.contract.dependencies ?? [];

  const checkClientCall = (node: ts.CallExpression, method: string): void => {
    calls += 1;
    const [first, second] = node.arguments;
    if (method === "read" || method === "write") {
      const cls = literal(first);
      if (cls === null) {
        problem(node, `layer.${method}() with a class that is not a string literal — undecidable statically, so refused`);
        return;
      }
      const table = method === "read" ? reads : writes;
      const grant = table.get(cls);
      if (!grant) {
        problem(node, `layer.${method}("${cls}") reaches class ${cls}, which the contract does not declare for ${method}`);
        return;
      }
      const fields = method === "read" ? literalArray(second) : literalKeys(second);
      if (fields === null) {
        problem(
          node,
          method === "read"
            ? `layer.read("${cls}") names no literal field list — a read that does not say which fields is a read of all of them, so refused`
            : `layer.write("${cls}") without a record whose keys are all literal — undecidable, so refused`,
        );
        return;
      }
      const extra = fields.filter((f) => !grant.fields.includes(f));
      if (extra.length > 0) {
        problem(node, `layer.${method}("${cls}") reaches field(s) ${extra.join(", ")} beyond the contract's ${grant.fields.join(", ")} (article ${grant.article})`);
      }
      return;
    }
    if (method === "disclose") {
      const origin = literal(first);
      if (origin === null) {
        problem(node, `layer.disclose() to an origin that is not a string literal — undecidable, so refused`);
        return;
      }
      const grant = disclosures.get(origin);
      if (!grant) {
        problem(node, `layer.disclose("${origin}") sends to an origin the contract's permitted disclosures do not name`);
        return;
      }
      const fields = literalArray(second);
      if (fields === null) {
        problem(node, `layer.disclose("${origin}", …) with fields that are not string literals — undecidable, so refused`);
        return;
      }
      const extra = fields.filter((f) => !grant.fields.includes(f));
      if (extra.length > 0) {
        problem(node, `layer.disclose("${origin}") sends field(s) ${extra.join(", ")} that the permitted disclosure (article ${grant.article}) does not list — refused even though the origin is allowed`);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    // Imports: an allowlist, and never dynamic.
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const spec_ = literal(node.moduleSpecifier);
      const verdict = spec_ === null ? `imports a module that is not a string literal — refused` : specifierVerdict(spec_, declared);
      if (verdict !== null) problem(node, verdict);
    }
    if (ts.isImportEqualsDeclaration(node)) {
      problem(node, `uses import = require(): refused; imports are an allowlist of the application's own files, the client, and declared dependencies`);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      problem(node, `uses a dynamic import(): refused — a module loaded at runtime cannot be checked here`);
    }
    if (ts.isMetaProperty(node)) {
      problem(node, `uses import.meta: refused — the application has no business with the runtime's module system`);
    }

    // Names that reach around the client, wherever they appear.
    if (ts.isIdentifier(node) && REFUSED_NAMES.has(node.text)) {
      const isCallee = node.parent && ts.isCallExpression(node.parent) && node.parent.expression === node;
      problem(
        node,
        isCallee
          ? `calls ${node.text}(): outbound access goes through layer.disclose, under a permitted disclosure; a file system, a runtime, or a network reached by another door is refused`
          : `references ${node.text}: a door around the client, refused wherever it appears`,
      );
    }

    // The client may be used only as layer.read/write/disclose(...).
    if (ts.isIdentifier(node) && node.text === CLIENT && !isClientReceiver(node) && !isDeclarationName(node)) {
      problem(node, `references layer other than as layer.read/write/disclose(…): aliasing, indexing, passing, or destructuring the client is undecidable, so refused`);
    }

    // Client calls — and the reserved names on any other receiver.
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && CLIENT_METHODS.has(callee.name.text)) {
        if (ts.isIdentifier(callee.expression) && callee.expression.text === CLIENT) {
          checkClientCall(node, callee.name.text);
        } else {
          problem(node, `calls .${callee.name.text}() on something other than layer: the client's methods are reserved names, and a call on another receiver is undecidable, so refused`);
        }
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === CLIENT) {
        problem(node, `layer.${callee.name.text}() is not a client method; the client is read, write, and disclose`);
      } else if (ts.isIdentifier(callee) && CLIENT_METHODS.has(callee.text)) {
        problem(node, `calls ${callee.text}() bare: the client is layer, and a detached ${callee.text} is undecidable, so refused`);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { problems, calls };
}

/** Checks a whole source tree against the specification's contract. */
export async function checkContract(spec: ToolSpec, sourceDir: string): Promise<Finding> {
  const rule = CONTRACT_RULE;
  const tree = await listTree(sourceDir);
  if (tree.sources.length === 0) {
    return {
      rule,
      enforcement: "ENFORCED",
      outcome: "NOT_MACHINE_DECIDABLE",
      message: `No source found under ${sourceDir} (${Object.keys(EXTENSIONS).join(" ")}), so nothing was checked against ${spec.tool_id}'s contract. This is not a pass.`,
    };
  }
  const problems: ContractProblem[] = [];
  let calls = 0;
  for (const file of tree.sources) {
    const text = await readFile(file, "utf8");
    const kind = EXTENSIONS[path.extname(file)] ?? ts.ScriptKind.TS;
    const result = scanSource(path.relative(sourceDir, file), text, spec, kind);
    problems.push(...result.problems);
    calls += result.calls;
  }
  const unread = Object.entries(tree.unread)
    .map(([ext, n]) => `${n} ${ext}`)
    .join(", ");
  const unreadNote = unread ? ` Not read, because the runtime does not execute them: ${unread}.` : "";
  const notChecked =
    ` What this does not check: what a declared dependency does inside itself, and anything at runtime — runtime confinement is a later mandate's.`;
  if (problems.length > 0) {
    return {
      rule,
      enforcement: "ENFORCED",
      outcome: "REFUSED",
      message:
        problems.map((p) => `${p.file}:${p.line} ${p.message}`).join("; ") +
        `. The contract of ${spec.tool_id} is what the community granted; an implementation reaching past it, or reaching for the client in a form this check cannot decide, is refused at the gate.` +
        notChecked,
    };
  }
  return {
    rule,
    enforcement: "ENFORCED",
    outcome: "PASS",
    message:
      `${tree.sources.length} source file(s) read, ${calls} client call(s), every one a direct layer.read/write/disclose with literal arguments inside ${spec.tool_id}'s contract; ` +
      `the client referenced in no other form; imports only the application's own files, the client, and ${declaredCount(spec)} declared dependenc${declaredCount(spec) === 1 ? "y" : "ies"}; ` +
      `no built-in module, no dynamic import, no door around the client.${unreadNote}${notChecked}`,
  };
}

function declaredCount(spec: ToolSpec): number {
  return spec.contract.dependencies?.length ?? 0;
}
