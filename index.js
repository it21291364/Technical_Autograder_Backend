require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const examRoutes = require("./routes/examRoutes"); // We'll create this soon

const app = express();

// 1) Use Middlewares
app.use(cors()); // so our React front-end (localhost:5173) can talk to this server
app.use(express.json()); // parse JSON bodies

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

// 5) Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
