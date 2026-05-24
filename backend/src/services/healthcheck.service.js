import pool from "../db/db.js";

export async function getHealthcheckStatus() {
  const checkedAt = new Date().toISOString();
  const startTime = Date.now();

  await pool.query("SELECT 1 AS ok");

  return {
    status: "ok",
    service: "UniFab API",
    database: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    latencyMs: Date.now() - startTime,
    checkedAt,
  };
}
