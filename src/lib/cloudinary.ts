import crypto from "crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export class CloudinaryService {
  /**
   * Upload an image (base64 data URL, remote URL) directly to Cloudinary via native HTTPS REST API.
   * Completely runtime-agnostic (Cloudflare Workers, Edge, Node.js).
   */
  async uploadImage(
    file: string,
    folder = "dainty-dazzle",
  ): Promise<{ url: string; publicId: string; width?: number; height?: number } | null> {
    try {
      const cloudName = env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY;
      const apiSecret = env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;

      if (!cloudName || !apiKey || !apiSecret) {
        logger.error(
          `Cloudinary credentials missing in environment: cloudName=${Boolean(cloudName)}, apiKey=${Boolean(apiKey)}, apiSecret=${Boolean(apiSecret)}`,
        );
        return null;
      }

      const timestamp = Math.floor(Date.now() / 1000);

      // Generate SHA-1 signature over sorted parameters + api_secret
      const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto.createHash("sha1").update(paramsToSign).digest("hex");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("folder", folder);
      formData.append("signature", signature);

      const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const json: any = await response.json();

      if (!response.ok || json.error) {
        logger.error("Cloudinary REST API upload error response", json.error || json);
        return null;
      }

      // Generate optimized delivery URL with f_auto,q_auto
      let deliveryUrl = json.secure_url || json.url;
      if (deliveryUrl && deliveryUrl.includes("/upload/")) {
        deliveryUrl = deliveryUrl.replace("/upload/", "/upload/f_auto,q_auto/");
      }

      logger.info(`Successfully uploaded image to Cloudinary: ${json.public_id} (${json.width}x${json.height})`);

      return {
        url: deliveryUrl,
        publicId: json.public_id,
        width: json.width,
        height: json.height,
      };
    } catch (err) {
      logger.error("Cloudinary upload exception", err);
      return null;
    }
  }

  /**
   * Verify Cloudinary API connectivity
   */
  async ping(): Promise<boolean> {
    return Boolean(
      (env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME) &&
      (env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY) &&
      (env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET),
    );
  }
}

export const cloudinaryService = new CloudinaryService();
