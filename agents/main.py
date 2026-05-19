# agents/main.py
# FastAPI server — exposes LangGraph pipeline as HTTP API
# Node.js backend proxies /api/chat here

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from graph import visa_graph

load_dotenv('../.env')

app = FastAPI(title="VisaGuard Agents", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request/Response models ───────────────────────────────────────
class Message(BaseModel):
    role: str     # 'user' | 'assistant' | 'system'
    content: str

class ChatRequest(BaseModel):
    messages: list[Message]
    system:   str | None = None

class ChatResponse(BaseModel):
    content:       str
    agents_used:   list[str]
    needs_search:  bool
    needs_calc:    bool

# ── Chat endpoint ─────────────────────────────────────────────────
@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages required")

    # Convert to LangChain message format
    lc_messages = []
    for m in req.messages:
        if m.role == "user":
            lc_messages.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            lc_messages.append(AIMessage(content=m.content))
        elif m.role == "system":
            lc_messages.append(SystemMessage(content=m.content))

    # Run through LangGraph pipeline
    try:
        result = await visa_graph.ainvoke({
            "messages":          lc_messages,
            "needs_search":      False,
            "needs_calculation": False,
            "search_results":    "",
            "calc_results":      "",
            "visa_context":      "",
            "final_response":    "",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Track which agents ran (for observability/debugging)
    agents_used = ["classifier", "response"]
    if result.get("search_results"):  agents_used.insert(1, "uscis_search")
    if result.get("calc_results"):    agents_used.insert(-1, "calculator")

    return ChatResponse(
        content      = result["final_response"],
        agents_used  = agents_used,
        needs_search = result.get("needs_search", False),
        needs_calc   = result.get("needs_calculation", False),
    )

# ── Health check ──────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status":      "ok",
        "gemini_key":  "✓ set" if os.getenv("GEMINI_API_KEY") else "✗ MISSING",
        "tavily_key":  "✓ set" if os.getenv("TAVILY_API_KEY") else "✗ MISSING",
        "agents":      ["classifier", "uscis_search", "calculator", "response"]
    }

# ── Run ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)