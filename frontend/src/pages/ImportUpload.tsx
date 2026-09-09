import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import type { ModuleId } from "@/types";
import { MODULE_LABELS, MODULES } from "@/types";

export default function ImportUpload() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const module = MODULES.includes(moduleId as ModuleId) ? (moduleId as ModuleId) : null;

  const [questionsPdf, setQuestionsPdf] = useState<File | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!module) return <div className="max-w-2xl mx-auto px-6 py-10">Unknown module.</div>;

  const submit = async () => {
    if (!questionsPdf) return;
    setBusy(true);
    setError(null);
    try {
      const batch = await api.createImport(module, questionsPdf, answerKeyPdf);
      navigate(`/imports/${batch.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <Link to={`/module/${module}`} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">← {MODULE_LABELS[module]}</Link>
      <h1 className="text-2xl font-bold tracking-tight mt-2 mb-2">Upload Question Bank</h1>
      <p className="text-[var(--text-muted)] mb-8">
        Upload a PDF of {MODULE_LABELS[module]} questions. Questions are never invented, paraphrased, or altered —
        every visual is cropped directly from your PDF, and nothing is added to the live question bank until you
        review and approve it on the next screen.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5">
        <FileField
          label="Questions PDF"
          required
          hint="The PDF containing the questions (and their answer key, if it's on later pages of this same file)."
          file={questionsPdf}
          onChange={setQuestionsPdf}
        />
        <FileField
          label="Answer Key PDF (optional)"
          hint="Only needed if the answer key is a separate file. Leave blank and we'll look for a key section within the Questions PDF itself."
          file={answerKeyPdf}
          onChange={setAnswerKeyPdf}
        />

        {error && <p className="text-sm text-[var(--incorrect)]">{error}</p>}

        <button
          disabled={!questionsPdf || busy}
          onClick={submit}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50"
        >
          {busy ? "Parsing PDF… this can take a moment for large files" : "Upload & Parse"}
        </button>
      </div>
    </div>
  );
}

function FileField({
  label, required, hint, file, onChange,
}: { label: string; required?: boolean; hint: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label} {required && <span className="text-[var(--incorrect)]">*</span>}
      </label>
      <p className="text-xs text-[var(--text-muted)] mb-2">{hint}</p>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[var(--accent-soft)] file:text-[var(--accent)] file:font-medium file:text-sm hover:file:bg-[var(--accent)] hover:file:text-white"
      />
      {file && <p className="text-xs text-[var(--text-muted)] mt-1">{file.name} ({Math.round(file.size / 1024)} KB)</p>}
    </div>
  );
}
