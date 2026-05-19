# agents/eval/run_eval.py
# Evaluation pipeline for VisaGuard AI agents
# Uses RAGAS to score answer correctness, faithfulness, and relevance
#
# Run: python eval/run_eval.py
# This is your QA superpower — demonstrates LLM eval skills for the Google JD

import json
import asyncio
import os
import sys
from pathlib import Path
from datetime import datetime

sys.path.append(str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv('../../.env')

from graph import visa_graph
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ragas import evaluate
from ragas.metrics import answer_correctness, answer_relevancy
from datasets import Dataset

# ── Config ────────────────────────────────────────────────────────
GOLDEN_QA_PATH = Path(__file__).parent / "golden_qa.json"
RESULTS_PATH   = Path(__file__).parent / "eval_results.json"

# Run a subset for speed (change to None for full eval)
MAX_QUESTIONS = 5

# ── Run agent on a single question ───────────────────────────────
async def ask_agent(question: str) -> str:
    """Run a question through the full LangGraph pipeline"""
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

# ── Evaluation pipeline ───────────────────────────────────────────
async def run_evaluation():
    print("=" * 60)
    print("VisaGuard AI — Evaluation Pipeline")
    print(f"Model: Gemini 2.0 Flash (free tier)")
    print(f"Metrics: answer_correctness, answer_relevancy")
    print("=" * 60)

    # Load golden Q&A pairs
    with open(GOLDEN_QA_PATH) as f:
        golden_qa = json.load(f)

    if MAX_QUESTIONS:
        golden_qa = golden_qa[:MAX_QUESTIONS]

    print(f"\nRunning {len(golden_qa)} questions through agent pipeline...\n")

    questions    = []
    ground_truths = []
    answers      = []
    latencies    = []

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

        print(f"  ✓ {latency_ms:.0f}ms | {len(answer)} chars")

    # ── RAGAS scoring ─────────────────────────────────────────────
    print("\nScoring with RAGAS...")

    eval_model = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=os.getenv("GEMINI_API_KEY"),
    )

    dataset = Dataset.from_dict({
        "question":   questions,
        "answer":     answers,
        "ground_truth": ground_truths,
    })

    try:
        scores = evaluate(
            dataset,
            metrics=[answer_correctness, answer_relevancy],
            llm=eval_model,
        )
        score_dict = scores.to_pandas().mean().to_dict()
    except Exception as e:
        print(f"RAGAS scoring error: {e}")
        score_dict = {"error": str(e)}

    # ── Results summary ───────────────────────────────────────────
    avg_latency = sum(latencies) / len(latencies)

    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    print(f"Questions evaluated: {len(questions)}")
    print(f"Avg latency:         {avg_latency:.0f}ms")
    print(f"Max latency:         {max(latencies)}ms")
    print()
    for metric, score in score_dict.items():
        if isinstance(score, float):
            bar = "█" * int(score * 20)
            print(f"{metric:<25} {score:.3f}  {bar}")

    # ── Save detailed results ─────────────────────────────────────
    detailed = []
    for i, (q, gt, a, lat) in enumerate(zip(questions, ground_truths, answers, latencies)):
        detailed.append({
            "question":     q,
            "ground_truth": gt,
            "agent_answer": a,
            "latency_ms":   lat,
            "visa_type":    golden_qa[i].get("visa_type", "unknown")
        })

    results = {
        "run_at":      datetime.now().isoformat(),
        "model":       "gemini-2.0-flash",
        "n_questions": len(questions),
        "avg_latency_ms": round(avg_latency),
        "scores":      score_dict,
        "details":     detailed
    }

    with open(RESULTS_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDetailed results saved to: {RESULTS_PATH}")
    print("=" * 60)
    return results

# ── pytest integration ────────────────────────────────────────────
# Run with: pytest eval/run_eval.py -v
import pytest

@pytest.mark.asyncio
async def test_opt_unemployment_limit():
    """Agent should correctly state the 90-day OPT limit"""
    answer = await ask_agent("How many unemployment days am I allowed on OPT?")
    assert "90" in answer, f"Expected '90' in answer, got: {answer[:200]}"

@pytest.mark.asyncio
async def test_stem_cumulative_limit():
    """Agent should know STEM limit includes OPT days"""
    answer = await ask_agent("Does STEM OPT unemployment include my OPT days?")
    assert "150" in answer and ("cumulative" in answer.lower() or "include" in answer.lower()), \
        f"Expected cumulative 150-day explanation, got: {answer[:200]}"

@pytest.mark.asyncio
async def test_h1b_grace_period():
    """Agent should correctly state 60-day H-1B grace period"""
    answer = await ask_agent("How long is my grace period if I lose my H-1B job?")
    assert "60" in answer, f"Expected '60' in answer, got: {answer[:200]}"

@pytest.mark.asyncio
async def test_stem_e_verify_requirement():
    """Agent should mention E-Verify for STEM OPT"""
    answer = await ask_agent("What are the employer requirements for STEM OPT?")
    assert "e-verify" in answer.lower() or "e verify" in answer.lower(), \
        f"Expected E-Verify mention, got: {answer[:200]}"

@pytest.mark.asyncio
async def test_response_not_empty():
    """Agent should always return a non-empty response"""
    answer = await ask_agent("What visa options do I have after OPT?")
    assert len(answer) > 50, f"Response too short: {answer}"

# ── Main ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    asyncio.run(run_evaluation())