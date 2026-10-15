import { type RequestHandler } from 'express';
export const asyncRoute = (handler: RequestHandler): RequestHandler => (req, res, next) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };
