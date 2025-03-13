require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const examRoutes = require("../src/routes/examRoutes"); // We'll create this soon
const submissionRoutes = require("../src/routes/submissionRoutes");

const app = express();

// 1) Use Middlewares
app.use(express.json()); // parse JSON bodies
app.use(cors({
  origin: "https://autograder-client.vercel.app", // Allow frontend URL
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// 2) Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected!"))
  .catch((err) => console.error("MongoDB connection error:", err));

// 3) Define a test route
app.get("/", (req, res) => {
  res.send("Hello from GENAI Autograder backend!");
});

// 4) Use exam routes
app.use("/api/exams", examRoutes);
app.use("/api/submissions", submissionRoutes);

// 5) Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
