const express = require("express");
const router = express.Router();
const Exam = require("../models/Exam");

// 1) Create exam
router.post("/", async (req, res) => {
  try {
    // The body should contain { moduleName, moduleCode, year, semester, questions: [...] }
    const newExam = await Exam.create(req.body);
    res.status(201).json(newExam);
  } catch (err) {
    console.error("Error creating exam:", err);
    res.status(500).json({ error: "Failed to create exam" });
  }
});

// 2) Get all exams
router.get("/", async (req, res) => {
  try {
    // Later you might filter by lecturer ID or something
    const exams = await Exam.find().sort({ _id: -1 }); // newest first
    res.json(exams);
  } catch (err) {
    console.error("Error fetching exams:", err);
    res.status(500).json({ error: "Failed to fetch exams" });
  }
});

// server/src/routes/examRoutes.js (excerpt)
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

router.put("/:id", async (req, res) => {
  try {
    // req.body should have moduleName, moduleCode, year, semester, questions array
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

// examRoutes.js (already shown, but make sure it’s real):
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

// Export the router
module.exports = router;
