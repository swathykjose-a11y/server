import crypto from "node:crypto";
import { env } from "../config/env.js";

const JWT_SECRET = env.JWT_SECRET;

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/**
 * Hashes a plaintext password using crypto.scrypt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifies a plaintext password against a stored salt:hash string
 */
export function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, key] = combinedHash.split(":");
    if (!salt || !key) return false;
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export interface AdminTokenPayload {
  adminId: string;
  email: string;
  role: string;
  exp: number;
}

/**
 * Generates a signed token for admin authentication
 */
export function generateAdminToken(admin: { id: string; email: string; role: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days expiration
  const payload = Buffer.from(
    JSON.stringify({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      exp,
    }),
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

/**
 * Validates a signed admin token
 */
/** Unguessable capability for reading one order. Knowing the order id is not enough. */
export function orderViewToken(orderId: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(`order-view:${orderId}`).digest("base64url");
}

export function orderViewTokenMatches(orderId: string, token: string): boolean {
  if (!token || token.length > 200) return false;
  return safeEqual(orderViewToken(orderId), token);
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (!safeEqual(signature, expectedSignature)) return null;

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as AdminTokenPayload;
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return decoded;
  } catch {
    return null;
  }
}
