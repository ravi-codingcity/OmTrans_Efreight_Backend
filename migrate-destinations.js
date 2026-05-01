/**
 * migrate-destinations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration script to import old Destination data from a JSON file
 * into the current MongoDB collection.
 *
 * Behaviour:
 *   • Destination does NOT exist → create it (fresh _id, no old $oid reuse)
 *   • Destination ALREADY exists → merge shipping lines (skip duplicates by name)
 *
 * Usage:
 *   1. Place your exported JSON file (array of documents) next to this script,
 *      e.g.  D:\OmTrans_Freight\Backend\destinations_old.json
 *   2. node migrate-destinations.js
 *      or
 *      node migrate-destinations.js path\to\your-file.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

const dns      = require('dns');
const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
require('dotenv').config(); // loads .env from Backend root

// Same fix used in database.js — allows Atlas SRV records to resolve
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ── Destination model (inline — avoids any import-path issues) ────────────────
const shippingLineSchema = new mongoose.Schema(
  {
    lineName: { type: String, required: true, trim: true },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

const destinationSchema = new mongoose.Schema(
  {
    destinationName: { type: String, required: true, trim: true, unique: true },
    isActive:        { type: Boolean, default: true },
    shippingLines:   { type: [shippingLineSchema], default: [] },
  },
  { timestamps: true }
);

const Destination = mongoose.model('Destination', destinationSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Unwrap MongoDB Extended JSON values produced by mongoexport / MongoDB Compass */
function unwrapExtJSON(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    if ('$oid'  in val) return val.$oid;          // ObjectId
    if ('$date' in val) return new Date(val.$date);// ISODate
    if (Array.isArray(val)) return val.map(unwrapExtJSON);
    const out = {};
    for (const k of Object.keys(val)) out[k] = unwrapExtJSON(val[k]);
    return out;
  }
  return val;
}

/** Normalise a name for duplicate comparison (lower-case, trim) */
const norm = (s) => String(s || '').toLowerCase().trim();

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // ── 1. Load JSON file ────────────────────────────────────────────────────────
  const jsonArg  = process.argv[2];
  const jsonPath = jsonArg
    ? path.resolve(jsonArg)
    : path.join(__dirname, 'destinations_old.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`\n✖  JSON file not found: ${jsonPath}`);
    console.error('   Pass the path as an argument:  node migrate-destinations.js path\\to\\file.json\n');
    process.exit(1);
  }

  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    console.error(`\n✖  Failed to parse JSON: ${err.message}\n`);
    process.exit(1);
  }

  // Accept both a single object and an array
  const docs = (Array.isArray(rawData) ? rawData : [rawData]).map(unwrapExtJSON);
  console.log(`\n📄  Loaded ${docs.length} destination(s) from ${path.basename(jsonPath)}`);

  // ── 2. Connect to MongoDB ────────────────────────────────────────────────────
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('\n✖  MONGODB_URI is not set in .env\n');
    process.exit(1);
  }
  console.log('🔌  Connecting to MongoDB …');
  await mongoose.connect(uri);
  console.log('✔   Connected\n');

  // ── 3. Migrate each document ──────────────────────────────────────────────────
  let created  = 0;
  let updated  = 0;
  let skipped  = 0;   // lines skipped (already exist)
  let linesAdded = 0;

  for (const doc of docs) {
    const destName = String(doc.destinationName || '').trim();
    if (!destName) {
      console.warn('  ⚠  Skipping document with no destinationName');
      continue;
    }

    const incomingLines = (doc.shippingLines || []).filter(
      (l) => l && String(l.lineName || '').trim()
    );

    // Case-insensitive lookup
    const existing = await Destination.findOne({
      destinationName: { $regex: new RegExp(`^${destName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (!existing) {
      // ── CREATE ────────────────────────────────────────────────────────────────
      const newLines = incomingLines.map((l) => ({
        lineName: String(l.lineName).trim(),
        isActive: l.isActive !== false,
      }));

      await Destination.create({
        destinationName: destName,
        isActive:        doc.isActive !== false,
        shippingLines:   newLines,
      });

      linesAdded += newLines.length;
      created++;
      console.log(`  ✅  CREATED  "${destName}"  (${newLines.length} line${newLines.length !== 1 ? 's' : ''})`);
    } else {
      // ── MERGE shipping lines ──────────────────────────────────────────────────
      const existingLineNames = new Set(
        existing.shippingLines.map((l) => norm(l.lineName))
      );

      const linesToAdd = incomingLines.filter(
        (l) => !existingLineNames.has(norm(l.lineName))
      );
      const skippedLines = incomingLines.length - linesToAdd.length;
      skipped += skippedLines;

      if (linesToAdd.length > 0) {
        const pushLines = linesToAdd.map((l) => ({
          lineName: String(l.lineName).trim(),
          isActive: l.isActive !== false,
        }));
        await Destination.updateOne(
          { _id: existing._id },
          { $push: { shippingLines: { $each: pushLines } } }
        );
        linesAdded += linesToAdd.length;
        updated++;
        console.log(
          `  🔄  MERGED  "${destName}"  +${linesToAdd.length} new line(s)` +
          (skippedLines > 0 ? `  (${skippedLines} already existed)` : '')
        );
      } else {
        console.log(`  ⏭   SKIPPED "${destName}"  — all ${incomingLines.length} line(s) already present`);
      }
    }
  }

  // ── 4. Summary ───────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log(`  Destinations created : ${created}`);
  console.log(`  Destinations merged  : ${updated}`);
  console.log(`  Shipping lines added : ${linesAdded}`);
  console.log(`  Lines already existed: ${skipped}`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('✔   Done. Database connection closed.\n');
}

main().catch((err) => {
  console.error('\n✖  Migration failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
