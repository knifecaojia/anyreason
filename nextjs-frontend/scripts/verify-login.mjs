import "dotenv/config";

const baseUrl =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.INTERNAL_API_BASE_URL ||
  "http://127.0.0.1:8000";

const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@example.com";
const password = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";

const openapiResp = await fetch(`${baseUrl}/openapi.json`);
if (!openapiResp.ok) {
  throw new Error(`openapi failed: ${openapiResp.status} ${await openapiResp.text()}`);
}

const form = new URLSearchParams();
form.set("username", email);
form.set("password", password);

const loginResp = await fetch(`${baseUrl}/auth/jwt/login`, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
  },
  body: form,
});

if (!loginResp.ok) {
  throw new Error(`login failed: ${loginResp.status} ${await loginResp.text()}`);
}

const data = await loginResp.json();
if (!data.access_token) {
  throw new Error("login response missing access_token");
}

console.log("OK");
