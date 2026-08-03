import mongoose from "mongoose";
import request from "supertest";
import app from "../app.js";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./testDb.js";
import User from "../models/Users.js";
import CurrentAffairs from "../models/CurrentAffairs.js";
import StreakActivity from "../models/StreakActivity.js";
import generateToken from "../utils/generateToken.js";
import { todayUtcMidnight, addUtcDays } from "../utils/dateOnly.js";

const createUser = async (overrides = {}) =>
  User.create({
    name: "Streak Reader",
    email: `reader-${new mongoose.Types.ObjectId()}@example.com`,
    password: "Passw0rd!",
    role: "student",
    ...overrides,
  });

const tokenFor = (user) => generateToken(user._id.toString(), user.role);

const createArticle = async (overrides = {}) =>
  CurrentAffairs.create({
    title: "Union Budget Highlights",
    content: "Full article content...",
    isPublished: true,
    isActive: true,
    ...overrides,
  });

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
afterEach(clearTestDb);

describe("POST /api/current-affairs/:id/record-view", () => {
  it("404s for a non-existent article", async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`/api/current-affairs/${new mongoose.Types.ObjectId()}/record-view`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(404);
  });

  it("requires auth", async () => {
    const article = await createArticle();
    const res = await request(app).post(`/api/current-affairs/${article._id}/record-view`);
    expect(res.status).toBe(401);
  });

  it("first-ever view sets currentStreak and longestStreak to 1", async () => {
    const user = await createUser();
    const article = await createArticle();

    const res = await request(app)
      .post(`/api/current-affairs/${article._id}/record-view`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ currentStreak: 1, longestStreak: 1 });

    const stored = await User.findById(user._id);
    expect(stored.currentStreak).toBe(1);
    expect(stored.longestStreak).toBe(1);
    expect(stored.lastActiveDate.getTime()).toBe(todayUtcMidnight().getTime());

    const rows = await StreakActivity.find({ user: user._id });
    expect(rows).toHaveLength(1);
  });

  it("a view on the consecutive day increments the streak", async () => {
    const user = await createUser({
      currentStreak: 3,
      longestStreak: 5,
      lastActiveDate: addUtcDays(todayUtcMidnight(), -1), // yesterday
    });
    const article = await createArticle();

    const res = await request(app)
      .post(`/api/current-affairs/${article._id}/record-view`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.currentStreak).toBe(4);
    expect(res.body.data.longestStreak).toBe(5); // unchanged, still the max
  });

  it("a repeat view on the same day does not change the streak or double-log activity", async () => {
    const user = await createUser();
    const article = await createArticle();
    const token = tokenFor(user);

    const first = await request(app)
      .post(`/api/current-affairs/${article._id}/record-view`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.body.data.currentStreak).toBe(1);

    const second = await request(app)
      .post(`/api/current-affairs/${article._id}/record-view`)
      .set("Authorization", `Bearer ${token}`);

    expect(second.status).toBe(200);
    expect(second.body.data.currentStreak).toBe(1);
    expect(second.body.data.longestStreak).toBe(1);

    const rows = await StreakActivity.find({ user: user._id });
    expect(rows).toHaveLength(1); // not duplicated
  });

  it("a view after a missed day resets the streak to 1 (does not silently continue)", async () => {
    const user = await createUser({
      currentStreak: 7,
      longestStreak: 7,
      lastActiveDate: addUtcDays(todayUtcMidnight(), -3), // missed yesterday and the day before
    });
    const article = await createArticle();

    const res = await request(app)
      .post(`/api/current-affairs/${article._id}/record-view`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.currentStreak).toBe(1);
    expect(res.body.data.longestStreak).toBe(7); // best-ever streak is preserved
  });
});

describe("GET /api/current-affairs/streak", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/current-affairs/streak");
    expect(res.status).toBe(401);
  });

  it("returns exactly the current Mon-Sun window with correct completed flags", async () => {
    const user = await createUser({ currentStreak: 2, longestStreak: 4 });

    const today = todayUtcMidnight();
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    const monday = addUtcDays(today, -daysSinceMonday);

    // Mark Monday and today as active; leave the rest untouched.
    await StreakActivity.create({ user: user._id, date: monday });
    if (monday.getTime() !== today.getTime()) {
      await StreakActivity.create({ user: user._id, date: today });
    }

    const res = await request(app)
      .get("/api/current-affairs/streak")
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.currentStreak).toBe(2);
    expect(res.body.data.longestStreak).toBe(4);

    const { weekActivity } = res.body.data;
    expect(weekActivity).toHaveLength(7);
    expect(weekActivity.map((d) => d.label)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(weekActivity[0].date).toBe(monday.toISOString().slice(0, 10));
    expect(weekActivity[0].completed).toBe(true);

    const todayEntry = weekActivity.find((d) => d.date === today.toISOString().slice(0, 10));
    expect(todayEntry.completed).toBe(true);

    // Every day that wasn't seeded should be false.
    const completedDates = weekActivity.filter((d) => d.completed).map((d) => d.date);
    expect(completedDates.sort()).toEqual(
      [...new Set([monday.toISOString().slice(0, 10), today.toISOString().slice(0, 10)])].sort()
    );
  });
});
