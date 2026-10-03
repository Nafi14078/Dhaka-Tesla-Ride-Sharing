import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { registerVehicleSchema, joinPoolSchema } from "../validation/schemas";
import * as rideService from "../services/ride.service";
import { prisma } from "../lib/prisma";
import { RideError } from "../services/errors";

const router = Router();
router.use(requireAuth, requireRole("DRIVER"));

// Register (or fetch) the driver's Tesla. One active vehicle per
// driver in this MVP (see README §Assumptions).
router.post(
  "/vehicle",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = registerVehicleSchema.parse(req.body);
    const vehicle = await prisma.vehicle.upsert({
      where: { driverId: req.user!.id },
      update: { name: body.name, capacity: body.capacity },
      create: { driverId: req.user!.id, name: body.name, capacity: body.capacity },
    });
    res.status(201).json(vehicle);
  })
);

router.get(
  "/vehicle",
  asyncHandler(async (req: AuthedRequest, res) => {
    const vehicle = await prisma.vehicle.findUnique({ where: { driverId: req.user!.id } });
    if (!vehicle) throw new RideError("No Tesla registered yet", 404);
    res.json(vehicle);
  })
);

router.post(
  "/vehicle/online",
  asyncHandler(async (req: AuthedRequest, res) => {
    const isOnline = Boolean(req.body?.isOnline);
    const vehicle = await prisma.vehicle.update({
      where: { driverId: req.user!.id },
      data: { isOnline },
    });
    res.json(vehicle);
  })
);

// Pending, unpooled requests a driver can accept. Optional ?zone=
// filter matches the PRD's "see relevant requests" — kept simple
// (exact zone match) rather than a real dispatch/geo-search.
router.get(
  "/requests",
  asyncHandler(async (req: AuthedRequest, res) => {
    const zone = typeof req.query.zone === "string" ? req.query.zone : undefined;
    const requests = await prisma.rideRequest.findMany({
      where: { status: "REQUESTED", ...(zone ? { pickupZone: zone } : {}) },
      orderBy: { createdAt: "asc" },
      include: { passenger: { select: { name: true } } },
    });
    res.json(requests);
  })
);

router.post(
  "/requests/:id/accept",
  asyncHandler(async (req: AuthedRequest, res) => {
    const updated = await rideService.acceptRideRequest(req.params.id, req.user!.id);
    res.json(updated);
  })
);

// Add a second (or third) compatible passenger into an already-MATCHED
// pool. This is the concurrency-critical path — see ride.service.ts.
router.post(
  "/pools/join",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = joinPoolSchema.parse(req.body);
    const updated = await rideService.joinPool(body.poolId, body.rideRequestId, req.user!.id);
    res.json(updated);
  })
);

// The driver's in-progress trip must be loaded independently of the
// pending-request list so the dashboard remains accurate after a reload.
router.get(
  "/current-pool",
  asyncHandler(async (req: AuthedRequest, res) => {
    const vehicle = await prisma.vehicle.findUnique({ where: { driverId: req.user!.id } });
    if (!vehicle) return res.json(null);
    const pool = await prisma.pool.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: { in: ["OPEN", "MATCHED", "DRIVER_ARRIVED", "STARTED"] },
      },
      include: {
        vehicle: true,
        rideRequests: {
          where: { status: { in: ["MATCHED", "DRIVER_ARRIVED", "STARTED"] } },
          include: { passenger: { select: { name: true } } },
        },
      },
    });
    res.json(pool);
  })
);

router.get(
  "/pools/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const pool = await prisma.pool.findUnique({
      where: { id: req.params.id },
      include: {
        vehicle: true,
        rideRequests: { include: { passenger: { select: { name: true } } } },
      },
    });
    if (!pool) throw new RideError("Pool not found", 404);
    if (pool.vehicle.driverId !== req.user!.id) {
      throw new RideError("You do not operate this Tesla", 403);
    }
    res.json(pool);
  })
);

router.post(
  "/pools/:id/arrive",
  asyncHandler(async (req: AuthedRequest, res) => {
    const pool = await rideService.advancePool(req.params.id, req.user!.id, "DRIVER_ARRIVED");
    res.json(pool);
  })
);

router.post(
  "/pools/:id/start",
  asyncHandler(async (req: AuthedRequest, res) => {
    const pool = await rideService.advancePool(req.params.id, req.user!.id, "STARTED");
    res.json(pool);
  })
);

router.post(
  "/pools/:id/complete",
  asyncHandler(async (req: AuthedRequest, res) => {
    const pool = await rideService.advancePool(req.params.id, req.user!.id, "COMPLETED");
    res.json(pool);
  })
);

// Driver's ride/pool history.
router.get(
  "/history",
  asyncHandler(async (req: AuthedRequest, res) => {
    const vehicle = await prisma.vehicle.findUnique({ where: { driverId: req.user!.id } });
    if (!vehicle) return res.json([]);
    const pools = await prisma.pool.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { createdAt: "desc" },
      include: { rideRequests: { include: { passenger: { select: { name: true } } } } },
    });
    res.json(pools);
  })
);

export default router;
