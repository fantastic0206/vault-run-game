import type { VercelRequest, VercelResponse } from "@vercel/node";
import { syncRequest } from "../server/sync.js";
import { ApiError } from "../server/storage.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST." }); }
  try {
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new ApiError("Cross-site requests are not allowed.", 403);
    if (Number(req.headers["content-length"] ?? 0) > 128000) throw new ApiError("Update too large.", 413);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(body).length > 128000) throw new ApiError("Update too large.", 413);
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    return res.status(200).json(await syncRequest(body, token));
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid crew update." });
    return res.status(503).json({ error: "The crew connection is recovering. Retrying…" });
  }
}
