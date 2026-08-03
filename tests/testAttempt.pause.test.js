import mongoose from "mongoose";
import request from "supertest";
import app from "../app.js";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./testDb.js";
import User from "../models/Users.js";
import Test from "../models/Test.js";
import Question from "../models/Question.js";
import TestAttempt from "../models/TestAttempt.js";
import generateToken from "../utils/generateToken.js";

const MINUTE_MS = 60 * 1000;

const createUser = async (overrides = {}) =>
  User.create({
    name: "Test Student",
    email: `student-${new mongoose.Types.ObjectId()}@example.com`,
    password: "Passw0rd!",
    role: "student",
    ...overrides,
  });

const tokenFor = (user) => generateToken(user._id.toString(), user.role);

const createTest = async (overrides = {}) => {
  const section = { name: "Section A", no_of_questions: 1, no_of_marks: 1, duration: 10 };
  return Test.create({
    title: "Sample Mock Test",
    testSeries: new mongoose.Types.ObjectId(),
    sections: [section],
    duration: section.duration,
    totalQuestions: 1,
    totalMarks: 1,
    isActive: true,
    isPublished: true,
    ...overrides,
  });
};

// startedAt/expiresAt chosen so the attempt has `remainingMinutes` minutes
// of wall-clock time left at the moment the fixture is created.
const createAttempt = async (user, test, remainingMinutes, overrides = {}) => {
  const durationMs = test.duration * MINUTE_MS;
  const startedAt = new Date(Date.now() - (durationMs - remainingMinutes * MINUTE_MS));
  const expiresAt = new Date(startedAt.getTime() + durationMs);
  return TestAttempt.create({
    user: user._id,
    test: test._id,
    startedAt,
    expiresAt,
    totalMarks: test.totalMarks,
    status: "in-progress",
    ...overrides,
  });
};

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
afterEach(clearTestDb);

describe("POST /api/test-attempts/:attemptId/pause", () => {
  it("pauses an in-progress attempt and returns a remainingSeconds close to what's left", async () => {
    const user = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(user, test, 5); // 5 minutes left

    const res = await request(app)
      .post(`/api/test-attempts/${attempt._id}/pause`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("paused");
    // ~300s left, allow slack for test execution time.
    expect(res.body.data.remainingSeconds).toBeGreaterThan(290);
    expect(res.body.data.remainingSeconds).toBeLessThanOrEqual(300);

    const stored = await TestAttempt.findById(attempt._id);
    expect(stored.status).toBe("paused");
    expect(stored.pausedAt).not.toBeNull();
    expect(stored.pauseCount).toBe(1);
  });

  it("rejects pausing an attempt that is already paused", async () => {
    const user = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(user, test, 5, {
      status: "paused",
      pausedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/test-attempts/${attempt._id}/pause`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect([400, 409]).toContain(res.status);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("paused");
  });

  it("rejects pausing a submitted attempt", async () => {
    const user = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(user, test, 5, { status: "completed" });

    const res = await request(app)
      .post(`/api/test-attempts/${attempt._id}/pause`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect([400, 409]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it("rejects pausing someone else's attempt with 403", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(owner, test, 5);

    const res = await request(app)
      .post(`/api/test-attempts/${attempt._id}/pause`)
      .set("Authorization", `Bearer ${tokenFor(intruder)}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("404s for a non-existent attempt", async () => {
    const user = await createUser();
    const res = await request(app)
      .post(`/api/test-attempts/${new mongoose.Types.ObjectId()}/pause`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/test-attempts/:attemptId/resume", () => {
  it("rejects resuming an attempt that isn't paused", async () => {
    const user = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(user, test, 5); // in-progress

    const res = await request(app)
      .post(`/api/test-attempts/${attempt._id}/resume`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect([400, 409]).toContain(res.status);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("in-progress");
  });

  it("rejects resuming someone else's attempt with 403", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(owner, test, 5, {
      status: "paused",
      pausedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/test-attempts/${attempt._id}/resume`)
      .set("Authorization", `Bearer ${tokenFor(intruder)}`);

    expect(res.status).toBe(403);
  });

  it("pause -> resume cycle: paused time is excluded from remainingSeconds", async () => {
    const user = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(user, test, 5); // 300s left
    const token = tokenFor(user);

    const pauseRes = await request(app)
      .post(`/api/test-attempts/${attempt._id}/pause`)
      .set("Authorization", `Bearer ${token}`);
    expect(pauseRes.status).toBe(200);
    const remainingAtPause = pauseRes.body.data.remainingSeconds;

    // Simulate having spent 2 real minutes paused, by backdating pausedAt —
    // avoids an actual 2-minute sleep in the test suite.
    await TestAttempt.findByIdAndUpdate(attempt._id, {
      pausedAt: new Date(Date.now() - 2 * MINUTE_MS),
    });

    const resumeRes = await request(app)
      .post(`/api/test-attempts/${attempt._id}/resume`)
      .set("Authorization", `Bearer ${token}`);

    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.status).toBe("in-progress");
    // The 2 minutes spent paused must NOT have been burned off the timer —
    // remaining time right after resume should still be ~ what it was at
    // the moment of pausing, not ~120s less.
    expect(resumeRes.body.data.remainingSeconds).toBeGreaterThanOrEqual(remainingAtPause - 2);

    const stored = await TestAttempt.findById(attempt._id);
    expect(stored.totalPausedDurationMs).toBeGreaterThanOrEqual(2 * MINUTE_MS - 2000);
    expect(stored.pausedAt).toBeNull();
  });

  it("auto-submits on resume if the timer had already run out before pausing", async () => {
    const user = await createUser();
    const test = await createTest();
    // 0 minutes left at the moment of creation.
    const attempt = await createAttempt(user, test, 0, {
      status: "paused",
      pausedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/test-attempts/${attempt._id}/resume`)
      .set("Authorization", `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("auto-submitted");
    expect(res.body.data.remainingSeconds).toBe(0);
  });
});

describe("pause interaction with answer-mutating endpoints", () => {
  const setupPausedAttemptWithQuestion = async () => {
    const user = await createUser();
    const test = await createTest();
    const question = await Question.create({
      questionText: "2 + 2 = ?",
      options: [{ text: "3" }, { text: "4" }, { text: "5" }, { text: "6" }],
      correctAnswer: 1,
      test: test._id,
      section: test.sections[0]._id,
      marks: 1,
    });
    const attempt = await createAttempt(user, test, 5, {
      status: "paused",
      pausedAt: new Date(),
    });
    return { user, test, question, attempt, token: tokenFor(user) };
  };

  it("rejects save-answer with a clear message while paused", async () => {
    const { question, attempt, token } = await setupPausedAttemptWithQuestion();

    const res = await request(app)
      .post("/api/test-attempts/save-answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ attemptId: attempt._id.toString(), questionId: question._id.toString(), selectedOption: 1 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("paused");
    expect(res.body.message.toLowerCase()).toContain("paused");
  });

  it("rejects submit while paused", async () => {
    const { attempt, token } = await setupPausedAttemptWithQuestion();

    const res = await request(app)
      .post("/api/test-attempts/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({ attemptId: attempt._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("paused");
  });

  it("still allows read-only question navigation while paused, with a frozen remainingSeconds", async () => {
    const { attempt, token } = await setupPausedAttemptWithQuestion();

    const first = await request(app)
      .get(`/api/test-attempts/${attempt._id}/question/0`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("paused");

    const second = await request(app)
      .get(`/api/test-attempts/${attempt._id}/question/0`)
      .set("Authorization", `Bearer ${token}`);

    // Frozen: repeated calls while paused return the same remainingSeconds.
    expect(second.body.data.remainingSeconds).toBe(first.body.data.remainingSeconds);
  });

  it("treats a paused attempt as not-yet-submitted on GET /result", async () => {
    const { attempt, token } = await setupPausedAttemptWithQuestion();

    const res = await request(app)
      .get(`/api/test-attempts/${attempt._id}/result`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/test-attempts/start with an existing paused attempt", () => {
  it("returns the paused attempt instead of creating a second one", async () => {
    const user = await createUser();
    const test = await createTest();
    const attempt = await createAttempt(user, test, 5, {
      status: "paused",
      pausedAt: new Date(),
    });

    const res = await request(app)
      .post("/api/test-attempts/start")
      .set("Authorization", `Bearer ${tokenFor(user)}`)
      .send({ testId: test._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.resumed).toBe(true);
    expect(res.body.data.status).toBe("paused");
    expect(res.body.data._id.toString()).toBe(attempt._id.toString());

    const count = await TestAttempt.countDocuments({ user: user._id, test: test._id });
    expect(count).toBe(1);
  });
});

describe("DB-level uniqueness for paused attempts", () => {
  it("rejects a second paused attempt for the same user+test at the index level", async () => {
    const user = await createUser();
    const test = await createTest();
    await TestAttempt.init(); // ensure indexes are built before asserting on them

    await createAttempt(user, test, 5, { status: "paused", pausedAt: new Date() });

    await expect(
      createAttempt(user, test, 5, { status: "paused", pausedAt: new Date() })
    ).rejects.toMatchObject({ code: 11000 });
  });
});
