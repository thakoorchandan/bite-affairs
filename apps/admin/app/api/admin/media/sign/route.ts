import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createUploadSignature, getCloudinaryConfig } from "@/lib/cloudinary";
import { assertSameOrigin } from "@/lib/security/request";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const bodySchema = z.object({ kind: z.enum(["image", "video"]), subfolder: z.enum(["products", "categories", "content", "videos", "deliveries"]).optional() });

/** Issues a short-lived signed upload for the admin's browser to upload directly to Cloudinary. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    await enforceRateLimit(`media-sign:${admin.id}`, 120, 60 * 60);
    const cfg = getCloudinaryConfig();
    if (!cfg) return NextResponse.json({ error: "Cloudinary is not configured. Add CLOUDINARY_* variables to enable uploads." }, { status: 503 });
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(createUploadSignature(cfg, { kind: body.kind, subfolder: body.subfolder }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 400;
    return NextResponse.json({ error: (error as Error).message || "Request failed" }, { status });
  }
}
