import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Loaded as the very first import so services that read process.env at module
 * load (e.g. OSRM_BASE_URL) see the configured values. Looks for .env in the
 * backend folder first, then the repository root (where .env.example lives).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
dotenv.config({ path: path.resolve(here, "../../.env") });
