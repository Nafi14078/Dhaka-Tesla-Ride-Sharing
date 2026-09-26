import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { createRideRequestSchema, cancelRideSchema } from "../validation/schemas";
import * as rideService from "../services/ride.service";
import { prisma } from "../lib/prisma";
import { RideError } from "../services/errors";
import { ZONES } from "../lib/zones";

const router = Router();
router.use(requireAuth);

// Static zone list for the frontend's pickup/destination pickers.
router.get("/zones", (_req, res) => {
  res.json(ZONES.map((z) => ({ name: z.name })));
});

router.post(
  "/",
  requireRole("PASSENGER"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createRideRequestSchema.parse(req.body);
    const request = await rideService.createRideRequest({
      passengerId: req.user!.id,
      ...body,
    });
    res.status(201).json(request);
  })
);

// A passenger's own ride history — never another passenger's.
router.get(
  "/mine",
  requireRole("PASSENGER"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const rides = await prisma.rideRequest.findMany({
      where: { passengerId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(rides);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const ride = await prisma.rideRequest.findUnique({ where: { id: req.params.id } });
    if (!ride) throw new RideError("Ride request not found", 404);
    // Ownership check: a passenger may only view their own ride.
    if (req.user!.role === "PASSENGER" && ride.passengerId !== req.user!.id) {
      throw new RideError("You can only view your own ride", 403);
    }
    res.json(ride);
  })
);

router.post(
  "/:id/cancel",
  requireRole("PASSENGER"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = cancelRideSchema.parse(req.body ?? {});
    const cancelled = await rideService.cancelRideRequest(req.params.id, req.user!.id, body.reason);
    res.json(cancelled);
  })
);

export default router;