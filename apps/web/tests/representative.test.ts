/**
 * The controller's representative in the EU (GDPR Articles 13(1)(a) and 27;
 * D-0014, SPEC §18.14). /privacy names it only while a controller is named
 * and the setting holds a name; otherwise it says nothing about one. Public
 * pages say nothing more about the maintainer than its name and role
 * (D-0013 §A). FICTIONAL values only (SPEC §15).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import { accountCreationOpen, controllerRepresentative } from "@/core/config";

const APP = fileURLToPath(new URL("..", import.meta.url));
const REPRESENTATIVE = "FICTIONAL Representative";

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

const privacyHtml = () => renderToStaticMarkup(createElement(PrivacyPage));

function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("controllerRepresentative()", () => {
  it("is the configured name while a controller is named", () => {
    vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", `  ${REPRESENTATIVE} `);
    expect(controllerRepresentative()).toBe(REPRESENTATIVE);
  });

  it("is null when the setting is empty, blank or the confirmation placeholder", () => {
    for (const value of ["", "   ", "[CONFIRM]", "[ confirm: the name ]"]) {
      vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", value);
      expect(controllerRepresentative(), JSON.stringify(value)).toBeNull();
    }
  });

  it("is null while no controller is named, whatever the setting says", () => {
    vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", REPRESENTATIVE);
    vi.stubEnv("DATA_CONTROLLER", "");
    expect(controllerRepresentative()).toBeNull();
    vi.stubEnv("DATA_CONTROLLER", "FICTIONAL Controller");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "[CONFIRM]");
    expect(controllerRepresentative()).toBeNull();
  });

  it("switches nothing off: joining stays open without one", () => {
    vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", "");
    expect(accountCreationOpen()).toBe(true);
  });
});

describe("/privacy and the representative", () => {
  it("names it under Who is responsible and in Contact, at the controller's address", () => {
    vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", REPRESENTATIVE);
    const html = privacyHtml();
    const who = section(html, "privacy-who");
    expect(textOf(who)).toContain(
      `Its representative in the EU, under Article 27 of the GDPR, is ${REPRESENTATIVE}, at the same address.`,
    );
    const contact = section(html, "privacy-contact");
    expect(textOf(contact)).toContain("FICTIONAL Controller: controller@example.test");
    expect(textOf(contact)).toContain(`Its representative in the EU: ${REPRESENTATIVE}, at controller@example.test`);
    expect(contact.match(/href="mailto:controller@example\.test"/g)).toHaveLength(2);
  });

  it("says nothing about a representative when none is set", () => {
    vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", "");
    const text = textOf(privacyHtml());
    expect(text).toContain("FICTIONAL Controller");
    expect(text).not.toMatch(/representative|Article 27/i);
  });

  it("names none while no controller is named, even with the setting present", () => {
    vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", REPRESENTATIVE);
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    const text = textOf(privacyHtml());
    expect(text).toContain("The data controller is not yet named");
    expect(text).not.toContain(REPRESENTATIVE);
    expect(text).not.toMatch(/representative/i);
  });

  it("only /privacy names it: /power stays name and role (D-0014 §C)", () => {
    vi.stubEnv("DATA_CONTROLLER_REPRESENTATIVE", REPRESENTATIVE);
    const power = textOf(renderToStaticMarkup(createElement(PowerPage)));
    expect(power).toContain("Ctrl AI, Inc., the founder's company, is the maintainer and the data controller.");
    expect(power).not.toContain(REPRESENTATIVE);
  });
});

describe("the maintainer on public pages: its name and role only (D-0013 §A)", () => {
  // FOUNDING-AUTHORITY §4.1 quotes these from the certificate; the filed
  // record has never been retrieved, so no public page carries them.
  const UNVERIFIED = /Delaware|C-Corporation|Newark|Continental Dr|Legalinc|New Castle/i;

  it("no public page source and no transparency file mentions its form, address or agent", () => {
    const files = [
      ...["src/app/(public)", "src/components/public"].flatMap((dir) =>
        readdirSync(join(APP, dir), { recursive: true, encoding: "utf8" })
          .filter((f) => /\.(tsx?|json)$/.test(f))
          .map((f) => join(dir, f)),
      ),
      ...readdirSync(join(APP, "transparency")).map((f) => join("transparency", f)),
      "src/components/RightColumn.tsx",
    ];
    expect(files.length).toBeGreaterThan(10);
    const hits = files.filter((f) => UNVERIFIED.test(readFileSync(join(APP, f), "utf8")));
    expect(hits).toEqual([]);
  });
});
