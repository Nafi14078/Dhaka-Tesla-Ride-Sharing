import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { RideError } from "./errors";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

export async function signup(params: {
  name: string;
  email: string;
  password: string;
  role: "PASSENGER" | "DRIVER";
  phone?: string;
}) {
  const email = params.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new RideError("Email already registered", 409);

  const passwordHash = await bcrypt.hash(params.password, 10);
  const user = await prisma.user.create({
    data: {
      name: params.name,
      email,
      passwordHash,
      role: params.role,
      phone: params.phone,
    },
  });

  return issueToken(user);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new RideError("Invalid email or password", 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new RideError("Invalid email or password", 401);

  return issueToken(user);
}

export async function googleLogin(credential: string, role?: "PASSENGER" | "DRIVER") {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new RideError("Google sign-in is not configured", 503);

  let claims: { aud?: string; iss?: string; exp?: string; email?: string; email_verified?: string; name?: string };
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!response.ok) throw new Error("Google rejected the credential");
    claims = await response.json() as typeof claims;
  } catch {
    throw new RideError("Could not verify Google account. Please try again.", 401);
  }
  if (
    claims.aud !== clientId ||
    !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss || "") ||
    !claims.exp || Number(claims.exp) <= Math.floor(Date.now() / 1000) ||
    claims.email_verified !== "true" ||
    !claims.email
  ) {
    throw new RideError("Google account verification failed", 401);
  }

  const email = claims.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return issueToken(existing);
  if (!role) throw new RideError("No account found for this Google address. Sign up first.", 404);

  // Google-only accounts still use the existing required passwordHash column.
  const passwordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 10);
  try {
    const user = await prisma.user.create({
      data: { name: claims.name?.trim() || email.split("@")[0], email, passwordHash, role },
    });
    return issueToken(user);
  } catch (error) {
    // A concurrent signup may have created the same verified email.
    if ((error as { code?: string }).code === "P2002") {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) return issueToken(user);
    }
    throw error;
  }
}

function issueToken(user: { id: string; role: string; name: string; email: string }) {
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export function verifyToken(token: string): { sub: string; role: "PASSENGER" | "DRIVER" } {
  return jwt.verify(token, JWT_SECRET) as any;
}
