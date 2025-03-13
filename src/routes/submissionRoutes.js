const express = require("express");
const router = express.Router();
const Submission = require("../models/Submission");
const Exam = require("../models/Exam");
const OpenAI = require("openai");
const PDFDocument = require("pdfkit"); // For PDF generation

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function gradeSubmission(submission, exam) {
  let totalMarks = 0;

  for (let answerObj of submission.answers) {
    // 1) Find matching question in the exam
    const questionObj = exam.questions.find(
      (q) => q.question === answerObj.question
    );
    if (!questionObj) continue;

    // 2) If exam instructions say "give full marks," skip GPT logic
    const instructionLower = (questionObj.instructions || "").toLowerCase();
    if (instructionLower.includes("give full marks")) {
      answerObj.marks = questionObj.marks;
      answerObj.feedback = "As per the marking guide, full marks are awarded.";
      totalMarks += answerObj.marks;
      continue;
    }

    // ---------------------------
    //  FIRST CALL: FINE-TUNED GPT
    // ---------------------------
    // For awarding marks only
    const markingPrompt = `
You are an educational assistant that strictly follows the instructions provided in the marking guide.

**Important Instructions (Highest Priority):**
1. DO NOT deduct any marks for spelling or grammar mistakes under any circumstances.
2. The only criteria for awarding marks is the correctness and completeness of the content relative to the marking guide.
3. Compare the student's answer with the expected answer. The student's phrasing does NOT need to match word-for-word; they only need to convey the correct main idea. Award 0 marks only if the student’s answer is conceptually incorrect or does not address the question at all.
4. Partial marks can be awarded as decimals (e.g., 1.5 or 3.75).

**Few-Shot Example Demonstrating Partial Marks**:
Example:
  Question: "Explain what a variable is."
  Allocated Marks: 5
  Expected Answer: "A variable is a symbolic name associated with a value..."
  Student's Answer: "A variable stores different values..."

  - Student's answer is partially correct but lacks detail on usage.
  - Marks Awarded: 3.5

**Question Details for Current Answer:**
- Question: ${questionObj.question}
- Expected Answer: ${questionObj.expected || ""}
- Allocated Marks: ${questionObj.marks}

**Exam-Specific Instructions**:
${questionObj.instructions || "(No specific instructions provided)"}

**Student's Answer**:
${answerObj.answer}

**Required Response Format (JSON)**:
{
  "Marks Awarded": <number between 0 and ${questionObj.marks}>
}
    `;

    let studentMarks = 0;
    try {
      const responseMarking = await openai.chat.completions.create({
        model: "ft:gpt-3.5-turbo-0125:personal:genaiautograderv1:AwStpEZl", // <-- Your fine-tuned model
        messages: [{ role: "user", content: markingPrompt }],
        max_tokens: 250,
        temperature: 0,
      });

      const markingOutput = responseMarking.choices[0].message.content.trim();
      try {
        // Parse out the "Marks Awarded"
        const jsonResponse = JSON.parse(markingOutput);
        studentMarks = Number(jsonResponse["Marks Awarded"]) || 0;
      } catch (err) {
        console.error("Error parsing marking JSON:", err);
      }
    } catch (err) {
      console.error("Error during fine-tuned GPT call for marks:", err);
    }

    // ---------------------------
    //  SECOND CALL: STANDARD GPT
    // ---------------------------
    // For generating feedback text
 const feedbackPrompt = `
You are a teaching assistant providing a thorough justification for the awarded marks.

Please give a detailed explanation (1 paragraph) of how the student's answer aligns or misaligns with the expected answer, clarifying the reasoning behind awarding ${studentMarks} out of ${questionObj.marks} marks. 

- Include references to key points from the expected answer that the student included or missed.
- If the student lost marks, explain why (but do not penalize grammar/spelling).
- If the student earned marks, explain which parts of their answer were correct or partially correct.
- Keep the writing style concise but sufficiently detailed to show clear reasoning.
  
Question: ${questionObj.question}
Expected Answer: ${questionObj.expected || "No expected answer provided"}
Allocated Marks: ${questionObj.marks}
Student's Answer: ${answerObj.answer}
Marks Awarded: ${studentMarks} out of ${questionObj.marks}
`;

    let generatedFeedback = "No feedback provided";
    try {
      const responseFeedback = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // <-- Another model for feedback
        messages: [{ role: "user", content: feedbackPrompt }],
        max_tokens: 150,
        temperature: 0.7,
      });

      generatedFeedback = responseFeedback.choices[0].message.content.trim();
    } catch (err) {
      console.error("Error during GPT call for feedback:", err);
    }

    // 3) Store final marks + feedback
    answerObj.marks = studentMarks;
    answerObj.feedback = generatedFeedback;
    totalMarks += studentMarks;
  }

  // 4) Update the submission-level total
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
