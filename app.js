/* ========================================
   UNMESSIFY - Core Application Logic
   ======================================== */

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================
const STORAGE_KEY = 'unmessify_state_v1';
const ITEM_PRICES = {
    veg: { min: 30, max: 80 },
    paneer: { min: 60, max: 120 },
    chicken: { min: 80, max: 150 },
    dessert: { min: 30, max: 60 },
    beverage: { min: 20, max: 50 },
    other: { min: 20, max: 100 }
};

// ==========================================
// DATA MODELS
// ==========================================

/**
 * Create a new user profile
 * @returns {Object} Default user profile
 */
function createDefaultProfile() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    return {
        userType: 'hostel_student',
        monthlyCredits: 6000,
        monthDays: daysInMonth,
        startDate: formatDate(startOfMonth),
        preferences: {
            riskTolerance: 'medium',
            weekendBoost: false,
            examMode: false,
            maxSpendPerDay: null,
            vegetarian: false,
            notificationThresholds: {
                warning: 0.7,
                danger: 0.9
            }
        }
    };
}

/**
 * Create a new expense entry
 * @param {Object} data - Expense data
 * @returns {Object} Expense entry with generated ID
 */
function createExpenseEntry(data) {
    return {
        id: generateUUID(),
        date: data.date,
        mealType: data.mealType || 'lunch',
        itemType: data.itemType || 'veg',
        quantity: parseInt(data.quantity) || 1,
        cost: parseFloat(data.cost) || 0,
        notes: data.notes || null
    };
}

/**
 * Compute derived data from profile and expenses
 * @param {Object} profile - User profile
 * @param {Array} expenses - Array of expense entries
 * @returns {Object} Derived data
 */
function computeDerivedData(profile, expenses) {
    const today = new Date();
    const todayStr = formatDate(today);
    const startDate = new Date(profile.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + profile.monthDays - 1);

    // Calculate days elapsed and remaining
    const daysElapsed = Math.max(0, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1);
    const remainingDays = Math.max(0, profile.monthDays - daysElapsed);

    // Calculate totals
    const totalSpent = expenses.reduce((sum, exp) => sum + exp.cost, 0);
    const remainingCredits = Math.max(0, profile.monthlyCredits - totalSpent);

    // Calculate today's spend
    const todayExpenses = expenses.filter(exp => exp.date === todayStr);
    const todaySpend = todayExpenses.reduce((sum, exp) => sum + exp.cost, 0);

    // Calculate burn rates
    const burnRateOverall = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
    const burnRate7d = calculateBurnRateWindow(expenses, 7, startDate);
    const burnRate3d = calculateBurnRateWindow(expenses, 3, startDate);

    // Calculate target burn rate (ideal daily spend)
    const targetBurnRate = profile.monthlyCredits / profile.monthDays;

    // Calculate daily safe limit with adaptive logic
    const dailySafeLimit = calculateDailySafeLimit(profile, expenses, {
        remainingCredits,
        remainingDays,
        averageDailySpend: burnRateOverall,
        targetBurnRate
    });

    // Predict exhaustion date
    const { predictedExhaustionDate, daysUntilExhaustion } = predictExhaustionDate(
        remainingCredits,
        burnRate7d > 0 ? burnRate7d : burnRateOverall,
        today,
        endDate
    );

    // Calculate surplus or deficit at month end
    const projectedTotalSpend = burnRateOverall * profile.monthDays;
    const surplusOrDeficit = profile.monthlyCredits - projectedTotalSpend;

    // Determine risk level
    const riskLevel = determineRiskLevel(
        totalSpent,
        profile.monthlyCredits,
        daysElapsed,
        profile.monthDays,
        daysUntilExhaustion,
        remainingDays,
        profile.preferences.notificationThresholds
    );

    // Ratios for display
    const creditsUsedRatio = profile.monthlyCredits > 0 ? totalSpent / profile.monthlyCredits : 0;
    const timeElapsedRatio = profile.monthDays > 0 ? daysElapsed / profile.monthDays : 0;

    // Confidence level for predictions
    const confidenceLevel = determineConfidenceLevel(expenses.length, daysElapsed);

    return {
        today: todayStr,
        daysElapsed,
        remainingDays,
        totalSpent,
        remainingCredits,
        todaySpend,
        dailySafeLimit,
        averageDailySpend: burnRateOverall,
        burnRate7d,
        burnRate3d,
        burnRateOverall,
        targetBurnRate,
        predictedExhaustionDate,
        daysUntilExhaustion,
        riskLevel,
        surplusOrDeficit,
        creditsUsedRatio,
        timeElapsedRatio,
        confidenceLevel,
        endDate: formatDate(endDate)
    };
}

// ==========================================
// CALCULATION FUNCTIONS
// ==========================================

/**
 * Calculate burn rate for a specific window of days
 */
function calculateBurnRateWindow(expenses, windowDays, startDate) {
    const today = new Date();
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - windowDays + 1);

    // Ensure we don't go before the start date
    const effectiveStart = windowStart > startDate ? windowStart : startDate;

    const windowExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate >= effectiveStart && expDate <= today;
    });

    const windowTotal = windowExpenses.reduce((sum, exp) => sum + exp.cost, 0);
    const actualWindowDays = Math.max(1, Math.floor((today - effectiveStart) / (1000 * 60 * 60 * 24)) + 1);

    return windowTotal / actualWindowDays;
}

/**
 * Calculate adaptive daily safe limit
 */
function calculateDailySafeLimit(profile, expenses, derivedBase) {
    const { remainingCredits, remainingDays, averageDailySpend, targetBurnRate } = derivedBase;

    if (remainingDays <= 0) return 0;

    // Base calculation: simple division
    let base = remainingCredits / remainingDays;

    // Adaptive adjustment: if spending higher than ideal, reduce limit
    if (averageDailySpend > 0 && targetBurnRate > 0 && averageDailySpend > targetBurnRate) {
        const overshootRatio = averageDailySpend / targetBurnRate;
        // Apply a dampening factor (not full overshoot correction)
        base = base / Math.pow(overshootRatio, 0.5);
    }

    // Apply risk tolerance factor
    const toleranceFactors = {
        low: 0.85,
        medium: 1.0,
        high: 1.1
    };
    const factor = toleranceFactors[profile.preferences.riskTolerance] || 1.0;
    base = base * factor;

    // Apply weekend boost if enabled and it's a weekend
    const today = new Date();
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    if (profile.preferences.weekendBoost && isWeekend) {
        base = base * 1.15; // 15% boost on weekends
    }

    // Apply exam mode if enabled (slightly higher limit for snacks)
    if (profile.preferences.examMode) {
        base = base * 1.05;
    }

    // Apply user-defined cap if set
    if (profile.preferences.maxSpendPerDay && profile.preferences.maxSpendPerDay > 0) {
        base = Math.min(base, profile.preferences.maxSpendPerDay);
    }

    return Math.max(0, Math.round(base));
}

/**
 * Predict credit exhaustion date
 */
function predictExhaustionDate(remainingCredits, burnRate, today, endDate) {
    if (remainingCredits <= 0) {
        return {
            predictedExhaustionDate: formatDate(today),
            daysUntilExhaustion: 0
        };
    }

    if (burnRate <= 0) {
        return {
            predictedExhaustionDate: null,
            daysUntilExhaustion: Infinity
        };
    }

    const daysUntilExhaustion = Math.ceil(remainingCredits / burnRate);
    const exhaustionDate = new Date(today);
    exhaustionDate.setDate(exhaustionDate.getDate() + daysUntilExhaustion);

    return {
        predictedExhaustionDate: formatDate(exhaustionDate),
        daysUntilExhaustion
    };
}

/**
 * Determine risk level based on multiple factors
 */
function determineRiskLevel(totalSpent, monthlyCredits, daysElapsed, monthDays, daysUntilExhaustion, remainingDays, thresholds) {
    const creditsUsedRatio = monthlyCredits > 0 ? totalSpent / monthlyCredits : 0;
    const timeElapsedRatio = monthDays > 0 ? daysElapsed / monthDays : 0;

    // Check if exhaustion will happen before month end
    if (daysUntilExhaustion !== Infinity && daysUntilExhaustion < remainingDays - 3) {
        return 'danger';
    }

    // Check against thresholds
    if (creditsUsedRatio >= thresholds.danger) {
        return 'danger';
    }

    if (creditsUsedRatio >= thresholds.warning) {
        return 'watch';
    }

    // Spending faster than time passing
    if (creditsUsedRatio > timeElapsedRatio + 0.15) {
        return 'danger';
    }

    if (creditsUsedRatio > timeElapsedRatio + 0.05) {
        return 'watch';
    }

    return 'safe';
}

/**
 * Determine confidence level for predictions
 */
function determineConfidenceLevel(expenseCount, daysElapsed) {
    if (expenseCount < 3 || daysElapsed < 2) {
        return 'low';
    }
    if (expenseCount < 10 || daysElapsed < 5) {
        return 'medium';
    }
    return 'high';
}

/**
 * Get confidence percentage (0-100)
 */
function getConfidencePercent(expenseCount, daysElapsed) {
    // Max confidence at 15 days and 20+ expenses
    const daysFactor = Math.min(daysElapsed / 15, 1) * 50;
    const expensesFactor = Math.min(expenseCount / 20, 1) * 50;
    return Math.round(daysFactor + expensesFactor);
}

/**
 * Compute "Today's Context" insights
 */
function computeTodayContext(profile, expenses, derived) {
    const insights = [];
    const today = new Date();
    const todayStr = formatDate(today);
    const dayOfWeek = today.getDay();

    // Get today's expenses
    const todayExpenses = expenses.filter(exp => exp.date === todayStr);
    const todayTotal = todayExpenses.reduce((sum, exp) => sum + exp.cost, 0);

    // Get 7-day average
    const avg7d = derived.burnRate7d;

    // Compare today vs 7-day average
    if (todayTotal > 0 && avg7d > 0) {
        const percentDiff = Math.round(((todayTotal - avg7d) / avg7d) * 100);
        if (percentDiff > 20) {
            insights.push({
                icon: '⬆️',
                text: `Today is ${percentDiff}% higher than your 7-day average`,
                type: 'warning'
            });
        } else if (percentDiff < -20) {
            insights.push({
                icon: '⬇️',
                text: `Today is ${Math.abs(percentDiff)}% lower than your 7-day average`,
                type: 'good'
            });
        }
    }

    // Check meal type dominance
    const mealCosts = {};
    todayExpenses.forEach(exp => {
        mealCosts[exp.mealType] = (mealCosts[exp.mealType] || 0) + exp.cost;
    });
    const topMeal = Object.entries(mealCosts).sort((a, b) => b[1] - a[1])[0];
    if (topMeal && topMeal[1] > todayTotal * 0.5) {
        const mealNames = { breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', dinner: 'Dinner' };
        insights.push({
            icon: '🍽️',
            text: `${mealNames[topMeal[0]] || topMeal[0]} accounts for ${Math.round(topMeal[1] / todayTotal * 100)}% of today's spend`,
            type: 'info'
        });
    }

    // Check item type impact (chicken vs veg)
    const chickenCost = todayExpenses.filter(e => e.itemType === 'chicken').reduce((s, e) => s + e.cost, 0);
    const vegCost = todayExpenses.filter(e => e.itemType === 'veg').reduce((s, e) => s + e.cost, 0);
    if (chickenCost > vegCost + 100) {
        insights.push({
            icon: '🍗',
            text: `Chicken items cost ₹${chickenCost - vegCost} more than veg alternatives`,
            type: 'info'
        });
    }

    // Day-of-week pattern (only if we have enough data)
    const sameDayExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate.getDay() === dayOfWeek && exp.date !== todayStr;
    });
    if (sameDayExpenses.length >= 2) {
        const sameDayAvg = sameDayExpenses.reduce((s, e) => s + e.cost, 0) / (sameDayExpenses.length / 3); // Rough avg per day
        const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
        if (dayOfWeek === 5 || dayOfWeek === 6) { // Friday or Saturday
            insights.push({
                icon: '📅',
                text: `${dayNames[dayOfWeek]} are typically your highest-spend days`,
                type: 'warning'
            });
        }
    }

    return insights.slice(0, 3); // Max 3 insights
}

/**
 * Compute 3-day forecast
 */
function computeForecast(profile, expenses, derived) {
    const avgBurn = derived.burnRate7d > 0 ? derived.burnRate7d : derived.targetBurnRate;
    const forecasts = [];

    for (let i = 1; i <= 3; i++) {
        const futureRemaining = derived.remainingCredits - (avgBurn * i);
        const futureRemainingDays = derived.remainingDays - i;

        let safeSpend = futureRemainingDays > 0 ? Math.round(futureRemaining / futureRemainingDays) : 0;
        safeSpend = Math.max(0, safeSpend);

        // Determine risk level
        let risk = 'safe';
        let riskLabel = 'Low risk';

        if (futureRemaining <= 0) {
            risk = 'danger';
            riskLabel = 'Critical';
        } else if (safeSpend < derived.targetBurnRate * 0.7) {
            risk = 'danger';
            riskLabel = 'High risk';
        } else if (safeSpend < derived.targetBurnRate * 0.9) {
            risk = 'watch';
            riskLabel = 'Watch';
        }

        forecasts.push({
            day: i,
            safeSpend,
            risk,
            riskLabel
        });
    }

    return forecasts;
}

/**
 * Compute what changed since yesterday
 */
function computeYesterdayDelta(profile, expenses, derived) {
    const deltas = [];

    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);

    // Calculate yesterday's derived data (simulate)
    const yesterdayExpenses = expenses.filter(exp => exp.date <= yesterdayStr);
    if (yesterdayExpenses.length < 3) return deltas;

    const yesterdayDerived = computeDerivedData(profile, yesterdayExpenses);

    // Compare burn rates
    const burnDelta = Math.round(derived.burnRateOverall - yesterdayDerived.burnRateOverall);
    if (Math.abs(burnDelta) >= 10) {
        deltas.push({
            icon: burnDelta > 0 ? '↑' : '↓',
            text: `Burn rate ${burnDelta > 0 ? 'increased' : 'decreased'} by ₹${Math.abs(burnDelta)}/day`,
            type: burnDelta > 0 ? 'warning' : 'good'
        });
    }

    // Compare safe limits
    const safeDelta = Math.round(derived.dailySafeLimit - yesterdayDerived.dailySafeLimit);
    if (Math.abs(safeDelta) >= 10) {
        deltas.push({
            icon: safeDelta > 0 ? '↑' : '↓',
            text: `Safe limit ${safeDelta > 0 ? 'increased' : 'reduced'} by ₹${Math.abs(safeDelta)}`,
            type: safeDelta > 0 ? 'good' : 'warning'
        });
    }

    // Check for spending spikes by category today
    const todayExpenses = expenses.filter(exp => exp.date === derived.today);
    const snackSpend = todayExpenses.filter(e => e.mealType === 'snacks').reduce((s, e) => s + e.cost, 0);
    if (snackSpend > derived.dailySafeLimit * 0.3) {
        deltas.push({
            icon: '⚠',
            text: 'Snack spending spiked today',
            type: 'warning'
        });
    }

    return deltas.slice(0, 3);
}

/**
 * Calculate spending personality
 */
function calculatePersonality(profile, expenses, derived) {
    if (expenses.length < 5) return null;

    // Calculate category percentages
    const categoryTotals = {};
    expenses.forEach(exp => {
        categoryTotals[exp.itemType] = (categoryTotals[exp.itemType] || 0) + exp.cost;
    });

    const proteinPercent = ((categoryTotals.chicken || 0) + (categoryTotals.paneer || 0)) / derived.totalSpent * 100;
    const snackTotal = expenses.filter(e => e.mealType === 'snacks').reduce((s, e) => s + e.cost, 0);
    const snackPercent = (snackTotal / derived.totalSpent) * 100;

    // Weekend vs weekday analysis
    let weekendSpend = 0, weekdaySpend = 0, weekendDays = 0, weekdayDays = 0;
    const daySpends = {};
    expenses.forEach(exp => {
        const d = new Date(exp.date);
        if (!daySpends[exp.date]) daySpends[exp.date] = { total: 0, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
        daySpends[exp.date].total += exp.cost;
    });
    Object.values(daySpends).forEach(day => {
        if (day.isWeekend) { weekendSpend += day.total; weekendDays++; }
        else { weekdaySpend += day.total; weekdayDays++; }
    });
    const weekendAvg = weekendDays > 0 ? weekendSpend / weekendDays : 0;
    const weekdayAvg = weekdayDays > 0 ? weekdaySpend / weekdayDays : 0;

    // Variance calculation
    const dailySpends = Object.values(daySpends).map(d => d.total);
    const avgSpend = derived.burnRateOverall;
    const variance = dailySpends.reduce((sum, s) => sum + Math.pow(s - avgSpend, 2), 0) / dailySpends.length;
    const stdDev = Math.sqrt(variance);
    const isConsistent = stdDev < avgSpend * 0.3;

    // Determine personality
    if (weekendAvg > weekdayAvg * 1.3 && weekendDays >= 2) {
        return {
            icon: '🔥',
            label: 'Weekend Spender',
            desc: 'You tend to spend more on weekends. Consider weekend boost mode!'
        };
    }

    if (snackPercent > 15) {
        return {
            icon: '☕',
            label: 'Snack Lover',
            desc: 'Snacks and beverages make up a significant portion of your spending.'
        };
    }

    if (proteinPercent > 40) {
        return {
            icon: '🍗',
            label: 'Protein Focused',
            desc: 'You prefer chicken and paneer dishes. They cost more but you get your protein!'
        };
    }

    if (isConsistent && derived.creditsUsedRatio < derived.timeElapsedRatio) {
        return {
            icon: '🐢',
            label: 'Conservative Eater',
            desc: 'You spend consistently and stay under budget. Great discipline!'
        };
    }

    return {
        icon: '⚖️',
        label: 'Balanced Spender',
        desc: 'Your spending patterns are well-distributed across categories and days.'
    };
}

/**
 * Generate personal spending rules/insights
 */
function generatePersonalRules(profile, expenses, derived) {
    const rules = [];
    if (expenses.length < 7) return rules;

    // Analyze by time/meal
    const mealCosts = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0, other: 0 };
    const mealCounts = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0, other: 0 };

    expenses.forEach(exp => {
        mealCosts[exp.mealType] = (mealCosts[exp.mealType] || 0) + exp.cost;
        mealCounts[exp.mealType] = (mealCounts[exp.mealType] || 0) + 1;
    });

    // Find most expensive meal type
    const avgMealCosts = Object.entries(mealCosts).map(([meal, cost]) => ({
        meal,
        avg: mealCounts[meal] > 0 ? cost / mealCounts[meal] : 0
    })).filter(m => m.avg > 0);

    avgMealCosts.sort((a, b) => b.avg - a.avg);
    if (avgMealCosts.length > 0 && avgMealCosts[0].avg > derived.targetBurnRate * 0.4) {
        const mealNames = { breakfast: 'breakfasts', lunch: 'lunches', snacks: 'snacks', dinner: 'dinners' };
        rules.push(`Your ${mealNames[avgMealCosts[0].meal] || avgMealCosts[0].meal} average ₹${Math.round(avgMealCosts[0].avg)} each`);
    }

    // Check chicken impact
    const chickenExpenses = expenses.filter(e => e.itemType === 'chicken');
    if (chickenExpenses.length >= 3) {
        const chickenTotal = chickenExpenses.reduce((s, e) => s + e.cost, 0);
        const chickenPercent = Math.round((chickenTotal / derived.totalSpent) * 100);
        if (chickenPercent > 25) {
            rules.push(`Chicken dishes cause ${chickenPercent}% of your total spending`);
        }
    }

    // Day of week analysis
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    expenses.forEach(exp => {
        const d = new Date(exp.date).getDay();
        dayTotals[d] += exp.cost;
        dayCounts[d]++;
    });

    const dayAvgs = dayTotals.map((t, i) => dayCounts[i] > 0 ? t / dayCounts[i] : 0);
    const maxDayIdx = dayAvgs.indexOf(Math.max(...dayAvgs.filter(a => a > 0)));
    const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

    if (dayAvgs[maxDayIdx] > derived.burnRateOverall * 1.2) {
        rules.push(`${dayNames[maxDayIdx]} are your riskiest spending days`);
    }

    return rules.slice(0, 3);
}

/**
 * Generate end-of-month narrative
 */
function generateMonthNarrative(profile, expenses, derived) {
    if (derived.daysElapsed < 20) return null;

    const narrative = [];

    // Opening based on spending pattern
    const firstHalfExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        const startDate = new Date(profile.startDate);
        const dayNum = Math.floor((expDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        return dayNum <= profile.monthDays / 2;
    });
    const firstHalfTotal = firstHalfExpenses.reduce((s, e) => s + e.cost, 0);
    const secondHalfTotal = derived.totalSpent - firstHalfTotal;

    if (firstHalfTotal < secondHalfTotal * 0.8) {
        narrative.push('You started the month conservatively, then spending accelerated in the second half.');
    } else if (firstHalfTotal > secondHalfTotal * 1.2) {
        narrative.push('You spent heavily early on but have been more disciplined recently.');
    } else {
        narrative.push('Your spending has been fairly consistent throughout the month.');
    }

    // Category insight
    const categoryTotals = {};
    expenses.forEach(exp => {
        categoryTotals[exp.itemType] = (categoryTotals[exp.itemType] || 0) + exp.cost;
    });
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
        const catNames = { veg: 'vegetarian dishes', chicken: 'chicken items', paneer: 'paneer dishes', dessert: 'desserts', snacks: 'snacks' };
        narrative.push(`${catNames[topCategory[0]] || topCategory[0]} dominated your spending this month.`);
    }

    // Projection
    if (derived.surplusOrDeficit > 0) {
        narrative.push(`If you maintain current discipline, you'll finish with ~₹${Math.round(derived.surplusOrDeficit)} surplus.`);
    } else if (derived.surplusOrDeficit < -200) {
        narrative.push(`At current pace, you may need an extra ₹${Math.abs(Math.round(derived.surplusOrDeficit))} to finish the month.`);
    }

    return narrative.join(' ');
}

/**
 * Simulate spending impact on exhaustion
 */
function simulateSpend(profile, expenses, derived, amount) {
    // Add hypothetical expense for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const newRemaining = derived.remainingCredits - amount;
    const newRemainingDays = derived.remainingDays - 1;

    if (newRemainingDays <= 0) {
        return {
            exhaustionDate: formatDateDisplay(tomorrow.toISOString().split('T')[0]),
            risk: 'danger'
        };
    }

    const newBurnRate = (derived.totalSpent + amount) / (derived.daysElapsed + 1);
    const daysUntilExhaustion = newRemaining > 0 ? Math.ceil(newRemaining / newBurnRate) : 0;

    const exhaustionDate = new Date(tomorrow);
    exhaustionDate.setDate(exhaustionDate.getDate() + daysUntilExhaustion);

    // Determine new risk level
    let risk = 'safe';
    if (daysUntilExhaustion < newRemainingDays - 3) {
        risk = 'danger';
    } else if (daysUntilExhaustion < newRemainingDays) {
        risk = 'watch';
    }

    return {
        exhaustionDate: formatDateDisplay(exhaustionDate.toISOString().split('T')[0]),
        risk
    };
}

// ==========================================
// ADVICE ENGINE
// ==========================================

const adviceRules = [
    {
        id: 'on_track',
        when: (profile, derived, expenses) =>
            derived.riskLevel === 'safe' && expenses.length >= 3,
        message: (profile, derived) =>
            `You're on track! Maintain your current spending pattern to finish the month with ~₹${Math.abs(Math.round(derived.surplusOrDeficit))} ${derived.surplusOrDeficit >= 0 ? 'surplus' : 'to spare'}.`,
        severity: 'low',
        category: 'positive',
        title: '✅ Great Progress'
    },
    {
        id: 'overspending_early',
        when: (profile, derived, expenses) =>
            derived.daysElapsed <= profile.monthDays / 2 &&
            derived.creditsUsedRatio > derived.timeElapsedRatio + 0.1,
        message: (profile, derived) =>
            `You've used ${Math.round(derived.creditsUsedRatio * 100)}% of credits in ${Math.round(derived.timeElapsedRatio * 100)}% of the month. Consider reducing spending for the next ${Math.max(3, Math.round(derived.remainingDays / 3))} days.`,
        severity: 'high',
        category: 'spend_control',
        title: '⚠️ Early Overspending'
    },
    {
        id: 'exhaustion_warning',
        when: (profile, derived, expenses) =>
            derived.daysUntilExhaustion !== Infinity &&
            derived.daysUntilExhaustion < derived.remainingDays,
        message: (profile, derived) => {
            const shortfall = derived.remainingDays - derived.daysUntilExhaustion;
            return `At current rate, credits will finish ${shortfall} day(s) before month end. You'll need to reduce daily spending to ₹${Math.round(derived.remainingCredits / derived.remainingDays)} to last the full month.`;
        },
        severity: 'high',
        category: 'prediction',
        title: '🚨 Credit Exhaustion Alert'
    },
    {
        id: 'frequent_chicken',
        when: (profile, derived, expenses) => {
            const chickenCount = expenses.filter(e => e.itemType === 'chicken').length;
            return chickenCount >= 5;
        },
        message: (profile, derived, expenses) => {
            const chickenCount = expenses.filter(e => e.itemType === 'chicken').length;
            const chickenCost = expenses.filter(e => e.itemType === 'chicken').reduce((s, e) => s + e.cost, 0);
            return `You've had chicken ${chickenCount} times (₹${chickenCost} total). Swapping some for paneer or veg items could save ₹${Math.round(chickenCost * 0.3)}.`;
        },
        severity: 'medium',
        category: 'category_mix',
        title: '🍗 Chicken Frequency'
    },
    {
        id: 'dessert_spending',
        when: (profile, derived, expenses) => {
            const dessertTotal = expenses.filter(e => e.itemType === 'dessert').reduce((s, e) => s + e.cost, 0);
            return dessertTotal > profile.monthlyCredits * 0.1;
        },
        message: (profile, derived, expenses) => {
            const dessertTotal = expenses.filter(e => e.itemType === 'dessert').reduce((s, e) => s + e.cost, 0);
            return `Desserts account for ₹${dessertTotal} (${Math.round(dessertTotal / profile.monthlyCredits * 100)}% of budget). Consider limiting to weekends to save credits.`;
        },
        severity: 'medium',
        category: 'luxury',
        title: '🍰 Dessert Alert'
    },
    {
        id: 'daily_limit_exceeded',
        when: (profile, derived, expenses) =>
            derived.todaySpend > derived.dailySafeLimit && derived.dailySafeLimit > 0,
        message: (profile, derived) =>
            `Today's spending (₹${derived.todaySpend}) exceeded your safe limit (₹${derived.dailySafeLimit}). Consider a lighter dinner or skip snacks to balance.`,
        severity: 'high',
        category: 'daily',
        title: '📊 Daily Limit Exceeded'
    },
    {
        id: 'weekend_boost_suggestion',
        when: (profile, derived, expenses) => {
            const today = new Date();
            const isWeekday = today.getDay() >= 1 && today.getDay() <= 5;
            return !profile.preferences.weekendBoost &&
                isWeekday &&
                derived.todaySpend < derived.dailySafeLimit * 0.8;
        },
        message: () =>
            'Tip: Enable "Weekend Boost" in preferences to save credits on weekdays and enjoy more on weekends.',
        severity: 'low',
        category: 'tip',
        title: '💡 Weekend Boost'
    },
    {
        id: 'surplus_projection',
        when: (profile, derived, expenses) =>
            derived.surplusOrDeficit > profile.monthlyCredits * 0.1 && expenses.length >= 5,
        message: (profile, derived) =>
            `Great news! At current pace, you'll finish with ~₹${Math.round(derived.surplusOrDeficit)} surplus. You can afford a bit more flexibility.`,
        severity: 'low',
        category: 'positive',
        title: '🎉 Surplus Projected'
    },
    {
        id: 'queue_risk',
        when: (profile, derived, expenses) =>
            derived.riskLevel === 'danger' && derived.remainingCredits < 500,
        message: (profile, derived) =>
            `Credits are critically low (₹${derived.remainingCredits}). You may need to use cash and face longer queues for the remaining ${derived.remainingDays} days.`,
        severity: 'high',
        category: 'warning',
        title: '🚶 Queue Risk'
    }
];

/**
 * Generate advice based on current state
 */
function generateAdvice(profile, derived, expenses) {
    const triggeredRules = adviceRules
        .filter(rule => rule.when(profile, derived, expenses))
        .map(rule => ({
            id: rule.id,
            title: rule.title,
            message: rule.message(profile, derived, expenses),
            severity: rule.severity,
            category: rule.category
        }));

    // Sort by severity (high -> medium -> low)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    triggeredRules.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Limit to top 5 advice items
    return triggeredRules.slice(0, 5);
}

// ==========================================
// LOCAL STORAGE MANAGEMENT
// ==========================================

/**
 * Load app state from localStorage
 */
function loadState() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const state = JSON.parse(stored);
            // Migration logic for future versions
            return migrateState(state);
        }
    } catch (error) {
        console.error('Error loading state:', error);
        showToast('Could not load saved data. Starting fresh.', 'warning');
    }
    return null;
}

/**
 * Save app state to localStorage
 */
function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (error) {
        console.error('Error saving state:', error);
        showToast('Could not save data. You may be in private browsing mode.', 'warning');
        return false;
    }
}

/**
 * Migrate state from older versions
 */
function migrateState(state) {
    // Add migration logic here when schema changes
    // For now, just return as-is
    return state;
}

/**
 * Export state as JSON file
 */
function exportState(state) {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `unmessify_backup_${formatDate(new Date())}.json`;
    link.click();

    URL.revokeObjectURL(url);
    showToast('Data exported successfully!', 'success');
}

/**
 * Import state from JSON file
 */
function importState(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const state = JSON.parse(e.target.result);
            if (state.profile && state.expenses) {
                callback(state);
                showToast('Data imported successfully!', 'success');
            } else {
                showToast('Invalid backup file format.', 'error');
            }
        } catch (error) {
            console.error('Import error:', error);
            showToast('Could not read backup file.', 'error');
        }
    };
    reader.readAsText(file);
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr) {
    const date = new Date(dateStr);
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-IN', options);
}

function formatCurrency(amount) {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// ==========================================
// UI FUNCTIONS
// ==========================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: '✅',
        warning: '⚠️',
        error: '❌'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;

    modal.setAttribute('aria-hidden', 'false');

    const confirmBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');

    const cleanup = () => {
        modal.setAttribute('aria-hidden', 'true');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
        cleanup();
        onConfirm();
    };

    cancelBtn.onclick = cleanup;
}

// ==========================================
// MAIN APPLICATION CLASS
// ==========================================

class UnmessifyApp {
    constructor() {
        this.profile = null;
        this.expenses = [];
        this.derived = null;

        this.init();
    }

    init() {
        // Load saved state
        const state = loadState();
        if (state) {
            this.profile = state.profile;
            this.expenses = state.expenses || [];
        }

        // Set up event listeners
        this.setupEventListeners();

        // Initial render
        this.render();
    }

    setupEventListeners() {
        // Continue as Guest button (returning users)
        const continueGuestBtn = document.getElementById('continueGuestBtn');
        if (continueGuestBtn) {
            continueGuestBtn.addEventListener('click', () => {
                this.showMainApp();
                this.switchTab('expense');
            });
        }

        // Quick Setup form (new users)
        const quickSetupForm = document.getElementById('quickSetupForm');
        if (quickSetupForm) {
            quickSetupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleQuickSetup(e.target);
            });
        }

        // Tab navigation
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Setup form
        document.getElementById('setupForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSetupSubmit(e.target);
        });

        // Expense form
        document.getElementById('expenseForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleExpenseSubmit(e.target);
        });

        // Set default date for expense
        document.getElementById('expenseDate').value = formatDate(new Date());

        // Preferences form
        document.getElementById('preferencesForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePreferencesSubmit(e.target);
        });

        // Update safe limit preview when preferences change
        ['riskTolerance', 'maxSpendPerDay', 'weekendBoost', 'examMode'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.updateSafeLimitPreview());
            }
        });

        // What-If Simulator buttons - with toggle collapse
        document.querySelectorAll('.sim-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const amount = parseInt(btn.dataset.amount);
                const isCurrentlyActive = btn.classList.contains('active');

                // If clicking the same active button, collapse/toggle off
                if (isCurrentlyActive) {
                    btn.classList.remove('active');
                    document.getElementById('simulatorResult').classList.add('hidden');
                    return;
                }

                // Otherwise, show simulation for this amount
                this.handleSimulation(amount);
                // Update active state
                document.querySelectorAll('.sim-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Data management buttons
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            if (this.profile) {
                exportState({ profile: this.profile, expenses: this.expenses });
            } else {
                showToast('No data to export. Set up your profile first.', 'warning');
            }
        });

        document.getElementById('importDataInput').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                importState(e.target.files[0], (state) => {
                    this.profile = state.profile;
                    this.expenses = state.expenses;
                    this.save();
                    this.render();
                });
            }
        });

        document.getElementById('clearDataBtn').addEventListener('click', () => {
            showConfirmModal(
                'Clear All Data',
                'This will delete your profile and all expenses. This cannot be undone.',
                () => {
                    this.profile = null;
                    this.expenses = [];
                    localStorage.removeItem(STORAGE_KEY);
                    this.render();
                    showToast('All data cleared.', 'success');
                }
            );
        });

        // Set start date default and constraints
        const startDateInput = document.getElementById('startDate');
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        startDateInput.value = formatDate(firstOfMonth);
    }

    handleQuickSetup(form) {
        const formData = new FormData(form);
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        this.profile = {
            userType: 'hostel_student',
            userName: formData.get('userName') || 'Student',
            monthlyCredits: parseFloat(document.getElementById('quickCredits').value) || 6000,
            monthDays: daysInMonth,
            startDate: formatDate(startOfMonth),
            preferences: {
                riskTolerance: 'medium',
                weekendBoost: false,
                examMode: false,
                maxSpendPerDay: null,
                vegetarian: formData.get('quickVeg') === 'true',
                notificationThresholds: {
                    warning: 0.7,
                    danger: 0.9
                }
            }
        };

        // Save last active
        this.profile.lastActive = new Date().toISOString();

        this.save();
        this.render();
        this.switchTab('expense');
        showToast(`Hello, ${this.profile.userName}! Add your first expense.`, 'success');
    }

    handleSimulation(amount) {
        if (!this.profile || !this.derived) return;

        const result = simulateSpend(this.profile, this.expenses, this.derived, amount);

        document.getElementById('simAmount').textContent = `₹${amount}`;
        document.getElementById('simExhaustion').textContent = `Exhaustion shifts to ${result.exhaustionDate}`;

        const riskLabels = { safe: '✅ Safe', watch: '⚠️ Watch', danger: '🚨 Danger' };
        document.getElementById('simRiskLevel').textContent = riskLabels[result.risk];
        document.getElementById('simRiskLevel').className = `sim-risk-${result.risk}`;

        document.getElementById('simulatorResult').classList.remove('hidden');
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
            tab.setAttribute('aria-selected', tab.dataset.tab === tabName);
        });

        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}Panel`);
        });
    }

    showMainApp() {
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        document.getElementById('forms').classList.remove('hidden');
        document.getElementById('history').classList.remove('hidden');

        // Update last active timestamp
        if (this.profile) {
            this.profile.lastActive = new Date().toISOString();
            this.save();
        }
    }

    handleSetupSubmit(form) {
        const formData = new FormData(form);

        // Validate
        const errors = this.validateSetupForm(formData);
        if (Object.keys(errors).length > 0) {
            this.showFormErrors(errors);
            return;
        }

        // Clear any previous errors
        this.clearFormErrors();

        // Create or update profile
        this.profile = {
            userType: formData.get('userType'),
            monthlyCredits: parseFloat(formData.get('monthlyCredits')),
            monthDays: parseInt(formData.get('monthDays')),
            startDate: formData.get('startDate'),
            preferences: this.profile?.preferences || createDefaultProfile().preferences
        };

        // Update vegetarian preference
        this.profile.preferences.vegetarian = formData.get('vegetarian') === 'true';

        this.save();
        this.render();
        this.switchTab('expense');
        showToast('Profile saved successfully!', 'success');
    }

    validateSetupForm(formData) {
        const errors = {};

        const credits = parseFloat(formData.get('monthlyCredits'));
        if (isNaN(credits) || credits < 3000 || credits > 10000) {
            errors.monthlyCredits = 'Credits must be between ₹3,000 and ₹10,000';
        }

        const days = parseInt(formData.get('monthDays'));
        if (isNaN(days) || days < 28 || days > 31) {
            errors.monthDays = 'Days must be between 28 and 31';
        }

        const startDate = formData.get('startDate');
        if (!startDate) {
            errors.startDate = 'Start date is required';
        }

        return errors;
    }

    handleExpenseSubmit(form) {
        if (!this.profile) {
            showToast('Please set up your profile first.', 'warning');
            this.switchTab('setup');
            return;
        }

        const formData = new FormData(form);

        // Validate
        const errors = this.validateExpenseForm(formData);
        if (Object.keys(errors).length > 0) {
            this.showFormErrors(errors);
            return;
        }

        this.clearFormErrors();

        // Create expense
        const expense = createExpenseEntry({
            date: formData.get('date'),
            mealType: formData.get('mealType'),
            itemType: formData.get('itemType'),
            quantity: formData.get('quantity'),
            cost: formData.get('cost'),
            notes: formData.get('notes')
        });

        this.expenses.push(expense);
        this.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        this.save();
        this.render();

        // Reset form except date
        form.reset();
        document.getElementById('expenseDate').value = formatDate(new Date());
        document.getElementById('mealType').value = 'lunch';

        showToast('Expense added!', 'success');
    }

    validateExpenseForm(formData) {
        const errors = {};

        const date = formData.get('date');
        if (!date) {
            errors.expenseDate = 'Date is required';
        } else {
            const expDate = new Date(date);
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (expDate > today) {
                errors.expenseDate = 'Date cannot be in the future';
            }

            if (this.profile) {
                const startDate = new Date(this.profile.startDate);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + this.profile.monthDays - 1);

                if (expDate < startDate || expDate > endDate) {
                    errors.expenseDate = 'Date must be within your billing month';
                }
            }
        }

        const cost = parseFloat(formData.get('cost'));
        if (isNaN(cost) || cost <= 0) {
            errors.cost = 'Cost must be greater than 0';
        } else if (cost > 2000) {
            errors.cost = 'Cost seems too high. Please verify.';
        }

        const quantity = parseInt(formData.get('quantity'));
        if (isNaN(quantity) || quantity < 1) {
            errors.quantity = 'Quantity must be at least 1';
        }

        return errors;
    }

    handlePreferencesSubmit(form) {
        if (!this.profile) {
            showToast('Please set up your profile first.', 'warning');
            this.switchTab('setup');
            return;
        }

        const formData = new FormData(form);

        this.profile.preferences = {
            ...this.profile.preferences,
            riskTolerance: formData.get('riskTolerance'),
            weekendBoost: formData.get('weekendBoost') === 'on',
            examMode: formData.get('examMode') === 'on',
            maxSpendPerDay: formData.get('maxSpendPerDay') ? parseFloat(formData.get('maxSpendPerDay')) : null,
            notificationThresholds: {
                warning: parseInt(formData.get('warningThreshold')) / 100,
                danger: parseInt(formData.get('dangerThreshold')) / 100
            }
        };

        this.save();
        this.render();
        showToast('Preferences saved!', 'success');
    }

    deleteExpense(id) {
        showConfirmModal(
            'Delete Expense',
            'Are you sure you want to delete this expense?',
            () => {
                this.expenses = this.expenses.filter(exp => exp.id !== id);
                this.save();
                this.render();
                showToast('Expense deleted.', 'success');
            }
        );
    }

    showFormErrors(errors) {
        Object.entries(errors).forEach(([field, message]) => {
            const errorEl = document.getElementById(`${field}Error`);
            const inputEl = document.getElementById(field);

            if (errorEl) {
                errorEl.textContent = message;
            }
            if (inputEl) {
                inputEl.classList.add('error');
                inputEl.focus();
            }
        });
    }

    clearFormErrors() {
        document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
        document.querySelectorAll('.form-input.error, .form-select.error').forEach(el => el.classList.remove('error'));
    }

    updateSafeLimitPreview() {
        if (!this.profile) return;

        const riskTolerance = document.getElementById('riskTolerance').value;
        const maxSpend = document.getElementById('maxSpendPerDay').value;
        const weekendBoost = document.getElementById('weekendBoost').checked;
        const examMode = document.getElementById('examMode').checked;

        // Temporarily update preferences and calculate
        const tempPrefs = {
            ...this.profile.preferences,
            riskTolerance,
            weekendBoost,
            examMode,
            maxSpendPerDay: maxSpend ? parseFloat(maxSpend) : null
        };

        const tempProfile = { ...this.profile, preferences: tempPrefs };
        const tempDerived = computeDerivedData(tempProfile, this.expenses);

        document.getElementById('safeLimitPreview').textContent = formatCurrency(tempDerived.dailySafeLimit);
    }

    save() {
        saveState({
            profile: this.profile,
            expenses: this.expenses
        });
    }

    render() {
        if (!this.profile) {
            // Show auth screen - signup view for new users
            document.getElementById('authScreen').classList.remove('hidden');
            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('signupView').classList.remove('hidden');
            document.getElementById('dashboardSection').classList.add('hidden');
            document.getElementById('forms').classList.add('hidden');
            document.getElementById('history').classList.add('hidden');
            return;
        }

        // Check if returning user (has profile but not in main app view)
        const authScreen = document.getElementById('authScreen');
        if (!authScreen.classList.contains('hidden')) {
            // Show login view for returning users
            document.getElementById('loginView').classList.remove('hidden');
            document.getElementById('signupView').classList.add('hidden');

            // Update last session info
            if (this.profile.lastActive) {
                const lastDate = new Date(this.profile.lastActive);
                const now = new Date();
                const diffMs = now - lastDate;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

                let activeText = 'Just now';
                if (diffDays > 0) activeText = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
                else if (diffHours > 0) activeText = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

                document.getElementById('lastActiveText').textContent = `Last active: ${activeText}`;
            }

            // Show remaining credits
            const tempDerived = computeDerivedData(this.profile, this.expenses);
            document.getElementById('lastCreditsText').textContent = `You had ${formatCurrency(tempDerived.remainingCredits)} remaining`;
        }

        // Show main app
        this.showMainApp();

        // Compute derived data
        this.derived = computeDerivedData(this.profile, this.expenses);

        // Update all UI components
        this.renderStatusStrip();
        this.renderMetrics();
        this.renderPredictions();
        this.renderSmartWidgets();
        this.renderAdvice();
        this.renderPersonalization();
        this.renderNewWidgets();
        this.renderHistory();
        this.populatePreferencesForm();

        // Update charts
        if (window.updateCharts) {
            window.updateCharts(this.profile, this.expenses, this.derived);
        }
    }

    renderNewWidgets() {
        // Calculate savings streak
        this.renderSavingsStreak();
        this.renderQuickStats();
        this.renderMealInsights();
        this.renderBudgetHealth();
    }

    renderBudgetHealth() {
        const healthFill = document.getElementById('healthFill');
        const healthLabel = document.getElementById('healthLabel');
        const healthScore = document.getElementById('healthScore');
        const healthTip = document.getElementById('healthTip');

        if (!healthFill || !this.derived) return;

        // Calculate health score based on multiple factors
        let score = 100;

        // Factor 1: How aligned is spending with time elapsed? (40 points)
        const expectedSpendPercent = (this.derived.daysElapsed / this.profile.monthDays) * 100;
        const actualSpendPercent = (this.derived.totalSpent / this.profile.monthlyCredits) * 100;
        const alignmentScore = Math.max(0, 40 - Math.abs(actualSpendPercent - expectedSpendPercent));
        score = alignmentScore;

        // Factor 2: Burn rate vs target (30 points)
        const burnRatio = this.derived.burnRateOverall / this.derived.dailySafeLimit;
        if (burnRatio <= 1) {
            score += 30;
        } else if (burnRatio <= 1.2) {
            score += 20;
        } else if (burnRatio <= 1.5) {
            score += 10;
        }

        // Factor 3: Risk level bonus (20 points)
        if (this.derived.riskLevel === 'safe') {
            score += 20;
        } else if (this.derived.riskLevel === 'watch') {
            score += 10;
        }

        // Factor 4: Consistency bonus - low variance (10 points)
        if (this.expenses.length >= 3) {
            const dailyTotals = {};
            this.expenses.forEach(exp => {
                dailyTotals[exp.date] = (dailyTotals[exp.date] || 0) + exp.cost;
            });
            const totals = Object.values(dailyTotals);
            if (totals.length >= 2) {
                const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
                const variance = totals.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / totals.length;
                const stdDev = Math.sqrt(variance);
                const cv = stdDev / avg; // Coefficient of variation
                if (cv < 0.3) score += 10;
                else if (cv < 0.5) score += 5;
            }
        }

        // Clamp score to 0-100
        score = Math.max(0, Math.min(100, Math.round(score)));

        // Update UI
        healthFill.style.width = `${score}%`;
        healthScore.textContent = `${score}/100`;

        // Determine status and color
        healthFill.classList.remove('excellent', 'good', 'warning', 'danger');
        healthLabel.classList.remove('excellent', 'warning', 'danger');

        if (score >= 80) {
            healthLabel.textContent = 'Excellent';
            healthLabel.classList.add('excellent');
            healthFill.classList.add('excellent');
            healthTip.textContent = '🎉 Your budget is healthy! Keep up the great work.';
        } else if (score >= 60) {
            healthLabel.textContent = 'Good';
            healthFill.classList.add('good');
            healthTip.textContent = '👍 You\'re on track. A little more discipline and you\'ll be excellent!';
        } else if (score >= 40) {
            healthLabel.textContent = 'Needs Attention';
            healthLabel.classList.add('warning');
            healthFill.classList.add('warning');
            healthTip.textContent = '⚠️ Watch your spending. Try to stay closer to your daily limit.';
        } else {
            healthLabel.textContent = 'Critical';
            healthLabel.classList.add('danger');
            healthFill.classList.add('danger');
            healthTip.textContent = '🚨 Your spending is high. Cut back immediately to avoid running out.';
        }
    }

    renderSavingsStreak() {
        const streakNumber = document.getElementById('streakNumber');
        const streakMessage = document.getElementById('streakMessage');
        const streakBadges = document.querySelectorAll('.streak-badge');

        // Calculate consecutive days under budget
        let streak = 0;
        const today = new Date();
        const startDate = new Date(this.profile.startDate);

        for (let i = this.derived.daysElapsed - 1; i >= 0; i--) {
            const checkDate = new Date(startDate);
            checkDate.setDate(startDate.getDate() + i);
            const dateStr = formatDate(checkDate);

            const dayExpenses = this.expenses.filter(e => e.date === dateStr);
            const dayTotal = dayExpenses.reduce((sum, e) => sum + e.cost, 0);

            if (dayTotal > 0 && dayTotal <= this.derived.dailySafeLimit) {
                streak++;
            } else if (dayTotal > this.derived.dailySafeLimit) {
                break;
            }
        }

        streakNumber.textContent = streak;

        // Update badges
        streakBadges.forEach(badge => {
            const requiredDays = parseInt(badge.dataset.days);
            badge.classList.toggle('earned', streak >= requiredDays);
        });

        // Update message
        if (streak === 0) {
            streakMessage.textContent = 'Start spending under your daily limit to build your streak!';
        } else if (streak < 3) {
            streakMessage.textContent = `Great start! Keep going for a 3-day streak! 🥉`;
        } else if (streak < 7) {
            streakMessage.textContent = `${streak} days strong! Week warrior badge at 7 days! 🥈`;
        } else if (streak < 14) {
            streakMessage.textContent = `Amazing ${streak}-day streak! Fortnight champion awaits! 🥇`;
        } else {
            streakMessage.textContent = `Incredible ${streak}-day streak! You're a savings master! 🏆`;
        }
    }

    renderWeeklySavings() {
        const monthlySavingsEl = document.getElementById('weeklySavings');
        if (!monthlySavingsEl) return;

        const savingsComparison = document.getElementById('savingsComparison');
        const savingsFill = document.getElementById('savingsFill');
        const savingsTip = document.getElementById('savingsTip');

        // Calculate month savings (difference between ideal budget and actual spend)
        const idealSpend = this.derived.dailySafeLimit * this.derived.daysElapsed;
        const actualSpend = this.derived.totalSpent;
        const saved = Math.max(0, idealSpend - actualSpend);

        monthlySavingsEl.textContent = formatCurrency(saved);

        // Calculate fill percentage (saved vs ideal)
        const fillPercent = idealSpend > 0 ? Math.min(100, (saved / idealSpend) * 100) : 0;
        savingsFill.style.width = `${fillPercent}%`;

        // Update comparison text and tip
        if (saved > 0) {
            savingsComparison.textContent = `${Math.round(fillPercent)}% of budget saved`;
            if (this.derived.surplusOrDeficit > 500) {
                savingsTip.textContent = '🎉 Amazing savings this month!';
            } else if (this.derived.surplusOrDeficit > 0) {
                savingsTip.textContent = '👍 Good progress! On track to finish with surplus.';
            } else {
                savingsTip.textContent = 'Keep it up! Every rupee saved counts.';
            }
        } else {
            savingsComparison.textContent = 'Over budget so far';
            if (this.derived.surplusOrDeficit < -200) {
                savingsTip.textContent = '⚠️ Consider reducing daily spend to avoid running out.';
            } else {
                savingsTip.textContent = 'Try smaller portions or veg options tomorrow.';
            }
        }
    }

    renderQuickStats() {
        const avgPerMeal = document.getElementById('avgPerMeal');
        const mostExpensiveDay = document.getElementById('mostExpensiveDay');
        const cheapestDay = document.getElementById('cheapestDay');

        // Calculate average per meal
        if (this.expenses.length > 0) {
            const avg = this.derived.totalSpent / this.expenses.length;
            avgPerMeal.textContent = formatCurrency(avg);
        } else {
            avgPerMeal.textContent = '₹0';
        }

        // Calculate most/cheapest days
        const dayTotals = {};
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        this.expenses.forEach(exp => {
            const date = new Date(exp.date);
            const dayName = dayNames[date.getDay()];
            dayTotals[dayName] = (dayTotals[dayName] || 0) + exp.cost;
        });

        if (Object.keys(dayTotals).length > 0) {
            const sortedDays = Object.entries(dayTotals).sort((a, b) => b[1] - a[1]);
            mostExpensiveDay.textContent = sortedDays[0][0];
            cheapestDay.textContent = sortedDays[sortedDays.length - 1][0];
        } else {
            mostExpensiveDay.textContent = '--';
            cheapestDay.textContent = '--';
        }
    }

    renderMealInsights() {
        const topMealType = document.getElementById('topMealType');
        const mealsThisWeek = document.getElementById('mealsThisWeek');
        const favoriteItem = document.getElementById('favoriteItem');

        // Count meal types
        const mealCounts = {};
        const itemCounts = {};

        const today = new Date();
        let weekMeals = 0;

        this.expenses.forEach(exp => {
            // Count all meal types
            mealCounts[exp.mealType] = (mealCounts[exp.mealType] || 0) + 1;
            itemCounts[exp.itemType] = (itemCounts[exp.itemType] || 0) + 1;

            // Count this week's meals
            const expDate = new Date(exp.date);
            const daysDiff = Math.floor((today - expDate) / (1000 * 60 * 60 * 24));
            if (daysDiff < 7) {
                weekMeals++;
            }
        });

        // Find top meal type
        const mealLabels = {
            breakfast: 'Breakfast',
            lunch: 'Lunch',
            snacks: 'Snacks',
            dinner: 'Dinner',
            other: 'Other'
        };

        const itemLabels = {
            veg: 'Veg',
            paneer: 'Paneer',
            chicken: 'Chicken',
            dessert: 'Dessert',
            beverage: 'Beverage',
            other: 'Other'
        };

        if (Object.keys(mealCounts).length > 0) {
            const topMeal = Object.entries(mealCounts).sort((a, b) => b[1] - a[1])[0];
            topMealType.textContent = mealLabels[topMeal[0]] || topMeal[0];
        } else {
            topMealType.textContent = '--';
        }

        mealsThisWeek.textContent = weekMeals;

        if (Object.keys(itemCounts).length > 0) {
            const topItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0];
            favoriteItem.textContent = itemLabels[topItem[0]] || topItem[0];
        } else {
            favoriteItem.textContent = '--';
        }
    }

    renderSmartWidgets() {
        // Today's Context
        const contextCard = document.getElementById('contextCard');
        const contextInsights = document.getElementById('contextInsights');
        const insights = computeTodayContext(this.profile, this.expenses, this.derived);

        if (insights.length > 0) {
            contextCard.classList.remove('hidden');
            contextInsights.innerHTML = insights.map(i => `
                <li class="context-item ${i.type}">
                    <span class="context-icon">${i.icon}</span>
                    <span class="context-text">${i.text}</span>
                </li>
            `).join('');
        } else {
            contextCard.classList.add('hidden');
        }

        // Delta Strip (What changed since yesterday)
        const deltaStrip = document.getElementById('deltaStrip');
        const deltaItems = document.getElementById('deltaItems');
        const deltas = computeYesterdayDelta(this.profile, this.expenses, this.derived);

        if (deltas.length > 0) {
            deltaStrip.classList.remove('hidden');
            deltaItems.innerHTML = deltas.map(d => `
                <span class="delta-item ${d.type}">
                    <span class="delta-arrow">${d.icon}</span>
                    <span class="delta-text">${d.text}</span>
                </span>
            `).join('');
        } else {
            deltaStrip.classList.add('hidden');
        }

        // 3-Day Forecast
        const forecasts = computeForecast(this.profile, this.expenses, this.derived);
        forecasts.forEach((f, i) => {
            document.getElementById(`forecast${i + 1}`).textContent = `₹${f.safeSpend} safe`;
            const riskEl = document.getElementById(`forecastRisk${i + 1}`);
            riskEl.textContent = f.riskLabel;
            riskEl.className = `forecast-risk ${f.risk}`;
        });
    }

    renderPersonalization() {
        // Spending Personality
        const personalityCard = document.getElementById('personalityCard');
        const personality = calculatePersonality(this.profile, this.expenses, this.derived);

        if (personality) {
            personalityCard.classList.remove('hidden');
            document.getElementById('personalityIcon').textContent = personality.icon;
            document.getElementById('personalityLabel').textContent = personality.label;
            document.getElementById('personalityDesc').textContent = personality.desc;
        } else {
            personalityCard.classList.add('hidden');
        }

        // Personal Rules
        const rulesCard = document.getElementById('rulesCard');
        const rulesList = document.getElementById('rulesList');
        const rules = generatePersonalRules(this.profile, this.expenses, this.derived);

        if (rules.length > 0) {
            rulesCard.classList.remove('hidden');
            rulesList.innerHTML = rules.map(r => `
                <li class="rule-item">• ${r}</li>
            `).join('');
        } else {
            rulesCard.classList.add('hidden');
        }

        // Month Narrative
        const narrativeCard = document.getElementById('narrativeCard');
        const narrativeBody = document.getElementById('narrativeBody');
        const narrative = generateMonthNarrative(this.profile, this.expenses, this.derived);

        if (narrativeCard) {
            if (narrative) {
                narrativeCard.classList.remove('hidden');
                narrativeBody.innerHTML = `<p class="narrative-text">${narrative}</p>`;
            } else {
                narrativeCard.classList.add('hidden');
            }
        }
    }

    renderStatusStrip() {
        document.getElementById('totalCredits').textContent = formatCurrency(this.profile.monthlyCredits);
        document.getElementById('spentCredits').textContent = formatCurrency(this.derived.totalSpent);
        document.getElementById('remainingCredits').textContent = formatCurrency(this.derived.remainingCredits);

        // Update risk badge
        const badge = document.getElementById('riskBadge');
        const riskLabels = {
            safe: 'Safe',
            watch: 'Watch',
            danger: 'Danger'
        };

        badge.className = `risk-badge badge-${this.derived.riskLevel}`;
        badge.querySelector('.risk-text').textContent = riskLabels[this.derived.riskLevel];
    }

    renderMetrics() {
        // Today's spend
        document.getElementById('todaySpend').textContent = formatCurrency(this.derived.todaySpend);
        document.getElementById('dailySafeLimit').textContent = formatCurrency(this.derived.dailySafeLimit);

        // Today's progress
        const todayPercent = this.derived.dailySafeLimit > 0
            ? Math.min(100, (this.derived.todaySpend / this.derived.dailySafeLimit) * 100)
            : 0;
        const progressFill = document.getElementById('todayProgressFill');
        progressFill.style.width = `${todayPercent}%`;
        progressFill.className = 'progress-fill ' + (
            todayPercent > 100 ? 'danger' : todayPercent > 80 ? 'risk' : 'safe'
        );

        // Today hint
        const todayHint = document.getElementById('todayHint');
        if (this.derived.todaySpend === 0) {
            todayHint.textContent = 'No expenses today yet';
        } else if (this.derived.todaySpend > this.derived.dailySafeLimit) {
            todayHint.textContent = `Over limit by ${formatCurrency(this.derived.todaySpend - this.derived.dailySafeLimit)}`;
        } else {
            todayHint.textContent = `${formatCurrency(this.derived.dailySafeLimit - this.derived.todaySpend)} remaining for today`;
        }

        // Burn rates
        document.getElementById('currentBurnRate').textContent = `${formatCurrency(this.derived.burnRateOverall)}/day`;
        document.getElementById('targetBurnRate').textContent = `${formatCurrency(this.derived.targetBurnRate)}/day`;
        document.getElementById('burnRate7d').textContent = `${formatCurrency(this.derived.burnRate7d)}/day`;

        // Month progress
        document.getElementById('daysInfo').textContent = `Day ${this.derived.daysElapsed} of ${this.profile.monthDays}`;
        document.getElementById('creditsUsedPercent').textContent = `${Math.round(this.derived.creditsUsedRatio * 100)}% used`;
        document.getElementById('timeProgress').style.width = `${this.derived.timeElapsedRatio * 100}%`;

        const creditsProgress = document.getElementById('creditsProgress');
        creditsProgress.style.width = `${this.derived.creditsUsedRatio * 100}%`;
        creditsProgress.classList.toggle('danger', this.derived.creditsUsedRatio > this.derived.timeElapsedRatio + 0.1);
    }

    renderPredictions() {
        const exhaustionCard = document.getElementById('exhaustionCard');
        const predictionMain = exhaustionCard.querySelector('.prediction-main');

        if (this.derived.predictedExhaustionDate) {
            const exhaustDate = new Date(this.derived.predictedExhaustionDate);
            const day = exhaustDate.getDate();
            const month = exhaustDate.toLocaleDateString('en-IN', { month: 'short' });

            predictionMain.innerHTML = `
                <span class="prediction-date">${month} ${day}</span>
                <span class="prediction-label">Predicted exhaustion date</span>
            `;

            // Compare with month end
            const endDate = new Date(this.derived.endDate);
            const surplusDeficit = document.getElementById('surplusDeficit');

            if (exhaustDate > endDate) {
                surplusDeficit.innerHTML = `
                    <span class="detail-icon">💰</span>
                    <span class="detail-text">Projected surplus: ~${formatCurrency(Math.abs(this.derived.surplusOrDeficit))}</span>
                `;
                surplusDeficit.style.background = 'var(--safe-surface)';
            } else {
                const daysShort = Math.ceil((endDate - exhaustDate) / (1000 * 60 * 60 * 24));
                surplusDeficit.innerHTML = `
                    <span class="detail-icon">⚠️</span>
                    <span class="detail-text">Credits may run out ${daysShort} day(s) early</span>
                `;
                surplusDeficit.style.background = 'var(--danger-surface)';
            }
        } else {
            predictionMain.innerHTML = `
                <span class="prediction-date">∞</span>
                <span class="prediction-label">No exhaustion predicted</span>
            `;
            document.getElementById('surplusDeficit').innerHTML = `
                <span class="detail-icon">✨</span>
                <span class="detail-text">Looking good!</span>
            `;
        }

        // Visual Confidence Meter
        const confidencePercent = getConfidencePercent(this.expenses.length, this.derived.daysElapsed);
        const confidenceFill = document.getElementById('confidenceFill');
        const confidencePercentEl = document.getElementById('confidencePercent');
        const confidenceReason = document.getElementById('confidenceReason');

        confidenceFill.style.width = `${confidencePercent}%`;
        confidencePercentEl.textContent = `${confidencePercent}%`;

        // Set color based on confidence
        if (confidencePercent >= 70) {
            confidenceFill.style.background = 'var(--safe)';
        } else if (confidencePercent >= 40) {
            confidenceFill.style.background = 'var(--primary-yellow)';
        } else {
            confidenceFill.style.background = 'var(--primary-red)';
        }

        // Confidence reason text
        if (confidencePercent < 30) {
            confidenceReason.textContent = `Only ${this.expenses.length} expenses and ${this.derived.daysElapsed} days of data`;
        } else if (confidencePercent < 60) {
            confidenceReason.textContent = 'Add more expenses for better predictions';
        } else {
            confidenceReason.textContent = 'Based on solid spending history';
        }
    }

    renderAdvice() {
        const container = document.getElementById('adviceContainer');
        const advice = generateAdvice(this.profile, this.derived, this.expenses);

        if (advice.length === 0) {
            container.innerHTML = `
                <div class="advice-empty glass-card" id="adviceEmpty">
                    <span class="advice-empty-icon">💡</span>
                    <p>Add some expenses to get personalized recommendations.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = advice.map(item => `
            <div class="advice-card glass-card ${item.severity}">
                <div class="advice-header">
                    <span class="advice-title">${item.title}</span>
                    <span class="advice-severity ${item.severity}">${item.severity === 'high' ? 'Immediate' :
                item.severity === 'medium' ? 'Recommended' : 'Tip'
            }</span>
                </div>
                <p class="advice-message">${item.message}</p>
            </div>
        `).join('');
    }

    renderHistory() {
        const list = document.getElementById('expensesList');
        const countEl = document.getElementById('expenseCount');

        countEl.textContent = `${this.expenses.length} entries`;

        if (this.expenses.length === 0) {
            list.innerHTML = `
                <div class="expenses-empty" id="expensesEmpty">
                    <span class="empty-icon">📝</span>
                    <p>No expenses recorded yet. Add your first expense to start tracking!</p>
                </div>
            `;
            return;
        }

        // Show last 10 expenses
        const recentExpenses = this.expenses.slice(0, 10);

        list.innerHTML = recentExpenses.map(exp => {
            const date = new Date(exp.date);
            const day = date.getDate();
            const month = date.toLocaleDateString('en-IN', { month: 'short' });

            const categoryLabels = {
                veg: '🥗 Veg',
                paneer: '🧀 Paneer',
                chicken: '🍗 Chicken',
                dessert: '🍰 Dessert',
                beverage: '☕ Beverage',
                other: '🍽️ Other'
            };

            const mealLabels = {
                breakfast: 'Breakfast',
                lunch: 'Lunch',
                snacks: 'Snacks',
                dinner: 'Dinner',
                other: 'Other'
            };

            return `
                <div class="expense-card">
                    <div class="expense-date">
                        <span class="expense-date-day">${day}</span>
                        <span class="expense-date-month">${month}</span>
                    </div>
                    <div class="expense-divider"></div>
                    <div class="expense-details">
                        <div class="expense-item-name">${categoryLabels[exp.itemType] || exp.itemType}${exp.notes ? ` - ${exp.notes}` : ''}</div>
                        <div class="expense-meta">
                            <span>${mealLabels[exp.mealType] || exp.mealType}</span>
                            <span>×${exp.quantity}</span>
                        </div>
                    </div>
                    <div class="expense-cost">${formatCurrency(exp.cost)}</div>
                    <div class="expense-actions">
                        <button class="expense-action-btn delete" onclick="app.deleteExpense('${exp.id}')" title="Delete">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    populatePreferencesForm() {
        if (!this.profile) return;

        const prefs = this.profile.preferences;

        document.getElementById('riskTolerance').value = prefs.riskTolerance;
        document.getElementById('maxSpendPerDay').value = prefs.maxSpendPerDay || '';
        document.getElementById('weekendBoost').checked = prefs.weekendBoost;
        document.getElementById('examMode').checked = prefs.examMode;
        document.getElementById('warningThreshold').value = Math.round(prefs.notificationThresholds.warning * 100);
        document.getElementById('dangerThreshold').value = Math.round(prefs.notificationThresholds.danger * 100);

        this.updateSafeLimitPreview();
    }
}

// ==========================================
// INITIALIZE APP
// ==========================================

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new UnmessifyApp();
});
