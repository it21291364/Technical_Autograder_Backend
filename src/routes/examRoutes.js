// server/src/routes/examRoutes.js
const express = require("express");
const router = express.Router();
const Exam = require("../models/Exam");

// CREATE exam
router.post("/", async (req, res) => {
  try {
    // The body should contain { moduleName, moduleCode, year, semester, questions: [...], etc. }
    // "status" will default to "draft" if not provided
    const newExam = await Exam.create(req.body);
    res.status(201).json(newExam);
  } catch (err) {
    console.error("Error creating exam:", err);
    res.status(500).json({ error: "Failed to create exam" });
  }
});

// GET all exams
router.get("/", async (req, res) => {
  try {
    // Return all exams (draft, launched, disabled)
    const exams = await Exam.find().sort({ _id: -1 });
    res.json(exams);
  } catch (err) {
    console.error("Error fetching exams:", err);
    res.status(500).json({ error: "Failed to fetch exams" });
  }
});

// GET single exam
router.get("/:id", async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json(exam);
  } catch (err) {
    console.error("Error fetching exam:", err);
    res.status(500).json({ error: "Failed to fetch exam" });
  }
});

// UPDATE exam
router.put("/:id", async (req, res) => {
  try {
    const updated = await Exam.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updated) return res.status(404).json({ error: "Exam not found" });
    res.json(updated);
  } catch (err) {
    console.error("Error updating exam:", err);
    res.status(500).json({ error: "Failed to update exam" });
  }
});

// DELETE exam
router.delete("/:id", async (req, res) => {
  try {
    const exam = await Exam.findByIdAndDelete(req.params.id);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json({ message: "Exam deleted successfully" });
  } catch (err) {
    console.error("Error deleting exam:", err);
    res.status(500).json({ error: "Failed to delete exam" });
  }
});

// LAUNCH exam (sets status="launched")
router.post("/:id/launch", async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { status: "launched" },
      { new: true }
    );
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json(exam);
  } catch (err) {
    console.error("Error launching exam:", err);
    res.status(500).json({ error: "Failed to launch exam" });
  }
});

// DISABLE exam (sets status="disabled")
router.post("/:id/disable", async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { status: "disabled" },
      { new: true }
    );
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json(exam);
  } catch (err) {
    console.error("Error disabling exam:", err);
    res.status(500).json({ error: "Failed to disable exam" });
  }
});

// (Optional) GET launched exams only
router.get("/launched", async (req, res) => {
  try {
    const launchedExams = await Exam.find({ status: "launched" });
    res.json(launchedExams);
  } catch (err) {
    console.error("Error fetching launched exams:", err);
    res.status(500).json({ error: "Failed to fetch launched exams" });
  }
});

module.exports = router;
