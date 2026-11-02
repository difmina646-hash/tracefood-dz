import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/common';

const app = createApp();
const server = app.listen(env.PORT, () => console.log(`✅ TraceFood DZ API listening on http://localhost:${env.PORT}  (health: /api/health)`));
const stop = async () => { server.close(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
