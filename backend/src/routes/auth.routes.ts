import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { signupSchema, loginSchema } from "../validation/schemas";
import * as authService from "../services/auth.service";

const router = Router();

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const body = signupSchema.parse(req.body);
    const result = await authService.signup(body);
    res.status(201).json(result);
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password);
    res.json(result);
  })
);

export default router;