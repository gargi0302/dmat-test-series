# dMAT Test Series

A local practice-test platform for the dMAT Core Module (Figure Sequences,
Mathematical Equations, Latin Squares), built from **your own PDF question
banks**. Nothing is invented, paraphrased, or auto-generated: every question
and option shown in the app is a direct, pixel-faithful crop of the source
PDF, and no imported question ever becomes usable until you've reviewed and
approved it.

## Project layout

```
/frontend        React + TypeScript + Tailwind app (Vite)
/backend         FastAPI app (Python) + the PDF parser
/data
  /source-pdfs        your uploaded PDFs, kept untouched
  /question-images    cropped PNGs of every question/option
/database         dmat.db (SQLite) — created on first run
/scripts          init_db.py, rebuild_db.py
```

## 1. Installation

Prerequisites: **Python 3.11+** and **Node.js 18+**.

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt      # Windows
# source venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

# Frontend
cd ../frontend
npm install
```

The SQLite database and `/data` folders are created automatically the first
time the backend starts — no manual setup needed.

## 2. Running the backend

```bash
cd backend
venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

The API is served at `http://127.0.0.1:8000` (interactive docs at `/docs`).
Uploaded PDFs and rendered question images are served under `/media/...`.

## 3. Running the frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api` and `/media`
requests to the backend on port 8000, so **both must be running**.

## 4. How PDF import works

Each module screen (Figure Sequences / Mathematical Equations / Latin
Squares) has its own **Upload Question Bank** button. You provide:

- **Questions PDF** (required)
- **Answer Key PDF** (optional) — leave this blank if the key is on later
  pages of the same Questions PDF; the parser looks for a heading like
  "Answer Key" or "Detailed Solutions" and treats everything after it as the
  key, and everything before it as questions.

The parser (`backend/app/services/pdf_parser/`) does the following, entirely
based on the actual layout of your PDF — it doesn't assume one fixed format:

1. **Locates every question** by finding marker text ("Question 5 of 150",
   "Q1.", plain numbered lists, …) and grouping them into a row-major grid
   per page, so it handles one-question-per-page layouts and multi-column
   grids alike.
2. **Crops each question directly from the page** at high resolution
   (PyMuPDF) — this is the image shown in the app; nothing is redrawn.
3. **Detects options** (lettered, numbered, or bare-letter under an image)
   within each question's region, and crops each option individually if it's
   graphical, or extracts its text otherwise.
4. **Parses the answer key** using whichever of several known formats
   matches (`Qn: X = value`, `Question n … Correct Option: X`, dense grids,
   plain numbered lists), and only accepts a match if it can be confidently
   tied to a real question/option — anything ambiguous is left blank.
5. Every parsed question lands in **Import Preview** with a confidence badge
   (High/Medium/Low/None). **Nothing is added to the live question bank
   until you click Approve** — you can Edit first to fix any mistake, or
   Skip to discard it. "Approve all high-confidence" is a shortcut, not a
   requirement.

Because real-world PDFs vary a lot, the parser won't get 100% of every
document perfectly automatically — that's what the review screen is for.
Nothing is ever silently guessed or corrected.

**Multi-part questions**: some PDFs ask for more than one answer in a single
question (e.g. "choose the correct option for Matrix 5 **and** Matrix 6").
The parser detects this automatically and shows each part as its own
labeled, independently clickable set of options in the exam, review, and
question-bank views — a question like this is only marked correct once
every part matches its own known answer.

**Re-importing the same PDF**: each import creates a brand-new set of
questions rather than updating a previous one — if you approve two imports
of the same source PDF, you'll end up with duplicate questions in the pool
(this is exactly what happened during initial testing and produced
inconsistent-looking tests). If you re-import to fix a bad parse, delete the
old batch first (see below) rather than approving both.

## 5. Adding more question banks later

Just repeat step 4 from any module's page — you can import as many batches
as you like into the same module; approved questions accumulate into one
pool that tests are generated from. Avoid approving more than one batch
built from the same source PDF (see the note above) — delete the old one
first if you're re-importing to fix a parsing issue.

## Deleting things

- **A single question**: open it from the Question Bank → **Delete**.
- **A whole import batch** (every question it produced): open it in Import
  Preview → **Delete Batch**, top right. Use this instead of approving a
  second, corrected import alongside a bad first one.
- **A test** (in progress, abandoned, or completed): Test History → the 🗑
  button on that row. Only removes the test/its answers, never touches the
  question bank.

## 6. Rebuilding the database

```bash
cd backend
venv\Scripts\python ..\scripts\rebuild_db.py
```

This **deletes all imported questions, tests, and history** and recreates
empty tables. It asks for confirmation first. Your original PDFs and
rendered images in `/data` are left untouched — re-import to repopulate the
bank (you'll need to re-approve, since approval state lives in the DB).

To just (re)create tables without deleting anything (e.g. after a fresh
clone), use `scripts/init_db.py` instead.

## 7. Troubleshooting PDF parsing / OCR

- **"No question markers were detected"**: the layout doesn't match any of
  the supported marker patterns. Check that questions are numbered as
  "Q1", "Question 1", or a plain "1." at the start of a line.
- **A question's crop looks too large/small, or cuts something off**: use
  **Edit** on that question in Import Preview to fix the text/answer by
  hand; there's no drag-resize crop tool in this version, but nothing is
  ever published without your review anyway.
- **Answer key not detected at all**: the batch will show every question as
  "Needs Review" with no correct answer — this is intentional (never
  guessed). Open each question's Edit form and set the correct answer
  manually, or re-run the import with a separate Answer Key PDF.
- **OCR**: the parser relies on the PDF's embedded text layer, which is
  present in every source PDF tested. If you have a purely scanned
  (image-only, no text layer) PDF, install the [Tesseract OCR
  engine](https://github.com/tesseract-ocr/tesseract) system-wide and
  `pip install pytesseract` (uncomment it in `requirements.txt`) — OCR is
  not wired into the parser by default since it wasn't needed for any of the
  tested banks, but `pytesseract.image_to_string` on the rendered page is a
  reasonable starting point if you need to extend `extract.py`.

## Settings

`Settings` (in the app) controls defaults application-wide instead of
hardcoding them: default test length, default timer, the "slow question"
threshold used in Performance Analysis, theme, and randomization — nothing
in the app hardcodes 20 questions / 25 minutes / 75 seconds beyond these
defaults.

## Timing accuracy

The countdown timer and per-question time tracking are computed from
stored timestamps (`endTimestamp - Date.now()`), never a decrementing
counter — so accuracy holds even if the browser tab is backgrounded for a
while. Revisiting a question accumulates its time rather than resetting it.
An in-progress test autosaves after every interaction, so a refresh offers
**Resume Test? / Abandon** instead of losing progress.
