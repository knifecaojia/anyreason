
const baseUrl = "https://172.245.56.55";

console.log(`Using Base URL: ${baseUrl}`);

const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@example.com";
const password = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";

const form = new URLSearchParams();
form.set("username", email);
form.set("password", password);

console.log(`Attempting login for ${email}...`);

try {
  const loginResp = await fetch(`${baseUrl}/auth/jwt/login`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!loginResp.ok) {
    console.error(`Login failed: ${loginResp.status} ${loginResp.statusText}`);
    const text = await loginResp.text();
    console.error(`Response body: ${text}`);
    process.exit(1);
  }

  const data = await loginResp.json();
  if (!data.access_token) {
    console.error("Login response missing access_token");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("Login OK! Access token received.");
} catch (error) {
  console.error("Fetch error:", error);
  process.exit(1);
}
