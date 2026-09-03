import { env } from "../../config/env.js";

export function isHugoBufferInboundEnabled(): boolean {
  if (env.NODE_ENV === "production" || env.DATABASE_ENVIRONMENT === "production") {
    return false;
  }
  return env.ENABLE_HUGO_BUFFER_INBOUND === "true";
}

export function hugoBufferInboundPreferences() {
  const location = env.HUGO_BUFFER_IN_LOCATION_PREFERENCE?.trim() || null;
  const warehouse = env.HUGO_BUFFER_IN_WAREHOUSE_PREFERENCE?.trim() || null;
  return {
    preferredLocationCode: location,
    preferredWarehouse: warehouse
  };
}
