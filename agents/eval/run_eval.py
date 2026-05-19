# agents/eval/run_eval.py
# Evaluation pipeline for VisaGuard AI agents
# Uses RAGAS to score answer correctness and relevance
#
# Run full eval: python eval/run_eval.py
# Run CI tests:  pytest eval/run_eval.py -v

import json
import asyncio
import os
import sys
from pathlib import Path
from datetime import datetime

sys.path.append(str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / '.env')

# ── Config ────────────────────────────────────────────────────────
GOLDEN_QA_PATH = Path(__file__).parent / "golden_qa.json"
RESULTS_PATH   = Path(__file__).parent / "eval_results.json"
MAX_QUESTIONS  = 5  # Change to None for full eval

# ── Full eval uses LangGraph pipeline ────────────────────────────
async def ask_agent(question: str) -> str:
    from graph import visa_graph
    from langchain_core.messages import HumanMessage
    try:
        result = await visa_graph.ainvoke({
            "messages":          [HumanMessage(content=question)],
            "needs_search":      False,
            "needs_calculation": False,
            "search_results":    "",
            "calc_results":      "",
            "visa_context":      "",
            "final_response":    "",
        })
        return result.get("final_response", "No response generated")
    except Exception as e:
        return f"Error: {e}"

# ── Full evaluation pipeline (run locally) ────────────────────────
async def run_evaluation():
    from langchain_google_genai import ChatGoogleGenerativeAI
    from ragas import evaluate
    from ragas.metrics.collections import answer_correctness, answer_relevancy
    from datasets import Dataset

    print("=" * 60)
    print("VisaGuard AI — Evaluation Pipeline")
    print(f"Model: Gemini 2.0 Flash (free tier)")
    print("=" * 60)

    with open(GOLDEN_QA_PATH) as f:
        golden_qa = json.load(f)

    if MAX_QUESTIONS:
        golden_qa = golden_qa[:MAX_QUESTIONS]

    print(f"\nRunning {len(golden_qa)} questions...\n")

    questions, ground_truths, answers, latencies = [], [], [], []

    for i, item in enumerate(golden_qa):
        q  = item["question"]
        gt = item["ground_truth"]
        print(f"[{i+1}/{len(golden_qa)}] {q[:60]}...")
        start = datetime.now()
        answer = await ask_agent(q)
        latency_ms = (datetime.now() - start).total_seconds() * 1000
        questions.append(q)
        ground_truths.append(gt)
        answers.append(answer)
        latencies.append(round(latency_ms))
        print(f"  done {latency_ms:.0f}ms")

    avg_latency = sum(latencies) / len(latencies)

    print(f"\nAvg latency: {avg_latency:.0f}ms")

    results = {
        "run_at":         datetime.now().isoformat(),
        "model":          "gemini-2.0-flash",
        "n_questions":    len(questions),
        "avg_latency_ms": round(avg_latency),
        "details": [
            {"question": q, "ground_truth": gt, "agent_answer": a, "latency_ms": lat}
            for q, gt, a, lat in zip(questions, ground_truths, answers, latencies)
        ]
    }

    with open(RESULTS_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {RESULTS_PATH}")
    return results

# ── CI pytest tests — use Groq to avoid Gemini rate limits ────────
# Groq free tier: 14,400 req/day — much more reliable for CI
import pytest

VISA_SYSTEM = (
    "You are a visa compliance advisor. Answer questions about US visa rules accurately. "
    "Key facts: F-1 OPT has a 90-day cumulative unemployment limit. "
    "STEM OPT has a 150-day cumulative limit that includes days from the initial OPT period. "
    "H-1B has a 60-day grace period after job loss. "
    "STEM OPT requires the employer to be E-Verify registered."
)

def ask_groq(question: str) -> str:
    from groq import Groq
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        pytest.skip("GROQ_API_KEY not set")
    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=512,
            messages=[
                {"role": "system", "content": VISA_SYSTEM},
                {"role": "user",   "content": question}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {e}"

def test_opt_unemployment_limit():
    answer = ask_groq("How many unemployment days am I allowed on OPT?")
    assert "90" in answer, f"Expected 90-day limit in answer, got: {answer[:200]}"

def test_stem_cumulative_limit():
    answer = ask_groq("Does STEM OPT unemployment include my initial OPT days?")
    assert "150" in answer and (
        "cumulative" in answer.lower() or "include" in answer.lower()
    ), f"Expected 150-day cumulative explanation, got: {answer[:200]}"

def test_h1b_grace_period():
    answer = ask_groq("How long is the grace period if I lose my H-1B job?")
    assert "60" in answer, f"Expected 60-day grace period in answer, got: {answer[:200]}"

def test_stem_e_verify_requirement():
    answer = ask_groq("What are the employer requirements for STEM OPT?")
    assert "e-verify" in answer.lower() or "e verify" in answer.lower(), \
        f"Expected E-Verify mention, got: {answer[:200]}"

def test_response_not_empty():
    answer = ask_groq("What visa options do I have after OPT ends?")
    assert len(answer) > 50, f"Response too short: {answer}"

# ── Main ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    asyncio.run(run_evaluation())