# Class Chat AI 📚💬  
*AI-powered study tool that turns your class documents into reliable, cited answers.*

---

## Why use Class Chat?  
- **All your sources, one chatbot.** Ask questions across lecture notes, textbooks, and slides.  
- **Trust every answer.** Inline citations plus full-file references show exactly *where* the fact came from.  
- **Study faster.** Average response < 3 s thanks to adaptive chunking and caching.  
- **Privacy first.** Documents stay encrypted at rest in your personal workspace—never shared or sold.

---

## Steps — How Class Chat works in practice

| Step | What happens | Demo |
|------|--------------|------|
| **1. Upload documents** | Drag-and-drop PDFs or notes, then group them into *classes* for easy context switching. | ![Upload GIF](assets/CCUploadDemo-ezgif.com-loop-count.gif) |
| **2. Chat with a class** | Ask anything about an entire course; Class Chat retrieves relevant chunks across all docs and returns answers with inline citations plus a sidebar of full references. | ![Class chat GIF](assets/CCMainChatDemo-ezgif.com-optimize.gif) |
| **3. Chat with a document (side-by-side)** | Focus on a single file; when you click a citation, the viewer jumps to the exact page so you can verify instantly. | ![Document chat GIF](assets/CCDocChat-ezgif.com-optimize.gif) |


---

## Under the Hood

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + Material-UI |
| Realtime | WebSockets for streaming responses |
| Backend (API) | Node.js / Express (auth, REST) |
| AI Service | Python FastAPI · LangChain RAG chain · OpenAI GPT-4o |
| Vector Store | MongoDB Atlas Vector Search |
| Storage & Infra | AWS S3 (documents) · Vercel (frontend) · Heroku (Node & FastAPI) |

---

## Built With

![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)  
![LangChain](https://img.shields.io/badge/LangChain-🦜-yellow)  
![MongoDB Atlas](https://img.shields.io/badge/MongoDB%20Atlas-47A248?logo=mongodb&logoColor=white)  
![AWS](https://img.shields.io/badge/AWS-232F3E?logo=amazon-aws&logoColor=FF9900)  
![Heroku](https://img.shields.io/badge/Heroku-430098?logo=heroku&logoColor=white)  
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)  
![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)

---

## Quick Links

- **Live site:** <https://app.classchatai.com>  


