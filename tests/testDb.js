// tests/testDb.js
//
// Spins up an in-memory MongoDB per test file (mongodb-memory-server) and
// connects mongoose to it. Deliberately does not go through db.js — that
// module pins Node's DNS resolver and assumes a mongodb+srv:// URL, neither
// of which applies to the local in-memory instance used here.

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;

export const connectTestDb = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
};

export const disconnectTestDb = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
};

export const clearTestDb = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};
