import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function backfillOrder() {
  await mongoose.connect(process.env.mongoDB_URL);
  console.log("Connected to MongoDB");

  const db = mongoose.connection;

  const categories = await db
    .collection("categories")
    .updateMany({ order: { $exists: false } }, { $set: { order: 0 } });

  console.log(`Categories updated: ${categories.modifiedCount}`);

  const testSeries = await db
    .collection("testseries")
    .updateMany({ order: { $exists: false } }, { $set: { order: 0 } });

  console.log(`Test series updated: ${testSeries.modifiedCount}`);

  await mongoose.disconnect();
}

backfillOrder().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
