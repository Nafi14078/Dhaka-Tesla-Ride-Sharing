import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["PASSENGER", "DRIVER"]),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createRideRequestSchema = z.object({
  pickupZone: z.string().min(1),
  destinationZone: z.string().min(1),
  seats: z.number().int().min(1).max(3),
});

export const cancelRideSchema = z.object({
  reason: z.string().optional(),
});

export const registerVehicleSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1).max(6),
});

export const joinPoolSchema = z.object({
  poolId: z.string().min(1),
  rideRequestId: z.string().min(1),
});