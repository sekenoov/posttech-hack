"""Local retrieval for a small HR knowledge base. No external services, no vector DB.

Two signals decide relevance:
  * score    — cosine similarity of character 3–5-gram TF-IDF vectors (robust to
               Russian inflection and typos without a stemmer);
  * coverage — share of the question's content words (crudely stemmed) that occur
               in the chunk. It stops "курс доллара" from matching a training
               "курс" on character overlap alone.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass

from app.ai.knowledge import Chunk

MIN_SCORE = 0.18  # tuned on tests/test_ai_eval.py: in-KB min ≈ 0.23, off-topic with coverage ≈ 0.11
MIN_COVERAGE = 0.5

_WORD = re.compile(r"[0-9a-zа-яәғқңөұүһі]+")
STOPWORDS = {
    "а", "в", "во", "и", "к", "с", "со", "у", "о", "об", "от", "до", "по", "за", "на", "из", "для", "при", "без",
    "не", "ни", "ли", "же", "бы", "то", "что", "чтобы", "как", "так", "это", "этот", "эта", "эти", "там", "тут",
    "где", "когда", "куда", "откуда", "почему", "зачем", "какой", "какая", "какие", "каким", "какую", "каких",
    "кто", "чем", "чего", "сколько", "ли", "или", "но", "да", "нет", "если", "уже", "еще", "ещё", "можно",
    "нужно", "надо", "мне", "меня", "мой", "моя", "мои", "моё", "мое", "моего", "моей", "моих", "я", "мы", "вы",
    "ты", "он", "она", "они", "его", "ее", "её", "их", "нам", "вам", "им", "свой", "своя", "свои", "своего",
    "есть", "быть", "будет", "был", "была", "было", "были", "этом", "того", "тот", "такое", "очень", "пожалуйста",
    "подскажите", "скажите", "расскажи", "расскажите", "хочу", "хотел", "хотела", "могу", "ли", "все", "всё",
    "вопрос", "jana", "джана", "яна", "привет", "здравствуйте", "добрый", "день", "можете",
}


def normalize(text: str) -> str:
    return text.lower().replace("ё", "е")


def words(text: str) -> list[str]:
    return _WORD.findall(normalize(text))


def stem(word: str) -> str:
    return word[:5] if len(word) > 5 else word


def content_stems(text: str) -> set[str]:
    return {stem(w) for w in words(text) if w not in STOPWORDS and len(w) >= 3}


def _ngrams(text: str) -> Counter:
    grams: Counter = Counter()
    for w in words(text):
        padded = f" {w} "
        for n in (3, 4, 5):
            for i in range(len(padded) - n + 1):
                grams[padded[i:i + n]] += 1
    return grams


@dataclass
class Hit:
    chunk: Chunk
    score: float
    coverage: float

    @property
    def relevant(self) -> bool:
        return self.score >= MIN_SCORE and self.coverage >= MIN_COVERAGE


class Retriever:
    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        docs = [_ngrams(f"{c.title} {c.section} {c.text}") for c in chunks]
        df: Counter = Counter()
        for d in docs:
            df.update(d.keys())
        n = len(docs)
        self.idf = {g: math.log((1 + n) / (1 + f)) + 1 for g, f in df.items()}
        self.vectors = [self._weigh(d) for d in docs]
        self.stems = [content_stems(f"{c.title} {c.section} {c.text}") for c in chunks]

    def _weigh(self, counts: Counter) -> dict[str, float]:
        vec = {g: (1 + math.log(tf)) * self.idf.get(g, 0.0) for g, tf in counts.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {g: v / norm for g, v in vec.items()}

    def search(self, question: str, k: int = 3) -> list[Hit]:
        if not self.chunks:
            return []
        q_vec = self._weigh(_ngrams(question))
        q_stems = content_stems(question)
        hits = []
        for chunk, vec, stems in zip(self.chunks, self.vectors, self.stems):
            score = sum(w * vec.get(g, 0.0) for g, w in q_vec.items())
            coverage = len(q_stems & stems) / len(q_stems) if q_stems else 0.0
            hits.append(Hit(chunk, score, coverage))
        hits.sort(key=lambda h: (h.relevant, h.score + h.coverage), reverse=True)
        return hits[:k]


def best_sentences(text: str, question: str, limit: int = 3) -> str:
    """Extractive answer: the chunk's sentences that overlap the question most, in original order."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    q = content_stems(question)
    ranked = sorted(range(len(sentences)), key=lambda i: len(q & content_stems(sentences[i])), reverse=True)
    keep = sorted(ranked[:limit])
    return " ".join(sentences[i] for i in keep)
