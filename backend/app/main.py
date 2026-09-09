from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine, ensure_schema, SOURCE_PDF_DIR, QUESTION_IMAGE_DIR
from . import models  # noqa: F401 — registers models on Base before create_all
from .routers import questions, imports, tests, settings as settings_router, dashboard

ensure_schema()  # add any columns missing from an existing DB (e.g. after an update)
Base.metadata.create_all(bind=engine)  # create any wholly new tables

app = FastAPI(title="dMAT Test Series API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media/question-images", StaticFiles(directory=str(QUESTION_IMAGE_DIR)), name="question-images")
app.mount("/media/source-pdfs", StaticFiles(directory=str(SOURCE_PDF_DIR)), name="source-pdfs")

app.include_router(questions.router, prefix="/api/questions", tags=["questions"])
app.include_router(imports.router, prefix="/api/imports", tags=["imports"])
app.include_router(tests.router, prefix="/api/tests", tags=["tests"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
