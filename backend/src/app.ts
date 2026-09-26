import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import rideRoutes from "./routes/ride.routes";
import driverRoutes from "./routes/driver.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/auth", authRoutes);
  app.use("/rides", rideRoutes);
  app.use("/driver", driverRoutes);

  app.use(errorHandler);
  return app;
}