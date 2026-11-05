import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AuthService, siteUrl } from "./auth/auth.service.js";
export async function createApp() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (!process.env.MONGODB_URI ||
      !process.env.SITE_URL?.startsWith("https://") ||
      !process.env.API_URL?.startsWith("https://"))
  )
    throw new Error(
      "Production requires MONGODB_URI and HTTPS SITE_URL/API_URL.",
    );
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    abortOnError: false,
    logger: process.env.NODE_ENV === "test" ? false : ["log", "warn", "error"],
  });
  app.set("trust proxy", 1);
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.enableCors({ origin: new URL(siteUrl()).origin, credentials: true });
  app.use(express.json({ limit: "300kb" }));
  app.use(express.urlencoded({ extended: false, limit: "30kb" }));
  // Cookie-authenticated writes must originate from this frontend. OAuth callbacks validate their own state.
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        !/^\/api\/(auth\/(google|apple)\/callback|capture\/inbound-email)$/.test(
          req.path,
        )
      ) {
        if (req.headers.origin !== new URL(siteUrl()).origin) {
          res.status(403).json({ message: "Invalid request origin." });
          return;
        }
        if (req.headers["content-type"] && !req.is("application/json")) {
          res.status(415).json({ message: "Use application/json." });
          return;
        }
      }
      next();
    },
  );
  const store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/planbreeze",
    collectionName: "sessions",
    ttl: 30 * 86400,
  });
  app.use(
    session({
      name: "planbreeze.sid",
      secret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: production,
        sameSite: production ? "none" : "lax",
        maxAge: 30 * 86400000,
      },
    }),
  );
  app.use(app.get(AuthService).passport.initialize());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.enableShutdownHooks();
  // Close the session store as well as Nest's Mongoose connection on shutdown.
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    await store.close();
  };
  return app;
}
