/**
 * /kit/our-one.mjs and /kit/our.one.schema.json: the tool and the manifest's
 * schema (D-0019 §B, M-0016), served from kit/ in the commit that was built.
 * build.md names the tool's SHA-256, so an agent can confirm it has this
 * file. Only these two files are served; any other name is not found.
 *
 * Static: each is read once, when the site is built.
 */
import { notFound } from "next/navigation";
import { isKitFile, KIT_ROUTE_FILES, kitResponse } from "@/core/kit";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): { file: string }[] {
  return KIT_ROUTE_FILES.map((file) => ({ file }));
}

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await context.params;
  if (!isKitFile(file) || !KIT_ROUTE_FILES.includes(file)) notFound();
  return kitResponse(file);
}
