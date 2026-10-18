from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.ai.knowledge import ensure_seeded
from app.database import SessionLocal
from app.routers import academy, admin, ai, auth, knowledge_gaps, me, notifications, requests, team

Base.metadata.create_all(bind=engine)

app = FastAPI(title="JanaМен API", description="Единая HR-платформа Jana Post (хакатон-прототип)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, me, requests, team, notifications, admin, academy, ai, knowledge_gaps):
    app.include_router(module.router)
app.include_router(academy.admin_router)


@app.on_event("startup")
def load_knowledge_base():
    # New knowledge_base/*.md files appear in existing databases without a reseed.
    db = SessionLocal()
    try:
        ensure_seeded(db)
    finally:
        db.close()


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "janamen-api"}
