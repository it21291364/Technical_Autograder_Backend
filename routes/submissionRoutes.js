const express = require("express");
const router = express.Router();
const Submission = require("../models/Submission");
const Exam = require("../models/Exam");
const OpenAI = require("openai");
const PDFDocument = require("pdfkit"); // For PDF generation

async function gradeSubmission(submission, exam) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let totalMarks = 0;

  for (let answerObj of submission.answers) {
    // Match the question from the exam
    const questionObj = exam.questions.find(
      (q) => q.question === answerObj.question
    );
    if (!questionObj) continue;

    const instructionLower = (questionObj.instructions || "").toLowerCase();
    if (instructionLower.includes("give full marks")) {
      answerObj.marks = questionObj.marks;
      answerObj.feedback = "As per the marking guide, full marks are awarded.";
      totalMarks += answerObj.marks;
      continue;
    }

    // Construct prompt for OpenAI using similar structure as provided
    const prompt = `
You are an educational assistant that strictly follows the instructions provided in the marking guide when grading student answers.

**Important Instructions (Highest Priority):**
- ${questionObj.instructions || ""}

**Note:**
- Always prioritize the marking guide instructions above all else.
- Compare the student's answer with the expected answer.
- Award 0 marks if the answer does not address the question.

**Question Details:**
- **Question**: ${questionObj.question}
- **Expected Answer**: ${questionObj.expected || ""}
- **Allocated Marks**: ${questionObj.marks}

**Student's Answer:**
${answerObj.answer}

**Guidelines (Secondary Priority):**
- Ignore spelling and grammar mistakes.
- Focus on content and accuracy.
- Provide constructive feedback.

**Response Format:**
{
  "Marks Awarded": <number between 0 and ${questionObj.marks}>,
  "Feedback": "<feedback text>"
}
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0,
      });

      const output = response.choices[0].message.content.trim();
      let studentMarks = 0;
      let feedback = "No feedback provided";

      try {
        const jsonResponse = JSON.parse(output);
        studentMarks = jsonResponse["Marks Awarded"] || 0;
        feedback = jsonResponse["Feedback"] || "No feedback provided";
      } catch (error) {
        console.error("Failed to parse OpenAI response:", error);
      }

      answerObj.marks = studentMarks;
      answerObj.feedback = feedback;
      totalMarks += studentMarks;
    } catch (error) {
      console.error("Error during OpenAI grading:", error);
    }
  }

  submission.totalMarks = totalMarks;
}

router.post("/", async (req, res) => {
  try {
    const { examId, studentId, studentName, questions } = req.body;
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    let submission = new Submission({
      examId,
      studentId,
      studentName,
      answers: questions,
    });

    await gradeSubmission(submission, exam);
    await submission.save();
    res.status(201).json(submission);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to submit exam" });
  }
});

router.get("/exam/:examId", async (req, res) => {
  try {
    const submissions = await Submission.find({
      examId: req.params.examId,
    }).populate("examId", "moduleName moduleCode year semester"); // Populate exam details

    // Transform submissions to include exam details directly
    const transformedSubmissions = submissions.map((sub) => ({
      _id: sub._id,
      examId: sub.examId._id,
      moduleName: sub.examId.moduleName,
      moduleCode: sub.examId.moduleCode,
      year: sub.examId.year,
      semester: sub.examId.semester,
      studentId: sub.studentId,
      studentName: sub.studentName,
      totalMarks: sub.totalMarks,
      completedAt: sub.submittedAt,
      reviewed: sub.reviewed,
    }));

    res.json(transformedSubmissions);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

router.get("/", async (req, res) => {
  try {
    const submissions = await Submission.find().populate(
      "examId",
      "moduleName moduleCode year semester"
    ); // Populate exam details

    // Transform submissions to include exam details directly
    const transformedSubmissions = submissions.map((sub) => ({
      _id: sub._id,
      examId: sub.examId._id,
      moduleName: sub.examId.moduleName,
      moduleCode: sub.examId.moduleCode,
      year: sub.examId.year,
      semester: sub.examId.semester,
      studentId: sub.studentId,
      studentName: sub.studentName,
      totalMarks: sub.totalMarks,
      completedAt: sub.submittedAt,
      reviewed: sub.reviewed,
    }));

    res.json(transformedSubmissions);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});
// Endpoint to get a specific submission by ID (detailed view)
router.get("/:subId", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.subId).populate(
      "examId",
      "moduleName moduleCode year semester questions"
    ); // Populate exam details including questions
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    // Transform submission to include exam details directly and expectedAnswer in answers
    const transformedSubmission = {
      _id: submission._id,
      examId: submission.examId._id,
      moduleName: submission.examId.moduleName,
      moduleCode: submission.examId.moduleCode,
      year: submission.examId.year,
      semester: submission.examId.semester,
      studentId: submission.studentId,
      studentName: submission.studentName,
      totalMarks: submission.totalMarks,
      submittedAt: submission.submittedAt,
      reviewed: submission.reviewed,
      answers: submission.answers.map((ans) => {
        // Find the corresponding question in the exam
        const examQuestion = submission.examId.questions.find(
          (q) => q.question === ans.question
        );
        return {
          question: ans.question,
          instructions: ans.instructions,
          allocated: ans.allocated,
          answer: ans.answer,
          marks: ans.marks,
          feedback: ans.feedback,
          expectedAnswer: examQuestion
            ? examQuestion.expected
            : "No expected answer provided.",
        };
      }),
    };

    res.json(transformedSubmission);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
});

// Endpoint to update a submission (for lecturer to edit marks and feedback)
router.put("/:subId", async (req, res) => {
  try {
    const updatedSubmission = await Submission.findByIdAndUpdate(
      req.params.subId,
      req.body,
      { new: true }
    ).populate("examId", "moduleName moduleCode year semester"); // Populate exam details

    if (!updatedSubmission)
      return res.status(404).json({ error: "Submission not found" });

    // Transform submission to include exam details directly
    const transformedSubmission = {
      _id: updatedSubmission._id,
      examId: updatedSubmission.examId._id,
      moduleName: updatedSubmission.examId.moduleName,
      moduleCode: updatedSubmission.examId.moduleCode,
      year: updatedSubmission.examId.year,
      semester: updatedSubmission.examId.semester,
      studentId: updatedSubmission.studentId,
      studentName: updatedSubmission.studentName,
      totalMarks: updatedSubmission.totalMarks,
      submittedAt: updatedSubmission.submittedAt,
      reviewed: updatedSubmission.reviewed,
      answers: updatedSubmission.answers,
    };

    res.json(transformedSubmission);
  } catch (err) {
    console.error("Error updating submission:", err);
    res.status(500).json({ error: "Failed to update submission" });
  }
});

// Endpoint to generate and download PDF for a submission
//Generate and download PDF for a submissions
router.get("/:subId/pdf", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.subId).populate(
      "examId",
      "moduleName moduleCode year semester"
    ); // Populate exam details
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    const doc = new PDFDocument();
    let filename = `Submission_${submission.studentId}_${submission.examId.moduleCode}.pdf`;
    filename = encodeURIComponent(filename);

    // Setting response to 'attachment' (download)
    res.setHeader(
      "Content-disposition",
      'attachment; filename="' + filename + '"'
    );
    res.setHeader("Content-type", "application/pdf");

    // Document content
    doc.text(
      `Submission Report for ${submission.studentName} (${submission.studentId})`,
      {
        align: "center",
        underline: true,
      }
    );
    doc.moveDown();

    // Module and semester details
    doc.text(
      `Module: ${submission.examId.moduleName} (${submission.examId.moduleCode})`
    );
    doc.text(`Year: ${submission.examId.year}`);
    doc.text(`Semester: ${submission.examId.semester}`);
    doc.moveDown();

    // Detailed answers
    submission.answers.forEach((ans, idx) => {
      doc.text(`Question ${idx + 1}: ${ans.question}`);
      if (ans.instructions) {
        doc.text(`Instructions: ${ans.instructions}`);
      }
      doc.text(`Allocated Marks: ${ans.allocated}`);
      doc.text(`Student's Answer: ${ans.answer}`);
      doc.text(`Marks Awarded: ${ans.marks}`);
      doc.text(`Feedback: ${ans.feedback}`);
      doc.moveDown();
    });

    doc.end();
    doc.pipe(res);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// Endpoint to delete a submission
router.delete("/:subId", async (req, res) => {
  try {
    const submission = await Submission.findByIdAndDelete(req.params.subId);
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });
    res.json({ message: "Submission deleted successfully" });
  } catch (e) {
    console.error("Error deleting submission:", e);
    res.status(500).json({ error: "Failed to delete submission" });
  }
});

router.get("/student/:studentId", async (req, res) => {
  try {
    const submissions = await Submission.find({
      studentId: req.params.studentId,
    }).populate("examId", "moduleName moduleCode year semester"); // Populate exam details

    // Transform submissions to include exam details directly
    const transformedSubmissions = submissions.map((sub) => ({
      _id: sub._id,
      examId: sub.examId._id,
      moduleName: sub.examId.moduleName,
      moduleCode: sub.examId.moduleCode,
      year: sub.examId.year,
      semester: sub.examId.semester,
      totalMarks: sub.totalMarks,
      completedAt: sub.submittedAt,
      reviewed: sub.reviewed,
    }));

    res.json(transformedSubmissions);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

module.exports = router;
