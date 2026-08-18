import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function deleteInactiveTestSeries() {
  await mongoose.connect(process.env.mongoDB_URL);
  console.log("Connected to MongoDB");

  const result = await mongoose.connection
    .collection("testseries")
    .deleteMany({ isActive: false });

  console.log(`Deleted ${result.deletedCount} inactive test series.`);
  await mongoose.disconnect();
}

deleteInactiveTestSeries().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
