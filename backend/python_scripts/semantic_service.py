from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from semantic_search import process_semantic_search
from load_data import load_pdf_data

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
    

class ProcessUploadRequest(BaseModel):
    user_id: str
    class_name: str
    s3_key: str
    doc_id: str

@app.post("/api/v1/process_upload")
def process_upload(request: ProcessUploadRequest):
    """
    1) Calls the load_pdf_data function from load_data.py
    2) Returns success/failure to the caller
    """
    try:
        load_pdf_data(
            user_id=request.user_id,
            class_name=request.class_name,
            s3_key=request.s3_key,
            doc_id=request.doc_id
        )
        return {"message": "Successfully processed PDF for doc_id={}".format(request.doc_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

