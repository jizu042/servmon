import NodeCache from "node-cache";
import { loadConfig } from "../config.js";

let brandingCache: NodeCache | null = null;
let statusCache: NodeCache | null = null;

export function getBrandingCache(): NodeCache {
  if (!brandingCache) {
    const c = loadConfig();
    brandingCache = new NodeCache({ stdTTL: c.BRANDING_CACHE_TTL_SEC, checkperiod: 60 });
  }
  return brandingCache;
}

export function getStatusCache(): NodeCache {
  if (!statusCache) {
    const c = loadConfig();
    statusCache = new NodeCache({ stdTTL: c.STATUS_CACHE_TTL_SEC, checkperiod: 15 });
  }
  return statusCache;
}
