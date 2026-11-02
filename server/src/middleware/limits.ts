import rateLimit from 'express-rate-limit';
const base = { standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } } };
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 30 });      // login / register / reset
export const publicLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 120 });          // public QR pages
export const complaintLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: 10 });  // anonymous feedback
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 600 });
