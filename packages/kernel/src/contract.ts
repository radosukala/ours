import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { Finding, ToolSpec } from "@ours/schemas";

/**
 * The static contract check — M-0006.
 *
 * An application's only data access is the layer client: `layer.read`,
 * `layer.write`, `layer.disclose`. This check enumerates those calls in a
 * source tree and compares each against the specification's contract. It
 * needs no general program analysis, and it refuses what it cannot decide:
 * a class or origin that is not a string literal is refused as
 * undecidable rather than assumed declared. It also refuses the ways an
 * application could reach around the client — a raw fetch, a file system,
 * a socket, a database driver — because the runtime that would confine
 * those does not exist yet, and until it does the gate is what holds.
 *
 * Class: ENFORCED at admission. Runtime confinement is a later mandate's,
 * and every message here says so.
 */

export const CONTRACT_RULE = "S-CONTRACT-DECLARED";

const CLIENT = "layer";
const DENIED_MODULES = [
  /^node:/,
  /^(fs|net|http|https|http2|dns|child_process|worker_threads|dgram|tls)$/,
  /^(pg|mysql2?|better-sqlite3|sqlite3|mongodb|ioredis|redis|undici|node-fetch|axios|got)$/,
];

async function listSources(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...(await listSources(full)));
    } else if (/\.(ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out.sort();
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

export interface ContractProblem {
  file: string;
  line: number;
  message: string;
}

/** Scans one source file for client calls, escape hatches, and undecidable arguments. */
export function scanSource(fileName: string, text: string, spec: ToolSpec): { problems: ContractProblem[]; calls: number } {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const problems: ContractProblem[] = [];
  let calls = 0;
  const at = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const problem = (node: ts.Node, message: string) => problems.push({ file: fileName, line: at(node), message });

  const reads = new Map(spec.contract.reads.map((r) => [r.class, r]));
  const writes = new Map(spec.contract.writes.map((w) => [w.class, w]));
  const disclosures = new Map(spec.contract.disclosures.map((d) => [d.origin, d]));

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const mod = literal(node.moduleSpecifier);
      if (mod !== null && DENIED_MODULES.some((re) => re.test(mod))) {
        problem(node, `imports ${mod}: an application has no file system, sockets, or database of its own — reach the layer through the client`);
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && (callee.text === "fetch" || callee.text === "require")) {
        problem(node, `calls ${callee.text}(): outbound access goes through layer.disclose, under a permitted disclosure`);
      }
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === CLIENT) {
        const method = callee.name.text;
        const [first, second] = node.arguments;
        if (method === "read" || method === "write") {
          calls += 1;
          const cls = literal(first);
          if (cls === null) {
            problem(node, `layer.${method}() with a class that is not a string literal — undecidable statically, so refused`);
          } else {
            const declared = (method === "read" ? reads : writes).get(cls);
            if (!declared) {
              problem(node, `layer.${method}("${cls}") reaches class ${cls}, which the contract does not declare for ${method}`);
            } else {
              // A read names the fields it wants as a list; a write carries
              // a record, whose keys are the fields it touches. Either is
              // compared to the contract; anything computed is refused.
              const fields = method === "read" ? literalArray(second) : literalKeys(second);
              if (second !== undefined && fields === null) {
                problem(
                  node,
                  method === "read"
                    ? `layer.read("${cls}", …) with fields that are not string literals — undecidable, so refused`
                    : `layer.write("${cls}", …) with a record whose keys are not all literal — undecidable, so refused`,
                );
              } else if (fields) {
                const extra = fields.filter((f) => !declared.fields.includes(f));
                if (extra.length > 0) problem(node, `layer.${method}("${cls}") reaches field(s) ${extra.join(", ")} beyond the contract's ${declared.fields.join(", ")} (article ${declared.article})`);
              }
            }
          }
        } else if (method === "disclose") {
          calls += 1;
          const origin = literal(first);
          const fields = literalArray(second);
          if (origin === null) {
            problem(node, `layer.disclose() to an origin that is not a string literal — undecidable, so refused`);
          } else {
            const declared = disclosures.get(origin);
            if (!declared) {
              problem(node, `layer.disclose("${origin}") sends to an origin the contract's permitted disclosures do not name`);
            } else if (fields === null) {
              problem(node, `layer.disclose("${origin}", …) with fields that are not string literals — undecidable, so refused`);
            } else {
              const extra = fields.filter((f) => !declared.fields.includes(f));
              if (extra.length > 0) problem(node, `layer.disclose("${origin}") sends field(s) ${extra.join(", ")} that the permitted disclosure (article ${declared.article}) does not list — refused even though the origin is allowed`);
            }
          }
        } else {
          problem(node, `layer.${method}() is not a client method; the client is read, write, and disclose`);
        }
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
  const files = await listSources(sourceDir);
  if (files.length === 0) {
    return {
      rule,
      enforcement: "ENFORCED",
      outcome: "NOT_MACHINE_DECIDABLE",
      message: `No TypeScript source found under ${sourceDir}, so nothing was checked against ${spec.tool_id}'s contract. This is not a pass.`,
    };
  }
  const problems: ContractProblem[] = [];
  let calls = 0;
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const result = scanSource(path.relative(sourceDir, file), text, spec);
    problems.push(...result.problems);
    calls += result.calls;
  }
  if (problems.length > 0) {
    return {
      rule,
      enforcement: "ENFORCED",
      outcome: "REFUSED",
      message:
        problems.map((p) => `${p.file}:${p.line} ${p.message}`).join("; ") +
        `. The contract of ${spec.tool_id} is what the community granted; an implementation reaching past it is refused at the gate. ` +
        `Runtime confinement does not exist yet; this check is what holds.`,
    };
  }
  return {
    rule,
    enforcement: "ENFORCED",
    outcome: "PASS",
    message: `${files.length} source file(s), ${calls} client call(s), every one inside ${spec.tool_id}'s contract; no escape hatch imported or called. Statically — runtime confinement is a later mandate's.`,
  };
}
