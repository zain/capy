import { webhook } from "./stripe";
import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
http.route({ path: "/stripe/webhook", method: "POST", handler: webhook });

export default http;
