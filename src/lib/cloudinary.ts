import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export class CloudinaryService {
  /**
   * Upload an image (base64 string, file path, or remote URL) to Cloudinary
   */
  async uploadImage(
    file: string,
    folder = "dainty-dazzle",
  ): Promise<{ url: string; publicId: string; width?: number; height?: number } | null> {
    try {
      const result = await cloudinary.uploader.upload(file, {
        folder,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      };
    } catch (err) {
      logger.error("Cloudinary upload error", err);
      return null;
    }
  }

  /**
   * Verify Cloudinary API connectivity
   */
  async ping(): Promise<boolean> {
    try {
      const res = await cloudinary.api.ping();
      return res.status === "ok";
    } catch {
      return false;
    }
  }
}

export const cloudinaryService = new CloudinaryService();
