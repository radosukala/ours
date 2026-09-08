import { lstat, readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";
import type { Finding, ToolSpec } from "@ours/schemas";

/**
 * The static contract check — M-0006, in its third form.
 *
 * The first form recognised one syntactic shape and passed an aliased
 * client unseen. The second refused every other reference to the client
 * and a list of names that reach around it — and the re-verification found
 * the list could not be complete: `global` was not on it, and
 * `constructor` walks to the Function constructor from anything.
 *
 * So this form does not list what is forbidden. It binds the source with
 * the TypeScript binder and no library at all, so that every identifier
 * either resolves to something the application declared or imported, or
 * is a global — and a global is refused unless it is on a short allowlist
 * of values that cannot reach outside the process: the ECMAScript
 * built-ins, timers, and `console`. `Function`, `Reflect`, `Proxy`,
 * `WebAssembly`, `globalThis`, `global`, `process`, `fetch`, and every
 * other name are refused not because they are listed but because they are
 * not allowed. The doors that need no global — `.constructor`,
 * `.prototype`, `__proto__`, `arguments`, top-level `this`, `with` — are
 * refused by name, because they are few and fixed.
 *
 * The rest as before: the client `layer` may appear only as the receiver of
 * a direct `read`, `write`, or `disclose` call, or as a declaration name;
 * imports are an allowlist of the application's own files, the client, and
 * the package roots the contract declares; every file the runtime could
 * execute is read, and a symbolic link is refused because it can point
 * outside what is read.
 *
 * Still not checked, and said in every message: what a declared dependency
 * does inside itself, and anything at runtime. Class: ENFORCED at admission.
 */

export const CONTRACT_RULE = "S-CONTRACT-DECLARED";

const CLIENT = "layer";
const CLIENT_PACKAGE = "@ours/layer";
const CLIENT_METHODS = new Set(["read", "write", "disclose"]);

/**
 * Globals an application may reference: values that cannot reach outside
 * the process. Everything not here is refused. `Object` is here and
 * `.constructor`, `.prototype`, and `__proto__` are refused as property
 * names, which closes the walk from any value to the Function constructor.
 */
const ALLOWED_GLOBALS = new Set([
  "Array", "ArrayBuffer", "BigInt", "BigInt64Array", "BigUint64Array", "Boolean", "DataView", "Date",
  "Error", "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError", "URIError", "AggregateError",
  "Float32Array", "Float64Array", "Int8Array", "Int16Array", "Int32Array",
  "Uint8Array", "Uint8ClampedArray", "Uint16Array", "Uint32Array",
  "Infinity", "NaN", "undefined", "JSON", "Map", "Set", "WeakMap", "WeakSet", "WeakRef",
  "Math", "Number", "Object", "Promise", "RegExp", "String", "Symbol",
  "parseInt", "parseFloat", "isNaN", "isFinite",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
  "structuredClone", "console", "Intl", "URL", "URLSearchParams", "TextEncoder", "TextDecoder",
  "AbortController", "AbortSignal", "crypto", "Atomics", "SharedArrayBuffer",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
]);

/** Names that reach around the client even when declared locally. Refused wherever they appear. */
const REFUSED_NAMES = new Set([
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "importScripts",
  "require", "createRequire", "eval", "Function", "process", "globalThis", "global", "window", "self",
  "navigator", "Worker", "SharedWorker", "Deno", "Bun", "Reflect", "Proxy", "WebAssembly", "arguments",
]);

/** Property names that walk to the Function constructor or the caller. Refused on any receiver, in any spelling. */
const REFUSED_PROPERTIES = new Set(["constructor", "prototype", "__proto__", "callee", "caller"]);

/**
 * The reflective methods of `Object`: each reaches a prototype, a
 * descriptor, or a property by a name passed as a value, and so walks to
 * the Function constructor without ever writing `.constructor`. Refused on
 * `Object`; `keys`, `values`, `entries`, `assign`, `freeze`, and
 * `fromEntries` stay, because they see enumerable properties only and the
 * built-ins' are not.
 */
const REFUSED_OBJECT_METHODS = new Set([
  "getPrototypeOf", "setPrototypeOf", "getOwnPropertyDescriptor", "getOwnPropertyDescriptors",
  "getOwnPropertyNames", "getOwnPropertySymbols", "defineProperty", "defineProperties", "create",
]);

/** Timers run a function; given a string they run code. Only a function literal is accepted. */
const TIMERS = new Set(["setTimeout", "setInterval"]);

/** Packages that reach the network or a database. Refused by root name, any subpath, even if declared. */
const IO_PACKAGES = new Set([
  "pg", "mysql", "mysql2", "better-sqlite3", "sqlite3", "mongodb", "mongoose", "ioredis", "redis",
  "undici", "node-fetch", "cross-fetch", "isomorphic-fetch", "axios", "got", "ky", "superagent", "ws",
  "knex", "prisma", "@prisma/client", "drizzle-orm", "kysely", "typeorm", "sequelize",
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

/** Relative imports may name a source file, a JSON file, or nothing; a native addon or anything else is refused. */
const IMPORTABLE_EXTENSIONS = new Set([...Object.keys(EXTENSIONS), ".json", ""]);

interface Tree {
  sources: string[];
  unread: Record<string, number>;
  /** Symbolic links, refused: they can point outside what is read. */
  links: string[];
}

async function listTree(dir: string): Promise<Tree> {
  const tree: Tree = { sources: [], unread: {}, links: [] };
  const walk = async (d: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      let isLink = entry.isSymbolicLink();
      if (!isLink) {
        try {
          isLink = (await lstat(full)).isSymbolicLink();
        } catch {
          isLink = false;
        }
      }
      if (isLink) {
        tree.links.push(path.relative(dir, full));
        continue;
      }
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
  tree.links.sort();
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

function packageRoot(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] as string);
}

/**
 * An import is allowed if it is the application's own source or JSON file,
 * the client, or a package the contract declares and that does not itself
 * reach a network or a database. Everything else is refused.
 */
export function specifierVerdict(spec: string, declared: readonly string[]): string | null {
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const ext = path.extname(spec);
    if (!IMPORTABLE_EXTENSIONS.has(ext)) return `imports ${spec}: a relative import may name a source or JSON file, not ${ext}`;
    return null;
  }
  if (spec.startsWith("/")) return `imports ${spec}: an absolute path reaches outside the application`;
  if (spec.startsWith("#")) return `imports ${spec}: a package.json subpath import is a mapping this check cannot see, so refused`;
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

/** Whether an identifier is the name being declared, a property name, or in a type — not a value reference. */
function isNotValueReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) || ts.isMethodSignature(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) return parent.name === node;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) || ts.isEnumDeclaration(parent) || ts.isEnumMember(parent)) return parent.name === node;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return true;
  // `export { layer as l }`: the alias `l` is a name; the local `layer` is a
  // reference, and re-exporting the client under any name is aliasing it.
  if (ts.isExportSpecifier(parent)) return parent.propertyName !== undefined && parent.name === node;
  if (ts.isTypeAliasDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeParameterDeclaration(parent)) return true;
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return true;
  if (ts.isJsxAttribute(parent)) return true;
  for (let a: ts.Node | undefined = parent; a; a = a.parent) {
    // `implements X` and an interface's `extends X` are types; a class's
    // `extends X` is a value — the fourth check reached the Function
    // constructor through `class Sub extends Function {}`. The expression
    // node under a heritage clause is a TypeNode to the parser, so the
    // clause is decided first.
    if (ts.isHeritageClause(a)) {
      return a.token === ts.SyntaxKind.ImplementsKeyword || (a.parent !== undefined && ts.isInterfaceDeclaration(a.parent));
    }
    if (ts.isExpressionWithTypeArguments(a)) continue;
    if (ts.isTypeNode(a) || ts.isTypeElement(a)) return true;
    if (ts.isExpression(a) || ts.isStatement(a)) break;
  }
  return false;
}

/** Primitive-valued globals that may be used as plain values anywhere. */
const PRIMITIVE_GLOBALS = new Set(["undefined", "NaN", "Infinity"]);

/**
 * Where an allowed global may be used: as the receiver of a property
 * access, the callee of a call or `new`, the operand of `typeof`, or the
 * superclass of a class. Anywhere else — an initializer, an argument, an
 * element, a return — is an alias, and an alias of `Object` reaches its
 * reflective methods under another name, as the fourth check showed.
 */
function isAllowedGlobalUse(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return true;
  if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node) return true;
  if (ts.isTypeOfExpression(parent)) return true;
  if (ts.isExpressionWithTypeArguments(parent) && parent.expression === node) return true;
  return false;
}

/**
 * Where `this` is what it seems: a class member or an object-literal method,
 * where it is the instance or the object. At the top of a script it is the
 * global object; in a plain function called without a receiver it is the
 * global object in sloppy code. Arrows inherit from where they sit.
 */
function thisVerdict(node: ts.Node): string | null {
  for (let a: ts.Node | undefined = node.parent; a; a = a.parent) {
    if (ts.isArrowFunction(a)) continue;
    if (ts.isMethodDeclaration(a) || ts.isConstructorDeclaration(a) || ts.isGetAccessor(a) || ts.isSetAccessor(a)) return null;
    if (ts.isClassLike(a)) return null;
    if (ts.isFunctionDeclaration(a) || ts.isFunctionExpression(a)) {
      return `uses this in a plain function: refused — called without a receiver, in sloppy code it is the global object`;
    }
  }
  return `uses this outside any function or class: refused — at the top of a script it is the global object`;
}

interface Scan {
  problems: ContractProblem[];
  calls: number;
}

/** Scans one bound source file. Every refusal names the line and the cause. */
export function scanSource(sf: ts.SourceFile, checker: ts.TypeChecker, spec: ToolSpec, fileName: string): Scan {
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
      const grant = (method === "read" ? reads : writes).get(cls);
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
      if (extra.length > 0) problem(node, `layer.${method}("${cls}") reaches field(s) ${extra.join(", ")} beyond the contract's ${grant.fields.join(", ")} (article ${grant.article})`);
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
      if (extra.length > 0) problem(node, `layer.disclose("${origin}") sends field(s) ${extra.join(", ")} that the permitted disclosure (article ${grant.article}) does not list — refused even though the origin is allowed`);
    }
  };

  const visit = (node: ts.Node): void => {
    // Imports: an allowlist, and never dynamic.
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const spec_ = literal(node.moduleSpecifier);
      const verdict = spec_ === null ? `imports a module that is not a string literal — refused` : specifierVerdict(spec_, declared);
      if (verdict !== null) problem(node, verdict);
    }
    if (ts.isImportEqualsDeclaration(node)) problem(node, `uses import = require(): refused; imports are an allowlist`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) problem(node, `uses a dynamic import(): refused — a module loaded at runtime cannot be checked here`);
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      problem(node, `uses import.meta: refused — the application has no business with the runtime's module system`);
    }
    if (ts.isWithStatement(node)) problem(node, `uses a with statement: refused — it changes what a name means`);
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      const verdict = thisVerdict(node);
      if (verdict !== null) problem(node, verdict);
    }

    // The property names that walk to the Function constructor, in every
    // spelling: as a string anywhere, as a destructured binding, as a
    // computed key — because a name passed as a value is still the name.
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && REFUSED_PROPERTIES.has(node.text)) {
      problem(node, `the string "${node.text}" appears: a property name that walks to the Function constructor, refused in any position`);
    }
    if (ts.isBindingElement(node)) {
      const names = [node.name, node.propertyName].filter((n): n is ts.Identifier => !!n && ts.isIdentifier(n)).map((n) => n.text);
      const bad = names.find((n) => REFUSED_PROPERTIES.has(n) || REFUSED_NAMES.has(n));
      if (bad !== undefined) problem(node, `destructures ${bad}: a binding named for a door around the client, refused`);
      if (node.propertyName && ts.isComputedPropertyName(node.propertyName)) problem(node, `destructures a computed key: undecidable, so refused`);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Object" && REFUSED_OBJECT_METHODS.has(node.name.text)) {
      problem(node, `reaches Object.${node.name.text}: a reflective method that walks to a prototype or a descriptor, refused`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && TIMERS.has(node.expression.text)) {
      const [fn] = node.arguments;
      if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        problem(node, `calls ${node.expression.text}() with something other than a function literal: a string is code, and a name is undecidable, so refused`);
      }
    }

    // Property names that walk to the Function constructor, on any receiver, by any spelling.
    if (ts.isPropertyAccessExpression(node) && REFUSED_PROPERTIES.has(node.name.text)) {
      problem(node, `reaches .${node.name.text}: the walk from any value to the Function constructor or the caller, refused on every receiver`);
    }
    if (ts.isPropertyAccessExpression(node) && REFUSED_NAMES.has(node.name.text) && !(ts.isIdentifier(node.expression) && node.expression.text === CLIENT)) {
      problem(node, `reaches .${node.name.text}: a door around the client, refused on every receiver`);
    }
    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression;
      const key = literal(arg);
      if (key !== null) {
        if (REFUSED_PROPERTIES.has(key) || REFUSED_NAMES.has(key)) problem(node, `reaches ["${key}"]: refused on every receiver, by bracket as by dot`);
      } else if (!ts.isNumericLiteral(arg)) {
        problem(node, `reaches a member by a computed key: undecidable — it can spell any name — so refused; use a literal key, for…of, .at(), or .map()`);
      }
    }

    // Identifiers in value positions: declared, or a global on the allowlist, or refused.
    if (ts.isIdentifier(node) && !isNotValueReference(node)) {
      const name = node.text;
      if (name === CLIENT) {
        if (!isClientReceiver(node)) {
          problem(node, `references layer other than as layer.read/write/disclose(…): aliasing, indexing, passing, or destructuring the client is undecidable, so refused`);
        }
      } else if (REFUSED_NAMES.has(name)) {
        const isCallee = node.parent && ts.isCallExpression(node.parent) && node.parent.expression === node;
        problem(
          node,
          isCallee
            ? `calls ${name}(): outbound access goes through layer.disclose, under a permitted disclosure; a file system, a runtime, or a network reached by another door is refused`
            : `references ${name}: a door around the client, refused wherever it appears`,
        );
      } else {
        const shorthand = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : undefined;
        const symbol = shorthand ?? checker.getSymbolAtLocation(node);
        if (symbol === undefined) {
          if (!ALLOWED_GLOBALS.has(name)) {
            problem(node, `references ${name}, which the application neither declares nor imports: a global outside the allowlist, refused — only the ECMAScript built-ins, timers, and console may be reached`);
          } else if (!PRIMITIVE_GLOBALS.has(name) && !isAllowedGlobalUse(node)) {
            problem(node, `aliases ${name}: an allowed global may be used — as a receiver, a callee, a superclass — but not renamed, passed, or stored, because the alias escapes the checks on its name; write (x) => ${name}(x), not ${name}`);
          }
        }
      }
    }

    // Client calls — and the reserved names on any other receiver.
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && CLIENT_METHODS.has(callee.name.text)) {
        if (ts.isIdentifier(callee.expression) && callee.expression.text === CLIENT) checkClientCall(node, callee.name.text);
        else problem(node, `calls .${callee.name.text}() on something other than layer: the client's methods are reserved names, and a call on another receiver is undecidable, so refused`);
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

/** Binds a source tree with no library, so that every global is visible as one. */
function bind(files: string[]): { program: ts.Program; checker: ts.TypeChecker } {
  const program = ts.createProgram({
    rootNames: files,
    options: {
      noLib: true,
      allowJs: true,
      checkJs: false,
      noResolve: true,
      types: [],
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      noEmit: true,
    },
  });
  return { program, checker: program.getTypeChecker() };
}

/** Checks a whole source tree against the specification's contract. */
export async function checkContract(spec: ToolSpec, sourceDir: string): Promise<Finding> {
  const rule = CONTRACT_RULE;
  const tree = await listTree(sourceDir);
  if (tree.sources.length === 0 && tree.links.length === 0) {
    return {
      rule,
      enforcement: "ENFORCED",
      outcome: "NOT_MACHINE_DECIDABLE",
      message: `No source found under ${sourceDir} (${Object.keys(EXTENSIONS).join(" ")}), so nothing was checked against ${spec.tool_id}'s contract. This is not a pass.`,
    };
  }
  const problems: ContractProblem[] = tree.links.map((link) => ({
    file: link,
    line: 0,
    message: `is a symbolic link: refused — it can point outside what this check reads`,
  }));
  let calls = 0;
  if (tree.sources.length > 0) {
    const { program, checker } = bind(tree.sources);
    for (const file of tree.sources) {
      const sf = program.getSourceFile(file);
      if (!sf) {
        problems.push({ file: path.relative(sourceDir, file), line: 0, message: `could not be read by the binder — refused rather than skipped` });
        continue;
      }
      const result = scanSource(sf, checker, spec, path.relative(sourceDir, file));
      problems.push(...result.problems);
      calls += result.calls;
    }
  }
  const unread = Object.entries(tree.unread)
    .map(([ext, n]) => `${n} ${ext}`)
    .join(", ");
  const unreadNote = unread ? ` Not read, because the runtime does not execute them: ${unread}.` : "";
  const notChecked = ` What this does not check: what a declared dependency does inside itself, and anything at runtime — runtime confinement is a later mandate's.`;
  if (problems.length > 0) {
    return {
      rule,
      enforcement: "ENFORCED",
      outcome: "REFUSED",
      message:
        problems.map((p) => (p.line > 0 ? `${p.file}:${p.line} ${p.message}` : `${p.file} ${p.message}`)).join("; ") +
        `. The contract of ${spec.tool_id} is what the community granted; an implementation reaching past it, or reaching for the client or the outside in a form this check cannot decide, is refused at the gate.` +
        notChecked,
    };
  }
  const declaredCount = spec.contract.dependencies?.length ?? 0;
  return {
    rule,
    enforcement: "ENFORCED",
    outcome: "PASS",
    message:
      `${tree.sources.length} source file(s) read and bound with no library, ${calls} client call(s), every one a direct layer.read/write/disclose with literal arguments inside ${spec.tool_id}'s contract; ` +
      `the client referenced in no other form; every other name declared, imported, or a global on the allowlist; imports only the application's own files, the client, and ${declaredCount} declared dependenc${declaredCount === 1 ? "y" : "ies"}; ` +
      `no built-in module, no dynamic import, no symbolic link, no door around the client.${unreadNote}${notChecked}`,
  };
}
