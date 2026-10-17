"""Knowledge base documents: loading from knowledge_base/*.md and chunking by section."""
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import KnowledgeDocument

KB_DIR = Path(__file__).resolve().parents[2] / "knowledge_base"
_FRONT_MATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)


@dataclass(frozen=True)
class Chunk:
    doc_id: str
    title: str
    version: str
    section: str
    text: str

    @property
    def anchor(self) -> str:
        return slugify(self.section)


def slugify(text: str) -> str:
    return re.sub(r"[^0-9a-zа-яёәғқңөұүһі]+", "-", text.lower()).strip("-")


def parse_markdown(raw: str) -> dict:
    m = _FRONT_MATTER.match(raw)
    if not m:
        raise ValueError("knowledge base file has no front matter")
    meta = dict(line.split(":", 1) for line in m.group(1).splitlines() if ":" in line)
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    return {
        "id": meta["id"],
        "title": meta["title"],
        "version": meta.get("version", "1.0"),
        "effective_date": date.fromisoformat(meta["effective_date"]) if meta.get("effective_date") else None,
        "body_md": raw[m.end():].strip(),
    }


def load_files() -> list[dict]:
    return [parse_markdown(p.read_text(encoding="utf-8")) for p in sorted(KB_DIR.glob("*.md"))]


def ensure_seeded(db: Session) -> int:
    """Insert knowledge base documents that are not in the database yet."""
    existing = {d.id for d in db.query(KnowledgeDocument.id)}
    added = 0
    for doc in load_files():
        if doc["id"] not in existing:
            db.add(KnowledgeDocument(**doc))
            added += 1
    if added:
        db.commit()
    return added


def chunk_document(doc: KnowledgeDocument) -> list[Chunk]:
    """One chunk per '## section'. Disclaimer quotes ('> ...') are not knowledge."""
    chunks, section, lines = [], None, []

    def flush():
        text = " ".join(l for l in lines if l and not l.startswith(">")).strip()
        if section and text:
            chunks.append(Chunk(doc.id, doc.title, doc.version, section, text))

    for line in doc.body_md.splitlines():
        line = line.strip()
        if line.startswith("## "):
            flush()
            section, lines = line[3:].strip(), []
        else:
            lines.append(line)
    flush()
    return chunks
