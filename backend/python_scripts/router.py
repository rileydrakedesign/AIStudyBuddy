import re
from functools import lru_cache
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# ────────────────────────────────────────────────────────────────────
# Regex gates ordered by frequency (cheap → expensive fall-through)
# ────────────────────────────────────────────────────────────────────
_PATTERNS = [
    ("follow_up",         re.compile(r"\b(elaborate|tell me more|expand on|what do you mean|go on|again)\b", re.I)),
    ("quote_finding",     re.compile(r"\b(?:find|give|provide|need).{0,40}quote", re.I)),
    ("generate_study_guide", re.compile(r"\bstudy[-\s]?guide\b|\bmake .* guide\b|\bgenerate .* guide\b", re.I)),
    ("summary",           re.compile(r"\bsummary\b|\bsummar(?:ise|ize)\b|\btl;dr\b|\boverview\b", re.I)),
]

_FALLBACK = "general_qa"
_ALL_ROUTE_NAMES = [name for name, _ in _PATTERNS] + [_FALLBACK]

# ────────────────────────────────────────────────────────────────────
# Tiny helper LLM for rare tie-breaks
# ────────────────────────────────────────────────────────────────────
_llm = ChatOpenAI(model="gpt-4.1-nano", temperature=0.0)

_TIE_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a router. Reply with ONLY the best matching category "
            "from the list below. If none fit, reply 'general_qa'.\n\n"
            "Allowed categories:\n{categories}\n",
        ),
        ("user", "{query}"),
    ]
) | _llm | StrOutputParser()

@lru_cache(maxsize=2048)
def _llm_select(query: str, candidates: tuple) -> str:
    """Ask the nano model to choose among ambiguous regex matches."""
    categories = ", ".join(candidates)
    try:
        choice = _TIE_PROMPT.invoke({"categories": categories, "query": query}).strip()
        return choice if choice in _ALL_ROUTE_NAMES else candidates[0]
    except Exception:    # network / rate-limit safeguards
        return candidates[0]

# ────────────────────────────────────────────────────────────────────
# Public API
# ────────────────────────────────────────────────────────────────────
@lru_cache(maxsize=4096)
def detect_route(text: str) -> str:
    """Return a route string for the given query text."""
    hits = [name for name, pat in _PATTERNS if pat.search(text)]

    if not hits:
        return _FALLBACK
    if len(hits) == 1:
        return hits[0]

    # Ambiguous → use LLM once (results cached)
    return _llm_select(text, tuple(hits))
