# agents/graph.py
# LangGraph multi-agent pipeline for VisaGuard AI Advisor
#
# Flow:
#   User message
#       ↓
#   [classifier_agent]  — decides which agents are needed
#       ↓
#   [uscis_search_agent] (if policy question)
#   [calculator_agent]   (if calculation question)
#       ↓
#   [response_agent]    — synthesizes final answer
#       ↓
#   Final response

import os
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from tools import web_search, calculate_unemployment_days, get_visa_rules

# ── State definition ──────────────────────────────────────────────
class AgentState(TypedDict):
    messages:          Annotated[Sequence[BaseMessage], add_messages]
    needs_search:      bool
    needs_calculation: bool
    search_results:    str
    calc_results:      str
    visa_context:      str
    final_response:    str

# ── Gemini model (free tier via AI Studio) ────────────────────────
def get_model():
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.3,
        max_tokens=1024,
    )

SYSTEM_CONTEXT = """You are VisaGuard AI, a specialized immigration compliance advisor 
focused on US visa status — F-1 OPT, STEM OPT, H-1B, J-1, and CPT.

Key rules you always apply:
- F-1 OPT: 90-day cumulative unemployment limit
- F-1 STEM OPT: 150-day cumulative limit (includes OPT days)
- H-1B: 60-day grace period after job loss (USCIS rule)
- Always recommend consulting a DSO or immigration attorney for personal decisions
- Days count 7 days/week including weekends

Be clear, accurate, and empathetic. Users are anxious about their status."""

# ── Node 1: Classifier ────────────────────────────────────────────
def classifier_agent(state: AgentState) -> AgentState:
    """
    Analyzes the user's message and decides:
    - Does this need a live USCIS web search?
    - Does this need the unemployment calculator?
    """
    model = get_model()
    last_msg = state["messages"][-1].content

    prompt = f"""Analyze this visa question and respond with ONLY a JSON object.

Question: {last_msg}

Respond with exactly this format (no markdown, no explanation):
{{
  "needs_search": true/false,
  "needs_calculation": true/false,
  "visa_type": "opt|stem|h1b|cpt|j1|general",
  "reasoning": "one sentence"
}}

needs_search = true if: asking about current policy, recent changes, specific USCIS rules, processing times
needs_calculation = true if: asking to calculate days, check compliance, how many days used/remaining"""

    response = model.invoke([SystemMessage(content=SYSTEM_CONTEXT), HumanMessage(content=prompt)])

    import json, re
    try:
        # Strip any markdown fences just in case
        clean = re.sub(r'```json|```', '', response.content).strip()
        parsed = json.loads(clean)
        needs_search = parsed.get("needs_search", False)
        needs_calc   = parsed.get("needs_calculation", False)
        visa_context = parsed.get("visa_type", "general")
    except Exception:
        # Safe fallback — do a search for any unknown query
        needs_search = True
        needs_calc   = False
        visa_context = "general"

    print(f"[classifier] search={needs_search}, calc={needs_calc}, visa={visa_context}")

    return {
        **state,
        "needs_search":      needs_search,
        "needs_calculation": needs_calc,
        "visa_context":      visa_context,
    }

# ── Node 2: USCIS Search Agent ────────────────────────────────────
def uscis_search_agent(state: AgentState) -> AgentState:
    """
    Searches for current USCIS policy and immigration news.
    Only runs if classifier flagged needs_search=True.
    """
    if not state.get("needs_search"):
        return {**state, "search_results": ""}

    last_msg = state["messages"][-1].content
    visa_ctx = state.get("visa_context", "")

    # Build a targeted search query
    model = get_model()
    query_prompt = f"Generate a 4-6 word web search query for this visa question. Return ONLY the query, nothing else.\nQuestion: {last_msg}\nVisa context: {visa_ctx}"
    query_response = model.invoke([HumanMessage(content=query_prompt)])
    search_query = query_response.content.strip().strip('"')

    print(f"[search] query: {search_query}")

    try:
        results = web_search.invoke({"query": f"USCIS {search_query} 2025"})
        # Format results into a readable string
        formatted = "\n\n".join([
            f"Source: {r.get('url', '')}\n{r.get('content', '')[:400]}"
            for r in results[:3]
        ])
        print(f"[search] got {len(results)} results")
    except Exception as e:
        formatted = f"Web search unavailable: {e}"
        print(f"[search] error: {e}")

    return {**state, "search_results": formatted}

# ── Node 3: Calculator Agent ──────────────────────────────────────
def calculator_agent(state: AgentState) -> AgentState:
    """
    Extracts dates from the conversation and runs the unemployment calculator.
    Only runs if classifier flagged needs_calculation=True.
    """
    if not state.get("needs_calculation"):
        return {**state, "calc_results": ""}

    last_msg = state["messages"][-1].content
    model = get_model()

    # First get the visa rules for context
    visa_type = state.get("visa_context", "opt")
    if visa_type not in ['opt', 'stem', 'h1b', 'cpt', 'j1']:
        visa_type = 'opt'

    rules = get_visa_rules.invoke({"visa_type": visa_type})

    # Try to extract dates from the message for calculation
    extract_prompt = f"""Extract date information from this message for visa unemployment calculation.
Return ONLY a JSON object, no explanation.

Message: {last_msg}

Format:
{{
  "has_dates": true/false,
  "auth_start": "YYYY-MM-DD or null",
  "auth_end": "YYYY-MM-DD or null", 
  "employment_periods": [{{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD or null"}}],
  "visa_type": "{visa_type}"
}}"""

    extract_response = model.invoke([HumanMessage(content=extract_prompt)])

    import json, re
    try:
        clean = re.sub(r'```json|```', '', extract_response.content).strip()
        parsed = json.loads(clean)

        if parsed.get("has_dates") and parsed.get("auth_start"):
            result = calculate_unemployment_days.invoke({
                "auth_start":          parsed["auth_start"],
                "auth_end":            parsed.get("auth_end") or "",
                "employment_periods":  parsed.get("employment_periods", []),
                "visa_type":           parsed.get("visa_type", visa_type)
            })
            calc_str = (
                f"Calculation result:\n"
                f"- Unemployed days: {result['unemployed_days']}\n"
                f"- Employed days: {result['employed_days']}\n"
                f"- Days remaining: {result.get('days_remaining', 'N/A')}\n"
                f"- Status: {result['status']}\n"
                f"- Limit: {result.get('limit', 'None (advisory)')}\n"
                f"- Gaps: {result['gaps']}"
            )
        else:
            calc_str = f"Visa rules for {visa_type.upper()}: {rules}"

    except Exception as e:
        calc_str = f"Could not perform calculation: {e}. Rules: {rules}"
        print(f"[calculator] error: {e}")

    print(f"[calculator] done")
    return {**state, "calc_results": calc_str}

# ── Node 4: Response Agent ────────────────────────────────────────
def response_agent(state: AgentState) -> AgentState:
    """
    Synthesizes search results + calculation results into a clear final answer.
    This is the only node that talks to the user.
    """
    model = get_model()

    last_msg     = state["messages"][-1].content
    search_ctx   = state.get("search_results", "")
    calc_ctx     = state.get("calc_results", "")
    visa_ctx     = state.get("visa_context", "")

    context_parts = []
    if search_ctx: context_parts.append(f"[Current USCIS policy from web search]\n{search_ctx}")
    if calc_ctx:   context_parts.append(f"[Calculation results]\n{calc_ctx}")
    context = "\n\n".join(context_parts) if context_parts else "No additional context retrieved."

    synthesis_prompt = f"""Answer this visa question clearly and accurately.

Question: {last_msg}
Visa context: {visa_ctx}

Available context:
{context}

Instructions:
- Give a direct, helpful answer
- Use specific numbers and dates when available  
- If calculation results are provided, explain them clearly
- If web search results are provided, cite the key policy points
- End with: "Always verify with your DSO or immigration attorney for decisions specific to your situation."
- Keep response under 300 words"""

    response = model.invoke([
        SystemMessage(content=SYSTEM_CONTEXT),
        HumanMessage(content=synthesis_prompt)
    ])

    return {
        **state,
        "messages":        state["messages"] + [AIMessage(content=response.content)],
        "final_response":  response.content
    }

# ── Routing logic ─────────────────────────────────────────────────
def route_after_classifier(state: AgentState) -> str:
    """Routes to search, calculator, or directly to response"""
    if state.get("needs_search"):
        return "search"
    if state.get("needs_calculation"):
        return "calculator"
    return "response"

def route_after_search(state: AgentState) -> str:
    """After search, check if we also need calculation"""
    if state.get("needs_calculation"):
        return "calculator"
    return "response"

# ── Build the graph ───────────────────────────────────────────────
def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("classifier",  classifier_agent)
    workflow.add_node("search",      uscis_search_agent)
    workflow.add_node("calculator",  calculator_agent)
    workflow.add_node("response",    response_agent)

    workflow.set_entry_point("classifier")

    workflow.add_conditional_edges(
        "classifier",
        route_after_classifier,
        {"search": "search", "calculator": "calculator", "response": "response"}
    )
    workflow.add_conditional_edges(
        "search",
        route_after_search,
        {"calculator": "calculator", "response": "response"}
    )
    workflow.add_edge("calculator", "response")
    workflow.add_edge("response",   END)

    return workflow.compile()

# Singleton — compiled once on import
visa_graph = build_graph()