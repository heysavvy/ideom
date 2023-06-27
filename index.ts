import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";

import run from "./src/run";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

app.get("/", (req: Request, res: Response) => {
  res.send("Express + TypeScript Server!!!");
});

app.get("/process", (req: Request, res: Response) => {
  const process_key = req.query.process_key as string | null;
  const steps = req.body?.steps || null;

  return run({ process_key, steps }).then(() => res.send("Processed!"));
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
