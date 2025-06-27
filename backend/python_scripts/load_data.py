import os, re, argparse, math
from io import BytesIO
from collections import Counter, defaultdict
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)
from langchain_experimental.text_splitter import SemanticChunker
from langchain_core.output_parsers import StrOutputParser
from langchain.prompts import PromptTemplate
from langchain_mongodb import MongoDBAtlasVectorSearch
import boto3, pymupdf
from logger_setup import log
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.cluster import MiniBatchKMeans

load_dotenv()

# ──────────────────────────────────────────────────────────────
# CONSTANTS & CLIENTS
# ──────────────────────────────────────────────────────────────
CONNECTION_STRING         = os.getenv("MONGO_CONNECTION_STRING")
DB_NAME                   = "study_buddy_demo"
COLLECTION_NAME           = "study_materials2"
MAIN_FILE_DB_NAME         = "test"
MAIN_FILE_COLLECTION_NAME = "documents"

client          = MongoClient(CONNECTION_STRING)
collection      = client[DB_NAME][COLLECTION_NAME]
main_collection = client[MAIN_FILE_DB_NAME][MAIN_FILE_COLLECTION_NAME]

s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("AWS_SECRET"),
    region_name=os.getenv("AWS_REGION"),
)

llm = ChatOpenAI(model="gpt-4.1-mini", temperature=0)

# ──────────────────────────────────────────────────────────────
# SUMMARY UTIL
# ──────────────────────────────────────────────────────────────
def summarize_document(text_input: str) -> str:
    prompt = PromptTemplate.from_template(
        "You are an expert study assistant.\n\n"
        "Document below delimited by <doc></doc> tags.\n\n"
        "<doc>\n{context}\n</doc>\n\n"
        "Write a concise yet comprehensive summary capturing all key ideas, "
        "definitions and results. Limit to ~3–5 paragraphs."
    )
    return (prompt | llm | StrOutputParser()).invoke({"context": text_input})

TOK_PER_CHAR           = 1 / 4
MAX_TOKENS_PER_REQUEST = 300_000
est_tokens = lambda txt: int(len(txt) * TOK_PER_CHAR)

# ──────────────────────────────────────────────────────────────
# NEW –  TF‑IDF + SVD term extractor
# ──────────────────────────────────────────────────────────────

def compute_key_terms(chunks, top_n: int = 25):
    """Return up to *top_n* salient terms/phrases across the given chunks."""
    texts = [c["text"] for c in chunks if not c["metadata"].get("is_summary")]
    if not texts:
        return []

    # 1) TF‑IDF (uni‐ to tri‑grams)
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 3), min_df=2)
    X = vec.fit_transform(texts)
    if X.shape[1] == 0:
        return []

    # 2) Truncated SVD (latent concepts)
    k = min(100, X.shape[1] - 1)
    svd = TruncatedSVD(n_components=k, random_state=42)
    X_svd = svd.fit_transform(X)

    # 3) Rank terms by maximum loading across components
    comp_loadings = np.abs(svd.components_)
    top_indices = np.argsort(-comp_loadings, axis=1)[:, :10]  # 10 per comp
    term_ids = []
    for row in top_indices:
        term_ids.extend(row)
    # unique while preserving order
    seen = set(); ordered = []
    for idx in term_ids:
        if idx not in seen:
            seen.add(idx)
            ordered.append(idx)
        if len(ordered) >= top_n:
            break
    terms = [vec.get_feature_names_out()[i] for i in ordered]
    return terms

# ──────────────────────────────────────────────────────────────
# NEW –  MiniBatch‑KMeans for embedding clusters (optional)
# ──────────────────────────────────────────────────────────────

def cluster_embeddings(vectors, min_k: int = 2):
    """Return cluster_id list (len == len(vectors)). k ≈ sqrt(n)."""
    n = len(vectors)
    if n < 20:
        return [None] * n
    # ensure k is valid and < n
    k = max(min_k, int(math.sqrt(n)))
    k = min(k, n - 1)
    if k < 2:
        return [None] * n
    km = MiniBatchKMeans(n_clusters=k, random_state=42, batch_size=256)
    labels = km.fit_predict(vectors)
    return labels.tolist()

# ──────────────────────────────────────────────────────────────
# 1) TABLE-OF-CONTENTS SCRAPER
# ──────────────────────────────────────────────────────────────
TOC_LINE_RE = re.compile(r"chapter\s+(\d+)", re.I)

def detect_chapters_toc(doc):
    mapping = {}
    for page in range(min(20, len(doc))):
        text = doc.load_page(page).get_text("text")
        if "contents" not in text.lower():
            continue
        for line in text.splitlines():
            m = TOC_LINE_RE.search(line)
            if m:
                chap = int(m.group(1))
                # find last int in line = target page
                nums = [int(t) for t in re.findall(r"\d{1,4}", line)]
                if nums:
                    mapping[nums[-1]] = chap
        if mapping:
            break
    return mapping if len(mapping) >= 2 else {}

# ──────────────────────────────────────────────────────────────
# 2) LARGEST-HEADING + RARITY
# ──────────────────────────────────────────────────────────────
def detect_chapters_heading(doc):
    size_hist = Counter()
    spans_per_page = []

    for p in range(3, len(doc)):               # skip cover & TOC
        spans = []
        for b in doc.load_page(p).get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for sp in l["spans"]:
                    spans.append(sp)
                    size_hist[round(sp["size"], 1)] += 1
        spans_per_page.append((p, spans))

    if not size_hist:                           # scanned PDF?
        return {}

    num_pages = len(doc)
    # pick largest font used on ≤10% pages
    cand_sizes = [s for s, cnt in size_hist.items() if cnt <= 0.1 * num_pages]
    if not cand_sizes:
        return {}
    target_size = max(cand_sizes)

    mapping, chap = {}, 0
    for p, spans in spans_per_page:
        for sp in spans:
            if abs(sp["size"] - target_size) < 0.1 and sp["text"].strip():
                # vertical gap > 24 pt?
                if sp["bbox"][1] - min((s["bbox"][3] for s in spans), default=0) > 24:
                    chap += 1
                    mapping[p + 1] = chap
                break
    return mapping if chap >= 2 else {}

# ──────────────────────────────────────────────────────────────
# 3) RUNNING-HEADER CHANGE DETECTOR
# ──────────────────────────────────────────────────────────────
def detect_chapters_header(doc):
    header_strs = []
    for p in range(len(doc)):
        blk = doc.load_page(p).get_text("dict")["blocks"]
        header = " ".join(sp["text"] for b in blk for l in b.get("lines", []) for sp in l["spans"]
                          if sp["bbox"][1] < 72).strip()
        header_strs.append(header)

    mapping, chap = {}, 0
    prev = None
    for idx, h in enumerate(header_strs):
        if h and h != prev:
            chap += 1
            mapping[idx + 1] = chap
        prev = h
    return mapping if chap >= 2 and chap <= len(doc) // 4 else {}

# ──────────────────────────────────────────────────────────────
# COMPOSITE DETECTOR
# ──────────────────────────────────────────────────────────────
def build_chapter_map(doc):
    for detector in (detect_chapters_toc, detect_chapters_heading, detect_chapters_header):
        m = detector(doc)
        if m:
            log.debug(f"Chapter map by {detector.__name__}: {m}")
            return m
    log.debug("No chapters detected; defaulting to None")
    return {}

# ──────────────────────────────────────────────────────────────
# CHUNKING WITH NEW CHAPTER MAP
# ──────────────────────────────────────────────────────────────
def process_markdown_with_page_numbers(pdf_stream, user_id, class_id, doc_id, file_name):
    doc        = pymupdf.open(stream=pdf_stream, filetype="pdf")
    chapter_map = build_chapter_map(doc)        # {start_page: chapter_idx}
    current_chap = None

    headers = [("#","H1"),("##","H2"),("###","H3"),("####","H4"),("#####","H5"),("######","H6")]
    md_splitter = MarkdownHeaderTextSplitter(headers)
    semantic_splitter = SemanticChunker(OpenAIEmbeddings(), breakpoint_threshold_type="standard_deviation")

    meta   = doc.metadata or {}
    title  = meta.get("title","Unknown")
    author = meta.get("author","Unknown")

    chunks=[]
    for page_idx in range(len(doc)):
        if chapter_map.get(page_idx + 1):
            current_chap = chapter_map[page_idx + 1]

        page_md = doc.load_page(page_idx).get_text("markdown")
        if not page_md.strip():
            continue

        docs = md_splitter.split_text(page_md) or RecursiveCharacterTextSplitter(
            chunk_size=1500, chunk_overlap=200).create_documents(page_md)

        for d in docs:
            text = d.page_content.strip()
            if not text:
                continue
            for piece in (semantic_splitter.split_text(text) if len(text) > 1000 else [text]):
                chunks.append({
                    "text": piece,
                    "metadata": {
                        "file_name": file_name,
                        "title": title,
                        "author": author,
                        "user_id": user_id,
                        "class_id": class_id,
                        "doc_id": doc_id,
                        "is_summary": False,
                        "page_number": page_idx + 1,
                        "chapter_idx": current_chap,
                        "cluster_id": None,
                    },
                })
    return chunks


# ──────────────────────────────────────────────────────────────
# BATCHED EMBEDDINGS  (NEW)
# ──────────────────────────────────────────────────────────────
def store_embeddings(chunks, batch_chars: int = 20_000):
    """
    Embed chunks in batches small enough to stay under the 300 k-token
    request ceiling. 20 000 chars ≈ 50 000 tokens.
    """
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    texts, metas, char_sum = [], [], 0

    def flush():
        if texts:
            MongoDBAtlasVectorSearch.from_texts(texts, embeddings,
                                                collection=collection,
                                                metadatas=metas)
            texts.clear(); metas.clear()

    for c in chunks:
        texts.append(c["text"])
        metas.append(c["metadata"])
        char_sum += len(c["text"])
        if char_sum >= batch_chars:
            flush(); char_sum = 0
    flush()

# ──────────────────────────────────────────────────────────────
# MAIN INGEST
# ──────────────────────────────────────────────────────────────
def load_pdf_data(user_id: str, class_name: str, s3_key: str, doc_id: str):

    try:
        obj = s3_client.get_object(Bucket=os.getenv("AWS_S3_BUCKET_NAME"), Key=s3_key)
    except Exception:
        log.error(f"Error downloading {s3_key} from S3", exc_info=True); return
    if obj["ContentLength"] == 0:
        log.warning(f"S3 file {s3_key} is empty"); return

    pdf_stream = BytesIO(obj["Body"].read()); pdf_stream.seek(0)
    if not main_collection.find_one({"_id": ObjectId(doc_id)}):
        log.error(f"No document with _id={doc_id}"); return

    file_name = os.path.basename(s3_key)
    chunks    = process_markdown_with_page_numbers(pdf_stream, user_id, class_name, doc_id, file_name)

    # ── Smart summary guard-rails  (NEW) ─────────────────────────────────
    full_doc_text = " ".join(c["text"] for c in chunks)
    summary_text  = None

    def safe_sum(txt: str):
        return summarize_document(txt) if est_tokens(txt) <= MAX_TOKENS_PER_REQUEST else None

    summary_text = safe_sum(full_doc_text)

    if summary_text is None:            # split by page midpoint
        max_page = max(c["metadata"]["page_number"] or 0 for c in chunks)
        mid_page = max_page // 2 or 1
        first_txt  = " ".join(c["text"] for c in chunks if (c["metadata"]["page_number"] or 0) <= mid_page)
        second_txt = " ".join(c["text"] for c in chunks if (c["metadata"]["page_number"] or 0) > mid_page)
        s1, s2 = safe_sum(first_txt), safe_sum(second_txt)
        if s1 and s2:
            summary_text = f"{s1}\n\n---\n\n{s2}"
        else:
            log.warning(f"Summary skipped for doc {doc_id}: context too large.")

    if summary_text:
        chunks.append({
            "text": summary_text,
            "metadata": {
                "file_name" : file_name,
                "title"     : chunks[0]["metadata"]["title"] if chunks else file_name,
                "author"    : chunks[0]["metadata"]["author"] if chunks else "Unknown",
                "user_id"   : user_id,
                "class_id"  : class_name,
                "doc_id"    : doc_id,
                "is_summary": True,
                "page_number": None,
                "chapter_idx": None,
                "cluster_id": None,
            },
        })
    
    # ────────────────────────────────────────────────────────────
    # NEW – analytics (key terms + clustering)
    # ────────────────────────────────────────────────────────────
    log.debug("Computing key terms via TF‑IDF + SVD …")
    key_terms = compute_key_terms(chunks)
    try:
        main_collection.update_one({"_id": ObjectId(doc_id)}, {"$set": {"key_terms": key_terms}})
    except Exception as e:
        log.error(f"Error saving key_terms for doc {doc_id}: {e}")

    log.debug("Embedding locally for clustering …")
    embeddings_model = OpenAIEmbeddings(model="text-embedding-3-small")
    try:
        vectors = embeddings_model.embed_documents([c["text"] for c in chunks])
    except Exception as e:
        log.error("Embedding failed for clustering; proceeding without clusters", exc_info=True)
        vectors = None

    if vectors:
        labels = cluster_embeddings(vectors)
        for c, lbl in zip(chunks, labels):
            c["metadata"]["cluster_id"] = lbl
   

    store_embeddings(chunks)

    try:
        main_collection.update_one({"_id": ObjectId(doc_id)}, {"$set": {"isProcessing": False}})
        log.info("set isProcessing False", doc_id)
    except Exception as e:
        log.error(f"Error updating isProcessing for doc {doc_id}: {e}")

    log.info(f"Processed and stored embeddings for doc {doc_id}.")

# ---------------------------------------------------------------------
# CLI for local testing
# ---------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--user_id", required=True)
    ap.add_argument("--class_name", required=True)
    ap.add_argument("--s3_key", required=True)
    ap.add_argument("--doc_id", required=True)
    a = ap.parse_args()
    load_pdf_data(a.user_id, a.class_name, a.s3_key, a.doc_id)
