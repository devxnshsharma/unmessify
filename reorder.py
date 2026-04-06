import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# We want to replace the sections: predictions and advice-panel with the newly structured order

start_marker = "<!-- Column 2: Predictions -->"
end_marker = "<!-- Forms Section -->"

start_idx = text.find(start_marker)
end_idx = text.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Markers not found!")
    exit(1)

new_content = """<!-- Column 2: Predictions -->
            <section id="predictions" class="dashboard-column">
                <h2 class="column-title">Predictions</h2>

                <!-- 6. Credit Exhaustion (🎉 SURPLUS PROJECTED) -->
                <div class="prediction-card glass-card" id="exhaustionCard">
                    <div class="prediction-header">
                        <span class="prediction-icon">🎯</span>
                        <span class="prediction-title">Credit Exhaustion</span>
                    </div>
                    <div class="prediction-body">
                        <div class="prediction-main" id="exhaustionPrediction">
                            <span class="prediction-date">--</span>
                            <span class="prediction-label">Predicted exhaustion date</span>
                        </div>
                        <div class="prediction-detail" id="surplusDeficit">
                            <span class="detail-icon">💰</span>
                            <span class="detail-text">Add expenses to see projection</span>
                        </div>
                        <!-- Confidence Meter -->
                        <div class="confidence-meter" id="confidenceMeter">
                            <div class="confidence-bar">
                                <div class="confidence-fill" id="confidenceFill" style="width: 0%"></div>
                            </div>
                            <span class="confidence-percent" id="confidencePercent">0%</span>
                        </div>
                        <div class="confidence-reason" id="confidenceReason">
                            Waiting for data...
                        </div>
                    </div>
                </div>

                <!-- Next 3 Days Forecast -->
                <div class="forecast-card glass-card" id="forecastCard">
                    <div class="forecast-header">
                        <span class="forecast-icon">🔮</span>
                        <span class="forecast-title">Next 3 Days Outlook</span>
                    </div>
                    <div class="forecast-body" id="forecastBody">
                        <div class="forecast-item" data-day="1">
                            <span class="forecast-day">Tomorrow</span>
                            <span class="forecast-safe" id="forecast1">--</span>
                            <span class="forecast-risk safe" id="forecastRisk1">Low risk</span>
                        </div>
                        <div class="forecast-item" data-day="2">
                            <span class="forecast-day">Day +2</span>
                            <span class="forecast-safe" id="forecast2">--</span>
                            <span class="forecast-risk" id="forecastRisk2">--</span>
                        </div>
                        <div class="forecast-item" data-day="3">
                            <span class="forecast-day">Day +3</span>
                            <span class="forecast-safe" id="forecast3">--</span>
                            <span class="forecast-risk" id="forecastRisk3">--</span>
                        </div>
                    </div>
                </div>

                <!-- Credit Depletion Chart -->
                <div class="chart-card glass-card">
                    <div class="chart-header">
                        <span class="chart-title">Credit Depletion</span>
                    </div>
                    <div class="chart-container">
                        <canvas id="depletionChart"></canvas>
                    </div>
                </div>

                <!-- Savings Streak Widget -->
                <div class="streak-card glass-card" id="streakCard">
                    <div class="streak-header">
                        <span class="streak-icon">🔥</span>
                        <span class="streak-title">Savings Streak</span>
                    </div>
                    <div class="streak-body">
                        <div class="streak-counter">
                            <span class="streak-number" id="streakNumber">0</span>
                            <span class="streak-label">days under budget</span>
                        </div>
                        <div class="streak-badges" id="streakBadges">
                            <span class="streak-badge" data-days="3" title="3-day streak">🥉</span>
                            <span class="streak-badge" data-days="7" title="Week warrior">🥈</span>
                            <span class="streak-badge" data-days="14" title="Fortnight champion">🥇</span>
                            <span class="streak-badge" data-days="30" title="Month master">🏆</span>
                        </div>
                        <p class="streak-message" id="streakMessage">Start spending under your daily limit to build your streak!</p>
                    </div>
                </div>

                <!-- Money Saved This Week Widget -->
                <div class="savings-card" id="savingsCard">
                    <div class="savings-header">
                        <span class="savings-icon">💰</span>
                        <span class="savings-title">Saved This Week</span>
                    </div>
                    <div class="savings-body">
                        <div class="savings-amount">
                            <span class="savings-value" id="weeklySavings">₹0</span>
                            <span class="savings-comparison" id="savingsComparison">vs last week</span>
                        </div>
                        <div class="savings-bar">
                            <div class="savings-fill" id="savingsFill" style="width: 0%"></div>
                        </div>
                        <p class="savings-tip" id="savingsTip">Keep it up! Every rupee saved counts.</p>
                    </div>
                </div>

            </section>

            <!-- Column 3: Advice Panel -->
            <section id="advice-panel" class="dashboard-column">
                <h2 class="column-title">Smart Advice</h2>

                <!-- 3. Daily Limit / Advice Container (✅ GREAT PROGRESS) -->
                <div class="advice-container" id="adviceContainer">
                    <div class="advice-empty glass-card" id="adviceEmpty">
                        <span class="advice-empty-icon">💡</span>
                        <p>Add some expenses to get personalized recommendations.</p>
                    </div>
                </div>

                <!-- Category Breakdown Chart -->
                <div class="chart-card glass-card">
                    <div class="chart-header">
                        <span class="chart-title">Spending by Category</span>
                    </div>
                    <div class="chart-container chart-container-donut">
                        <canvas id="categoryChart"></canvas>
                    </div>
                    <div class="chart-empty hidden" id="categoryChartEmpty">
                        <span class="empty-icon">🥘</span>
                        <span class="empty-text">No categories to display yet</span>
                    </div>
                </div>

                <!-- What-If Simulator -->
                <div class="simulator-card glass-card" id="simulatorCard">
                    <div class="simulator-header">
                        <span class="simulator-icon">⚡</span>
                        <span class="simulator-title">What If I Spend...</span>
                    </div>
                    <div class="simulator-body">
                        <div class="simulator-buttons">
                            <button class="sim-btn" data-amount="200">₹200</button>
                            <button class="sim-btn" data-amount="300">₹300</button>
                            <button class="sim-btn" data-amount="400">₹400</button>
                            <button class="sim-btn" data-amount="500">₹500</button>
                        </div>
                        <div class="simulator-result hidden" id="simulatorResult">
                            <span class="sim-label">If you spend <span id="simAmount">₹0</span> tomorrow:</span>
                            <div class="sim-impact">
                                <span class="sim-arrow">→</span>
                                <span id="simExhaustion">Exhaustion shifts to --</span>
                            </div>
                            <div class="sim-risk" id="simRisk">
                                <span class="sim-arrow">→</span>
                                <span>Risk becomes <span id="simRiskLevel">--</span></span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 5. Month Narrative -->
                <div class="rules-card glass-card hidden" id="narrativeCard">
                    <div class="rules-header">
                        <span class="rules-icon">📝</span>
                        <span class="rules-title">Month Narrative</span>
                    </div>
                    <div id="narrativeBody">
                        <!-- Dynamically populated -->
                    </div>
                </div>

                <!-- 4. Quick Stats Widget -->
                <div class="quick-stats-card" id="quickStatsCard">
                    <div class="quick-stats-header">
                        <span class="quick-stats-icon">📊</span>
                        <span class="quick-stats-title">Quick Stats</span>
                    </div>
                    <div class="quick-stats-body">
                        <div class="quick-stat-item">
                            <span class="stat-label">Avg per meal</span>
                            <span class="stat-value" id="avgPerMeal">₹0</span>
                        </div>
                        <div class="quick-stat-item">
                            <span class="stat-label">Most expensive day</span>
                            <span class="stat-value" id="mostExpensiveDay">--</span>
                        </div>
                        <div class="quick-stat-item">
                            <span class="stat-label">Cheapest day</span>
                            <span class="stat-value" id="cheapestDay">--</span>
                        </div>
                    </div>
                </div>

                <!-- 1. Personality Badge (BALANCED SPENDER) -->
                <div class="personality-card glass-card hidden" id="personalityCard">
                    <div class="personality-badge" id="personalityBadge">
                        <span class="personality-icon" id="personalityIcon">🐢</span>
                        <span class="personality-label" id="personalityLabel">Conservative Eater</span>
                    </div>
                    <p class="personality-desc" id="personalityDesc">You spend consistently and stay under budget.</p>
                </div>

                <!-- 2. Personal Rules (YOUR PATTERNS) -->
                <div class="rules-card glass-card hidden" id="rulesCard">
                    <div class="rules-header">
                        <span class="rules-icon">🎯</span>
                        <span class="rules-title">Your Patterns</span>
                    </div>
                    <ul class="rules-list" id="rulesList">
                        <!-- Dynamically populated -->
                    </ul>
                </div>

                <!-- 7. Budget Health Indicator -->
                <div class="health-card" id="healthCard">
                    <div class="health-header">
                        <span class="health-icon">❤️</span>
                        <span class="health-title">Budget Health</span>
                    </div>
                    <div class="health-body">
                        <div class="health-meter">
                            <div class="health-fill" id="healthFill" style="width: 75%"></div>
                        </div>
                        <div class="health-status">
                            <span class="health-label" id="healthLabel">Healthy</span>
                            <span class="health-score" id="healthScore">75/100</span>
                        </div>
                        <p class="health-tip" id="healthTip">Your spending is on track!</p>
                    </div>
                </div>

                <!-- Meal Insights Widget -->
                <div class="meal-insights-card" id="mealInsightsCard">
                    <div class="meal-insights-header">
                        <span class="meal-insights-icon">🍽️</span>
                        <span class="meal-insights-title">Meal Insights</span>
                    </div>
                    <div class="meal-insights-body">
                        <div class="meal-insight-item">
                            <span class="insight-label">Top meal type</span>
                            <span class="insight-value" id="topMealType">--</span>
                        </div>
                        <div class="meal-insight-item">
                            <span class="insight-label">Meals this week</span>
                            <span class="insight-value" id="mealsThisWeek">0</span>
                        </div>
                        <div class="meal-insight-item">
                            <span class="insight-label">Favorite item</span>
                            <span class="insight-value" id="favoriteItem">--</span>
                        </div>
                    </div>
                </div>

            </section>

        </section>

        """
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text[:start_idx] + new_content + text[end_idx:])
