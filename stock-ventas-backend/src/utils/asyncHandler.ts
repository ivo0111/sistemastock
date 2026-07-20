import { Request, Response, NextFunction, RequestHandler } from "express";

// Envuelve un controller async para que cualquier error caiga en el errorHandler,
// sin necesidad de try/catch repetido en cada endpoint.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
