import type { VercelRequest, VercelResponse } from "@vercel/node";
import { roomRequest } from "../server/rooms.js";
import { ApiError } from "../server/storage.js";
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  try {
    if (req.headers.origin) {
      let ok = false;
      try {
        ok = new URL(req.headers.origin).host === req.headers.host;
      } catch {}
      if (!ok) throw new ApiError("Cross-site requests are not allowed.", 403);
    }
    if (Number(req.headers["content-length"] ?? 0) > 4096)
      throw new ApiError("Request too large.", 413);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(body).length > 4096)
      throw new ApiError("Request too large.", 413);
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const ip = String(
      req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown",
    ).split(",")[0];
    return res.status(200).json(await roomRequest(body, token, ip));
  } catch (error) {
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON." });
    return res
      .status(503)
      .json({
        error:
          "Co-op storage is temporarily unavailable. Solo play is still available.",
      });
  }
}
