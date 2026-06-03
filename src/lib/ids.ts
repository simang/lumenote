import crypto from "node:crypto";

export function newId(prefix: "user" | "install" | "site" | "note" | "asset" | "share" | "run" | "job") {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}
