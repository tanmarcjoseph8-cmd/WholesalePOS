import { app } from "electron";
import { join } from "node:path";

/** Configures the stable private application-data directory shared by provisioning and the packaged manager. */
export function configureLicenseManagerPaths() {
  app.setName("WholesalePOS License Manager");
  app.setPath("userData", join(app.getPath("appData"), "WholesalePOS License Manager"));
}

/** Returns all non-exported local storage paths used by the private License Manager. */
export function licenseManagerPaths() {
  const root = app.getPath("userData");
  return {
    root,
    vault: join(root, "license-manager.wposvault"),
    bootstrap: join(root, "authority.bootstrap.json"),
    backups: join(root, "backups")
  };
}
