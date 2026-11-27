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
        transformation: [
          { width: 1600, height: 1600, crop: "limit" },
          { quality: "auto:good", fetch_format: "auto" },
        ],
      });

      // Deliver via Cloudinary CDN with automated modern format (AVIF/WebP) & adaptive compression
      let optimizedUrl = result.secure_url;
      if (optimizedUrl.includes("/upload/")) {
        optimizedUrl = optimizedUrl.replace("/upload/", "/upload/f_auto,q_auto/");
      }

      return {
        url: optimizedUrl,
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
