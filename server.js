import express from "express";
import multer from "multer";
import axios from "axios";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = "DanGreiner33";
const GITHUB_REPO = "doorables-tracker";
const SUBMISSIONS_PATH = "submissions.json";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN env var");
  process.exit(1);
}

// Enable CORS for the form
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Helper functions for GitHub API
async function getFile(path) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    return data;
  } catch (err) {
    if (err.response?.status === 404) {
      return null; // File doesn't exist yet
    }
    throw err;
  }
}

async function putFile(path, contentBase64, message, sha) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: contentBase64,
    ...(sha ? { sha } : {})
  };
  const { data } = await axios.put(url, body, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
  });
  return data;
}

// Main submission endpoint
app.post("/submit", upload.single("image"), async (req, res) => {
  try {
    const { contributorName, characterName, series, rarity, estimatedValue, notes } = req.body;
    const file = req.file;

    // Validate required fields
    if (!contributorName || !series || !rarity || !estimatedValue) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Handle image upload if provided
    let imagePath = null;
    if (file) {
      const ext = file.originalname.split(".").pop() || "jpg";
      const safeName = (characterName || "doorable").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "doorable";
      const timestamp = Date.now();
      imagePath = `images/submissions/${safeName}-${timestamp}.${ext}`;
      
      const imageContentBase64 = file.buffer.toString("base64");
      await putFile(imagePath, imageContentBase64, `Add image for ${characterName || series}`);
    }

    // Get or create submissions file
    const submissionsFile = await getFile(SUBMISSIONS_PATH);
    let submissions = [];
    
    if (submissionsFile) {
      const submissionsJson = Buffer.from(submissionsFile.content, "base64").toString("utf8");
      try {
        submissions = JSON.parse(submissionsJson);
        if (!Array.isArray(submissions)) submissions = [];
      } catch {
        submissions = [];
      }
    }

    // Create new submission record
    const newSubmission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      contributorName,
      characterName: characterName || "",
      series,
      rarity,
      estimatedValue: parseFloat(estimatedValue),
      notes: notes || "",
      imagePath,
      submittedAt: new Date().toISOString(),
        status: "approved" // Auto-approved - will be processed directly into database    };

    submissions.push(newSubmission);

    // Write back to GitHub
        // Re-fetch to get the latest SHA (important after image upload)
        const latestSubmissionsFile = await getFile(SUBMISSIONS_PATH);
    const updatedContentBase64 = Buffer.from(JSON.stringify(submissions, null, 2), "utf8").toString("base64");
    await putFile(
      SUBMISSIONS_PATH,
      updatedContentBase64,
      `Add submission from ${contributorName}`,
      latestSubmissionsFile?.sha    );

    res.json({ 
      success: true, 
      submissionId: newSubmission.id,
      imagePath 
    });
    
  } catch (err) {
    console.error("Submission error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to process submission" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Doorables submission API listening on port ${port}`);
});
