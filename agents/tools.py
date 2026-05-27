# agents/tools.py
# Tools that LangGraph agents can call
# These are the "skills" each agent has access to

from dotenv import load_dotenv
import os
from pathlib import Path

# Load .env from project root (two levels up from agents/)
load_dotenv(Path(__file__).parent.parent / '.env')

from langchain_core.tools import tool
from langchain_tavily import TavilySearch
from datetime import date, timedelta

# ── Web search tool (Tavily — free tier 1000/month) ───────────────
web_search = TavilySearch(
    max_results=3,
    tavily_api_key=os.getenv("TAVILY_API_KEY"),
    description="Search for current USCIS policy, visa rules, and immigration news"
)

# ── Visa calculator tool ──────────────────────────────────────────
@tool
def calculate_unemployment_days(
    auth_start: str,
    auth_end: str,
    employment_periods: list[dict],
    visa_type: str
) -> dict:
    """
    Calculate unemployment days for OPT/STEM OPT/H-1B visa holders.
    
    Args:
        auth_start: Authorization start date (YYYY-MM-DD)
        auth_end: Authorization end date (YYYY-MM-DD)  
        employment_periods: List of {start: YYYY-MM-DD, end: YYYY-MM-DD or null}
        visa_type: One of 'opt', 'stem', 'cpt'
    
    Returns:
        dict with unemployed_days, employed_days, gaps, status, days_remaining
    """
    LIMITS = {'opt': 90, 'stem': 150, 'h1b': 60}
    THRESHOLDS = {
        'opt':  {'warn': 60, 'urgent': 80, 'critical': 88},
        'stem': {'warn': 120, 'urgent': 140, 'critical': 148},
        'h1b':  {'warn': 30, 'urgent': 50, 'critical': 58},
    }

    def parse(s):
        if not s: return None
        return date.fromisoformat(s)

    def next_day(d): return d + timedelta(days=1)

    today = date.today()
    start = parse(auth_start)
    auth_end_date = parse(auth_end)
    if not start:
        return {"error": "auth_start is required"}

    auth_end_is_past = auth_end_date and auth_end_date < today
    calc_end = next_day(auth_end_date) if auth_end_is_past else today
    range_end = auth_end_date or today

    # Parse and sort employment periods
    periods = []
    for p in employment_periods:
        s = parse(p.get('start'))
        e = parse(p.get('end')) or today
        if s:
            periods.append({'start': s, 'end': e})
    periods.sort(key=lambda x: x['start'])

    # Merge overlapping periods
    merged = []
    for p in periods:
        s = max(p['start'], start)
        e = min(p['end'], calc_end)
        if e <= s: continue
        if merged and s <= merged[-1]['end']:
            merged[-1]['end'] = max(e, merged[-1]['end'])
        else:
            merged.append({'start': s, 'end': e})

    employed_days = sum((p['end'] - p['start']).days for p in merged)

    # Find gaps
    gaps = []
    cursor = start
    for p in merged:
        if p['start'] > cursor and p['start'] <= calc_end:
            gap_end = min(p['start'], calc_end)
            days = (gap_end - cursor).days
            if days > 0:
                gaps.append({'start': str(cursor), 'end': str(gap_end), 'days': days})
        after = next_day(p['end'])
        if after > cursor:
            cursor = after

    if cursor < calc_end:
        days = (calc_end - cursor).days
        if days > 0:
            gaps.append({'start': str(cursor), 'end': str(calc_end), 'days': days})

    unemployed_days = sum(g['days'] for g in gaps)
    limit = LIMITS.get(visa_type)
    days_remaining = max(0, limit - unemployed_days) if limit else None

    t = THRESHOLDS.get(visa_type, {})
    status = 'ok'
    if limit and unemployed_days >= limit: status = 'over'
    elif t and unemployed_days >= t.get('critical', 999): status = 'critical'
    elif t and unemployed_days >= t.get('urgent', 999):   status = 'urgent'
    elif t and unemployed_days >= t.get('warn', 999):     status = 'warn'

    return {
        'visa_type': visa_type,
        'unemployed_days': unemployed_days,
        'employed_days': employed_days,
        'total_auth_days': (range_end - start).days,
        'days_remaining': days_remaining,
        'limit': limit,
        'status': status,
        'gaps': gaps,
        'calculation_date': str(today)
    }


@tool
def get_visa_rules(visa_type: str) -> dict:
    """
    Get the current rules, limits, and key facts for a specific visa type.
    
    Args:
        visa_type: One of 'opt', 'stem', 'cpt'
    
    Returns:
        dict with rules, limits, thresholds, and key compliance facts
    """
    rules = {
        'opt': {
            'name': 'F-1 OPT (Post-Completion)',
            'unemployment_limit': 90,
            'duration': '12 months',
            'key_rules': [
                '90-day cumulative unemployment limit — days count 7 days/week including weekends',
                'Must apply 90 days before graduation, up to 60 days after',
                'EAD processing takes approximately 3-5 months — apply early',
                'One OPT per degree level (bachelors, masters, PhD)',
                '60-day grace period after OPT expires before you must depart',
                'Unemployment days reset to zero if you change degree level',
            ],
            'thresholds': {'warn': 60, 'urgent': 80, 'critical': 88}
        },
        'stem': {
            'name': 'F-1 STEM OPT Extension',
            'unemployment_limit': 150,
            'duration': '24 months extension',
            'key_rules': [
                '150-day CUMULATIVE limit — includes unemployment days from initial OPT period',
                'Must apply 90 days before OPT expires',
                'Employer must be E-Verify registered — check e-verify.gov',
                'Must have a DHS-designated STEM degree (CIP code list)',
                'Form I-983 Training Plan required — employer must sign',
                'Only one STEM extension per degree level',
                'If EAD pending when OPT expires, 180-day cap-gap may apply',
            ],
            'thresholds': {'warn': 120, 'urgent': 140, 'critical': 148}
        },
        'h1b': {
            'name': 'H-1B Specialty Occupation',
            'unemployment_limit': 60,
            'duration': '3 years initial, renewable to 6 years',
            'key_rules': [
                'USCIS 60-day grace period after involuntary job loss',
                'Must find new sponsor, change status, or depart within 60 days',
                'Annual lottery: registration opens March, H-1B starts October 1',
                'Masters cap: US masters holders get two lottery entries (regular + 20k masters pool)',
                'Cap-exempt employers (universities, non-profits) can file any time without lottery',
                'H-1B portability: can change jobs after 180 days if new employer files I-129',
                'Premium processing available — 15 business day adjudication',
            ],
            'thresholds': {'warn': 30, 'urgent': 50, 'critical': 58}
        },
        'cpt': {
            'name': 'F-1 CPT (Curricular Practical Training)',
            'unemployment_limit': None,
            'duration': 'Per semester authorization',
            'key_rules': [
                'No unemployment day limit — authorization is semester-based',
                'Must be integral part of established curriculum',
                'Must have been enrolled full-time for 1 academic year',
                '12+ months full-time CPT makes you ineligible for OPT',
                'Notify DSO if you have an unexpected gap in CPT employment',
            ],
            'thresholds': {'warn': 14, 'urgent': 30, 'critical': 60}
        },

    }
    return rules.get(visa_type, {'error': f'Unknown visa type: {visa_type}'})