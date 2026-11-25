
const CLOUD_API =
  "https://stardew-sync.lozanoabraham892.workers.dev";

// Temporary session only. It disappears on page reload.
let cloudToken = null;
let cloudTokenExpiresAt = 0;
let cloudSaveETag = null;

// Login to Cloudflare.
async function cloudLogin() {
  const password = prompt("Enter your Stardew Cloud password:");

  if (!password) {
    throw new Error("Login cancelled");
  }

  const response = await fetch(`${CLOUD_API}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });

  if (!response.ok) {
    throw new Error("Cloud login failed: " + response.status);
  }

  const result = await response.json();

  if (!result.token || !result.expiresIn) {
    throw new Error("Cloud login returned an invalid session.");
  }

  cloudToken = result.token;
  cloudTokenExpiresAt = Date.now() + result.expiresIn * 1000;

  console.log("Stardew Cloud connected!");
}

// Get a valid temporary session.
async function ensureCloudLogin() {
  if (!cloudToken || Date.now() >= cloudTokenExpiresAt - 10000) {
    await cloudLogin();
  }
}

// Download the cloud save from R2.
async function downloadCloudSave() {
  await ensureCloudLogin();

  const response = await fetch(`${CLOUD_API}/save`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${cloudToken}`
    }
  });

  if (!response.ok) {
    throw new Error("Cloud download failed: " + response.status);
  }

  cloudSaveETag = response.headers.get("ETag");

  // Return the complete TAR archive as binary data.
  return await response.arrayBuffer();
}

// Upload a save archive to Cloudflare.
async function uploadCloudSave(saveData) {
  await ensureCloudLogin();

  // Get the current cloud version if we don't have one.
  if (cloudSaveETag === null) {
    const check = await fetch(`${CLOUD_API}/save`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cloudToken}`
      }
    });

    if (check.status === 404) {
      cloudSaveETag = null;
    } else if (check.ok) {
      cloudSaveETag = check.headers.get("ETag");
    } else {
      throw new Error("Could not check cloud save: " + check.status);
    }
  }

  const headers = {
    "Authorization": `Bearer ${cloudToken}`,
    "Content-Type": "application/octet-stream"
  };

  if (cloudSaveETag) {
    headers["If-Match"] = cloudSaveETag;
  }

  const response = await fetch(`${CLOUD_API}/save`, {
    method: "PUT",
    headers,
    body: saveData
  });

  if (response.status === 412) {
    throw new Error(
      "Your cloud save changed on another device. Download it before uploading."
    );
  }

  if (!response.ok) {
    throw new Error("Cloud upload failed: " + response.status);
  }

  const result = await response.json();
  cloudSaveETag = result.etag || response.headers.get("ETag");

  console.log("Stardew save uploaded!");
}

// Make functions available to game.js.
window.cloudLogin = cloudLogin;
window.downloadCloudSave = downloadCloudSave;
window.uploadCloudSave = uploadCloudSave;
