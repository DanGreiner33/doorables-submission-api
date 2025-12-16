import express from "express";
import multer from "multer";
import axios from "axios";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = "DanGreiner33";
const GITHUB_REPO = "doorables-tracker";
const PRICES_PATH = "prices.json";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN env var");
  process.exit(1);
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

async function getFile(path) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
  });
  return data;
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

app.post("/submit", upload.single("image"), async (req, res) => {
  try {
    const { set_name, store, price, date_seen, notes } = req.body;
    const file = req.file;

    if (!set_name || !store || !price || !date_seen) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let imagePath = null;

    if (file) {
      const ext = file.originalname.split(".").pop() || "jpg";
      const safeName = set_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "set";
      const timestamp = Date.now();
      imagePath = `images/${safeName}-${timestamp}.${ext}`;

      const imageContentBase64 = file.buffer.toString("base64");
      await putFile(imagePath, imageContentBase64, `Add image for set ${set_name}`);
    }

    const pricesFile = await getFile(PRICES_PATH);
    const pricesJson = Buffer.from(pricesFile.content, "base64").toString("utf8");
    let prices = [];
    try {
      prices = JSON.parse(pricesJson);
      if (!Array.isArray(prices)) prices = [];
    } catch {
      prices = [];
    }

    const newRecord = {
      set_name,
      store,
      price,
      date_seen,
      notes: notes || "",
      image_path: imagePath
    };

    prices.push(newRecord);

    const updatedContentBase64 = Buffer.from(JSON.stringify(prices, null, 2), "utf8").toString("base64");

    await putFile(PRICES_PATH, updatedContentBase64, `Add price entry for ${set_name}`, pricesFile.sha);

    res.json({ ok: true, image_path: imagePath });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: "Internal error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server listening on port", port);
});
