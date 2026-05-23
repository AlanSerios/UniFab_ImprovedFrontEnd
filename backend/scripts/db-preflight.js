import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(backendRoot, ".env") });

const PRODUCTION_REQUIRED_FLAGS = [
  "PROD_DB_BACKUPS_CONFIRMED",
  "PROD_DB_PITR_CONFIRMED",
  "PROD_DB_RESTORE_DRILL_CONFIRMED",
  "MYSQL_SLOW_QUERY_LOGS_CONFIRMED",
  "FILE_STORAGE_BACKUP_CONFIRMED",
];

const RECOMMENDED_ENV = [
  "QUOTE_CLEANUP_INTERVAL_MINUTES",
  "DESIGN_FILE_CLEANUP_INTERVAL_MINUTES",
  "DB_RETENTION_CLEANUP_INTERVAL_MINUTES",
];

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const childCommand = process.platform === "win32" ? "cmd.exe" : command;
    const childArgs =
      process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(childCommand, childArgs, {
      stdio: "inherit",
      shell: false,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function validateProductionGate() {
  const failures = [];
  const warnings = [];

  if (process.env.NODE_ENV === "production") {
    for (const name of PRODUCTION_REQUIRED_FLAGS) {
      if (process.env[name] !== "true") {
        failures.push(`${name}=true is required for production preflight.`);
      }
    }
  }

  if (process.env.NODE_ENV === "production") {
    for (const name of RECOMMENDED_ENV) {
      if (!process.env[name]) {
        warnings.push(`${name} is not set; default cleanup interval will be used.`);
      }
    }
  }

  return { failures, warnings };
}

async function main() {
  const gate = validateProductionGate();

  for (const warning of gate.warnings) {
    console.warn(`Preflight warning: ${warning}`);
  }

  if (gate.failures.length > 0) {
    throw new Error(gate.failures.join("\n"));
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  await runCommand(npmCommand, ["run", "db:migrate", "--", "--status"]);
  await runCommand(npmCommand, ["run", "db:check"]);

  console.log(
    JSON.stringify(
      {
        status: "ok",
        productionGate:
          process.env.NODE_ENV === "production" ? "strict" : "development",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
