from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from semantic_search import process_semantic_search

app = FastAPI()

class SearchRequest(BaseModel):
    user_id: str
    class_name: Optional[str]
    doc_id: Optional[str]
    user_query: str
    chat_history: List[dict]
    source: str

@app.post("/api/v1/semantic_search")
async def semantic_search(req: SearchRequest):
    try:
        result = process_semantic_search(
            req.user_id,
            req.class_name or "null",
            req.doc_id or "null",
            req.user_query,
            req.chat_history,
            req.source
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
