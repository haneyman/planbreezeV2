import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { googleCallback } from "./google";
import { inboundEmail } from "./capture";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/google/callback", method: "GET", handler: googleCallback });
http.route({ path: "/inbound-email", method: "POST", handler: inboundEmail });

export default http;
