import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "roadmap-generator-tool" });
});

app.post("/api/generate", (req, res) => {
  const {
    projectName = "Untitled Project",
    objective = "Define a clear roadmap",
    timeline = "Next quarter",
  } = req.body ?? {};

  res.json({
    title: projectName,
    summary: `Draft roadmap for ${projectName} focused on ${objective}.`,
    timeline,
    steps: [
      "Clarify scope and success metrics",
      "Define the MVP delivery sequence",
      "Validate the roadmap with stakeholders",
    ],
  });
});

app.listen(port, () => {
  console.log(`Roadmap Generator Tool backend listening on port ${port}`);
});
