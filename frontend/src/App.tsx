import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import ModuleHome from "@/pages/ModuleHome";
import ImportUpload from "@/pages/ImportUpload";
import ImportReview from "@/pages/ImportReview";
import ExamRunner from "@/pages/ExamRunner";
import TestResults from "@/pages/TestResults";
import TestReview from "@/pages/TestReview";
import PerformanceAnalysis from "@/pages/PerformanceAnalysis";
import QuestionBank from "@/pages/QuestionBank";
import QuestionDetail from "@/pages/QuestionDetail";
import History from "@/pages/History";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/module/:moduleId" element={<ModuleHome />} />
        <Route path="/module/:moduleId/upload" element={<ImportUpload />} />
        <Route path="/imports/:batchId" element={<ImportReview />} />
        <Route path="/bank" element={<QuestionBank />} />
        <Route path="/bank/:moduleId" element={<QuestionBank />} />
        <Route path="/bank/question/:questionId" element={<QuestionDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/tests/:testId/results" element={<TestResults />} />
        <Route path="/tests/:testId/review" element={<TestReview />} />
        <Route path="/tests/:testId/analysis" element={<PerformanceAnalysis />} />
      </Route>
      {/* Exam runner has no chrome/nav — full-focus test-taking screen */}
      <Route path="/tests/:testId/run" element={<ExamRunner />} />
    </Routes>
  );
}
