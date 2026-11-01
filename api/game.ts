import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GameError } from "../server/engine.js";
import { gameRequest } from "../server/service.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST for game actions." });
  }
  try {
    if (req.headers.origin && req.headers.host) {
      let sameOrigin = false;
      try {
        sameOrigin = new URL(req.headers.origin).host === req.headers.host;
      } catch {
        /* Reject malformed origins. */
      }
      if (!sameOrigin)
        throw new GameError("Cross-site game requests are not allowed.", 403);
    }
    if (Number(req.headers["content-length"] || 0) > 4096)
      throw new GameError("Request too large.", 413);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(body ?? "").length > 4096)
      throw new GameError("Request too large.", 413);
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const forwarded = req.headers["x-forwarded-for"];
    const ip = String(
      Array.isArray(forwarded)
        ? forwarded[0]
        : (forwarded ?? req.socket.remoteAddress ?? "unknown"),
    ).split(",")[0];
    const result = await gameRequest(body, token, ip);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof GameError)
      return res
        .status(error.status)
        .json({ error: error.message, kind: error.kind });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON request." });
    console.error(
      "Game request failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return res
      .status(503)
      .json({
        error:
          "The vault is temporarily out of reach. Your seat is saved; try reconnecting.",
        kind: "connection",
      });
  }
}
