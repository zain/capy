import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Expired MCP download codes, drafted changes past their review window, and dead OAuth rows.
crons.hourly("mcp cleanup", { minuteUTC: 17 }, internal.mcp.cleanup);

export default crons;
