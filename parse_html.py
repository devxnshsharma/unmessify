import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

def get_block(regex_start, regex_end):
    start_match = re.search(regex_start, html)
    if not start_match: return "", -1, -1
    start_idx = start_match.start()
    
    end_match = re.search(regex_end, html[start_idx:])
    if not end_match: return "", -1, -1
    end_idx = start_idx + end_match.end()
    
    return html[start_idx:end_idx], start_idx, end_idx

blocks = {
    'forecast': ("<!-- Next 3 Days Forecast -->", r"</div>\n                </div>\n"),
    'depletion': ("<!-- Credit Depletion Chart -->", r"</div>\n                </div>\n"),
    'streak': ("<!-- Savings Streak Widget -->", r"</div>\n                </div>\n"),
    'savings': ("<!-- Money Saved This Week Widget -->", r"</div>\n                </div>\n"),
    'personality': ("<!-- 1. Personality Badge \\(BALANCED SPENDER\\) -->", r"</p>\n                </div>\n"),
    'rules': ("<!-- 2. Personal Rules \\(YOUR PATTERNS\\) -->", r"</ul>\n                </div>\n"),
    'advice': ("<!-- 3. Daily Limit / Advice Container \\(✅ GREAT PROGRESS\\) -->", r"</div>\n                </div>\n"),
    'stats': ("<!-- 4. Quick Stats Widget -->", r"</div>\n                </div>\n"),
    'narrative': ("<!-- 5. Month Narrative -->", r"</div>\n                </div>\n"),
    'exhaustion': ("<!-- 6. Credit Exhaustion \\(🎉 SURPLUS PROJECTED\\) -->", r"</div>\n                    </div>\n                </div>\n"),
    'health': ("<!-- 7. Budget Health Indicator -->", r"</p>\n                    </div>\n                </div>\n"),
    'category': ("<!-- Category Breakdown Chart -->", r"</div>\n                </div>\n"),
    'simulator': ("<!-- What-If Simulator -->", r"</div>\n                </div>\n"),
    'meal': ("<!-- Meal Insights Widget -->", r"</div>\n                </div>\n"),
}

for k, (rs, re_end) in blocks.items():
    block, _, _ = get_block(rs, re_end)
    print(f"{k}: {len(block)} chars")
