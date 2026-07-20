import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { login } from "./auth.service";

const router = Router();

const loginSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { usuario, password } = loginSchema.parse(req.body);
    const result = await login(usuario, password);
    res.json(result);
  })
);

export default router;
