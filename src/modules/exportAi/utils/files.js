const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { logger } = require("../config/logger");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function sha256File(filePath) {
  const buf = await fsp.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Reads a file and returns base64 — used to build Gemini inline data parts. */
async function fileToBase64(filePath) {
  const buf = await fsp.readFile(filePath);
  return buf.toString("base64");
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") logger.warn("Failed to delete file", { filePath, error: err.message });
  }
}

async function safeRmDir(dir) {
  if (!dir) return;
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch (err) {
    logger.warn("Failed to remove directory", { dir, error: err.message });
  }
}

function sanitizeFilename(name) {
  return path.basename(name).replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
}

module.exports = { ensureDir, sha256File, fileToBase64, safeUnlink, safeRmDir, sanitizeFilename };
