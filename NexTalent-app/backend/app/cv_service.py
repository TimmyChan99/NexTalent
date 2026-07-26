import io
import re
from pathlib import Path
from docx import Document as DocxDocument
from pypdf import PdfReader


SKILLS = {
    "Vue.js": ("FRAMEWORK", [r"\bvue(?:\.js)?\b"]),
    "React": ("FRAMEWORK", [r"\breact(?:\.js)?\b"]),
    "TypeScript": ("LANGUAGE", [r"\btypescript\b"]),
    "JavaScript": ("LANGUAGE", [r"\bjavascript\b"]),
    "Python": ("LANGUAGE", [r"\bpython\b"]),
    "REST APIs": ("API", [r"\brest(?:ful)?\b", r"\bapi[s]?\b"]),
    "Git": ("TOOL", [r"\bgit(?:hub|lab)?\b"]),
}


def extract_text(content: bytes, filename: str) -> tuple[str, str]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        method = "NATIVE_PDF"
    elif suffix == ".docx":
        document = DocxDocument(io.BytesIO(content))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        method = "DOCX"
    elif suffix == ".txt":
        text = content.decode("utf-8", errors="replace")
        method = "PLAIN_TEXT"
    else:
        raise ValueError("UNSUPPORTED_CV_TYPE")
    if len(text.strip()) < 40:
        raise ValueError("CV_TEXT_NOT_EXTRACTABLE")
    return text.strip(), method


def analyze_cv(text: str, document_id: str, method: str) -> dict:
    compact = " ".join(text.split())
    technical_skills = []
    for name, (category, patterns) in SKILLS.items():
        match = next((re.search(pattern, compact, re.I) for pattern in patterns if re.search(pattern, compact, re.I)), None)
        if match:
            start = max(0, match.start() - 60)
            end = min(len(compact), match.end() + 100)
            technical_skills.append({"name": name, "category": category, "evidence": compact[start:end], "confidence": 0.88})
    summary = compact[:280] + ("…" if len(compact) > 280 else "")
    return {
        "schema_version": "1.0",
        "document_id": document_id,
        "document_type": "CV",
        "status": "EXTRACTED",
        "extraction": {
            "professional_summary": summary,
            "technical_skills": technical_skills,
            "soft_skills": [],
            "experience": [],
            "education": [],
            "certifications": [],
            "languages": [],
        },
        "quality": {
            "text_extraction_method": method,
            "text_quality": "HIGH" if len(compact) > 500 else "MEDIUM",
            "requires_human_review": len(technical_skills) == 0,
        },
        "warnings": [] if technical_skills else ["NO_TECHNICAL_SKILLS_DETECTED"],
        "raw_text": text,
    }
