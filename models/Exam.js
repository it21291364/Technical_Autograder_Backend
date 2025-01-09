const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  instructions: {
    type: String,
  },
  marks: {
    type: Number,
    required: true,
  },
  expected: {
    type: String,
  },
});

const examSchema = new mongoose.Schema({
  moduleName: {
    type: String,
    required: true,
  },
  moduleCode: {
    type: String,
    required: true,
  },
  year: {
    type: String,
    required: true,
  },
  semester: {
    type: String,
    required: true,
  },
  questions: [questionSchema],
});

module.exports = mongoose.model("Exam", examSchema);
