// models/IChunk.ts
export interface IChunk {
    _id?: string;         // Mongoose will auto-generate
    text?: string;
    embedding?: number[];
    file_name?: string;
    title?: string;
    author?: string;
    user_id?: string;
    class_id?: string;
    doc_id?: string;
    is_summary?: boolean;
    page_number?: number;
  }
  