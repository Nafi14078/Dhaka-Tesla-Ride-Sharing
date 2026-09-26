import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) throw new RideError("Email already registered", 409);

  const passwordHash = await bcrypt.hash(params.password, 10);
  const user = await prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      passwordHash,
      role: params.role,
      phone: params.phone,
    },
  });

  return issueToken(user);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new RideError("Invalid email or password", 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new RideError("Invalid email or password", 401);

  return issueToken(user);
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