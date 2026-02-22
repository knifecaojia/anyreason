
const fetch = require('node-fetch'); // Next.js might use global fetch, but let's try this or native
// Or just use native fetch if node version supports it (v18+)

async function test() {
  try {
    console.log("Fetching http://127.0.0.1:8000/docs...");
    const res = await fetch('http://127.0.0.1:8000/docs');
    console.log("Status:", res.status);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
