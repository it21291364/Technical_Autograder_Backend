const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: String,
  instructions: String,
  allocated: Number,
  answer: String,
  marks: { type: Number, default: 0 },
  feedback: { type: String, default: '' },
});

const submissionSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  answers: [answerSchema],
  totalMarks: { type: Number, default: 0 },
  submittedAt: { type: Date, default: Date.now },
  reviewed: { type: Boolean, default: false },
});

module.exports = mongoose.model('Submission', submissionSchema);
