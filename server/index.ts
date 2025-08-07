import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import "dotenv/config"; // Loads .env
import { setupVite, serveStatic, log } from "./vite";
import path from "path";

const app = express();

// Basic CORS and security configuration
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:5000",
    /https:\/\/.*\.repl\.co$/,
    /https:\/\/.*\.replit\.dev$/,
    /https:\/\/.*\.replit\.app$/,
  ];

  const origin = req.headers.origin;
  if (
    origin &&
    (allowedOrigins.includes(origin) ||
      allowedOrigins.some(
        (pattern) => pattern instanceof RegExp && pattern.test(origin),
      ))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Serve files from attached_assets directory
app.use(
  "/attached_assets",
  express.static(path.join(process.cwd(), "attached_assets")),
);

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT || 5000;
  const tryListen = (port: number) => {
    server
      .listen(
        {
          port,
          host: "0.0.0.0",
          reusePort: true,
          keepAliveTimeout: 30_000, // 👈 Safer for slow networks
          headersTimeout: 30_000, // 👈 Give more time for headers
        },
        () => {
          log(`serving on port ${port}`);
        },
      )
      .on("connection", (socket) => {
        socket.setTimeout(90_000); // 👈 90s for idle (very conservative)
        socket.on("close", () => {});
      });
  };

  tryListen(Number(port));
})();
