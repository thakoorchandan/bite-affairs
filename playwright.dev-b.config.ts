// TEMP (admin-flows agent): reuse a manually started e2e server. Delete when done.
import base from "./playwright.config";
export default { ...base, webServer: undefined };
