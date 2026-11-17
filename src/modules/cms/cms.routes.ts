import { Hono } from "hono";
import { cmsService } from "./cms.service.js";

export const cmsRouter = new Hono();

// GET /api/cms/:section (hero, featured, editorial, story, bottom-banner)
cmsRouter.get("/:section", async (c) => {
  const section = c.req.param("section");
  const data = await cmsService.getSectionData(section);
  return c.json(data || {});
});
