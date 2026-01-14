/* ========================================
   UNMESSIFY - Charts & Visualization
   Bauhaus Design System Edition
   ======================================== */

// Chart instances (for updating without recreating)
let dailySpendChart = null;
let categoryChart = null;
let depletionChart = null;

// Chart.js default configuration - Bauhaus Style
Chart.defaults.color = '#121212';
Chart.defaults.borderColor = '#121212';
Chart.defaults.font.family = "'Outfit', sans-serif";
Chart.defaults.font.weight = 500;

// Bauhaus Color Palette
const chartColors = {
    primary: '#1040C0',      // Bauhaus Blue
    primaryLight: '#3060E0',
    safe: '#10b981',         // Keep semantic green
    safeLight: '#34d399',
    risk: '#F0C020',         // Bauhaus Yellow
    riskLight: '#F5D050',
    danger: '#D02020',       // Bauhaus Red
    dangerLight: '#E04040',
    // Category colors using Bauhaus palette
    categories: {
        veg: '#10b981',      // Green for veg
        paneer: '#F0C020',   // Bauhaus Yellow
        chicken: '#D02020',  // Bauhaus Red
        dessert: '#1040C0',  // Bauhaus Blue
        beverage: '#8B4513', // Brown for beverages
        other: '#121212'     // Black
    }
};

/**
 * Initialize or update all charts
 */
function updateCharts(profile, expenses, derived) {
    if (!profile || !derived) return;

    updateDailySpendChart(profile, expenses, derived);
    updateCategoryChart(expenses);
    updateDepletionChart(profile, expenses, derived);
}

// Make it globally accessible
window.updateCharts = updateCharts;

/**
 * Daily Spending Line Chart
 */
function updateDailySpendChart(profile, expenses, derived) {
    const ctx = document.getElementById('dailySpendChart');
    const emptyState = document.getElementById('dailyChartEmpty');

    if (!ctx) return;

    // Prepare data: spending per day
    const startDate = new Date(profile.startDate);
    const daysData = [];
    const labels = [];
    const safeLimitLine = [];

    for (let i = 0; i < profile.monthDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = formatDateForChart(currentDate);

        labels.push(i + 1); // Day number

        // Sum expenses for this day
        const dayExpenses = expenses.filter(exp => exp.date === formatDateISO(currentDate));
        const dayTotal = dayExpenses.reduce((sum, exp) => sum + exp.cost, 0);

        // Only show data for days that have passed or today
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (currentDate <= today) {
            daysData.push(dayTotal);
        } else {
            daysData.push(null);
        }

        safeLimitLine.push(derived.dailySafeLimit);
    }

    // Check if we have any data
    const hasData = daysData.some(d => d !== null && d > 0);

    if (!hasData) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (dailySpendChart) {
            dailySpendChart.destroy();
            dailySpendChart = null;
        }
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    const data = {
        labels: labels,
        datasets: [
            {
                label: 'Daily Spend',
                data: daysData,
                borderColor: chartColors.primary,
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: (context) => {
                    const value = context.raw;
                    if (value === null) return 'transparent';
                    if (value > derived.dailySafeLimit) return chartColors.danger;
                    if (value > derived.dailySafeLimit * 0.8) return chartColors.risk;
                    return chartColors.safe;
                },
                pointBorderColor: 'transparent',
                spanGaps: false
            },
            {
                label: 'Safe Limit',
                data: safeLimitLine,
                borderColor: chartColors.safe,
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    boxWidth: 12,
                    padding: 15,
                    usePointStyle: true
                }
            },
            tooltip: {
                backgroundColor: '#FFFFFF',
                titleColor: '#121212',
                bodyColor: '#121212',
                borderColor: '#121212',
                borderWidth: 2,
                padding: 12,
                displayColors: true,
                callbacks: {
                    title: (items) => `Day ${items[0].label}`,
                    label: (context) => {
                        const value = context.raw;
                        if (value === null) return '';
                        if (context.datasetIndex === 0) {
                            const status = value > derived.dailySafeLimit ? '⚠️ Over limit' :
                                value > derived.dailySafeLimit * 0.8 ? '⚡ Near limit' : '✅ Under limit';
                            return [`₹${Math.round(value)}`, status];
                        }
                        return `Safe: ₹${Math.round(value)}`;
                    }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Day of Month',
                    color: '#64748b'
                },
                grid: {
                    display: false
                }
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Amount (₹)',
                    color: '#64748b'
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                },
                ticks: {
                    callback: (value) => `₹${value}`
                }
            }
        }
    };

    if (dailySpendChart) {
        dailySpendChart.data = data;
        dailySpendChart.options = options;
        dailySpendChart.update('none');
    } else {
        dailySpendChart = new Chart(ctx, {
            type: 'line',
            data: data,
            options: options
        });
    }
}

/**
 * Category Breakdown Donut Chart
 */
function updateCategoryChart(expenses) {
    const ctx = document.getElementById('categoryChart');
    const emptyState = document.getElementById('categoryChartEmpty');

    if (!ctx) return;

    // Aggregate by category
    const categoryTotals = {};
    const categoryCounts = {};

    expenses.forEach(exp => {
        const cat = exp.itemType;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + exp.cost;
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Check if we have data
    if (Object.keys(categoryTotals).length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (categoryChart) {
            categoryChart.destroy();
            categoryChart = null;
        }
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    const categoryLabels = {
        veg: '🥗 Veg',
        paneer: '🧀 Paneer',
        chicken: '🍗 Chicken',
        dessert: '🍰 Dessert',
        beverage: '☕ Beverage',
        other: '🍽️ Other'
    };

    const sortedCategories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([cat]) => cat);

    const data = {
        labels: sortedCategories.map(cat => categoryLabels[cat] || cat),
        datasets: [{
            data: sortedCategories.map(cat => categoryTotals[cat]),
            backgroundColor: sortedCategories.map(cat => chartColors.categories[cat] || chartColors.categories.other),
            borderColor: 'rgba(15, 15, 26, 0.5)',
            borderWidth: 2,
            hoverOffset: 8
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
            legend: {
                display: true,
                position: 'right',
                labels: {
                    boxWidth: 12,
                    padding: 10,
                    usePointStyle: true,
                    generateLabels: (chart) => {
                        const data = chart.data;
                        const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                        return data.labels.map((label, i) => {
                            const value = data.datasets[0].data[i];
                            const percent = Math.round((value / total) * 100);
                            return {
                                text: `${label} (${percent}%)`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                strokeStyle: 'transparent',
                                hidden: false,
                                index: i
                            };
                        });
                    }
                }
            },
            tooltip: {
                backgroundColor: '#FFFFFF',
                titleColor: '#121212',
                bodyColor: '#121212',
                borderColor: '#121212',
                borderWidth: 2,
                padding: 12,
                callbacks: {
                    label: (context) => {
                        const cat = sortedCategories[context.dataIndex];
                        const count = categoryCounts[cat];
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percent = Math.round((context.raw / total) * 100);
                        return [
                            `₹${Math.round(context.raw)} (${percent}%)`,
                            `${count} items`
                        ];
                    }
                }
            }
        }
    };

    if (categoryChart) {
        categoryChart.data = data;
        categoryChart.options = options;
        categoryChart.update('none');
    } else {
        categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: data,
            options: options
        });
    }
}

/**
 * Credit Depletion Chart
 */
function updateDepletionChart(profile, expenses, derived) {
    const ctx = document.getElementById('depletionChart');

    if (!ctx) return;

    const startDate = new Date(profile.startDate);
    const labels = [];
    const actualRemaining = [];
    const idealRemaining = [];

    // Calculate ideal depletion line (straight from full to 0)
    const dailyIdealDecrease = profile.monthlyCredits / profile.monthDays;

    let cumulativeSpend = 0;

    for (let i = 0; i < profile.monthDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        labels.push(i + 1);

        // Ideal remaining (straight line)
        idealRemaining.push(profile.monthlyCredits - (dailyIdealDecrease * (i + 1)));

        // Actual remaining (cumulative)
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (currentDate <= today) {
            const dayExpenses = expenses.filter(exp => exp.date === formatDateISO(currentDate));
            const dayTotal = dayExpenses.reduce((sum, exp) => sum + exp.cost, 0);
            cumulativeSpend += dayTotal;
            actualRemaining.push(profile.monthlyCredits - cumulativeSpend);
        } else {
            actualRemaining.push(null);
        }
    }

    // Determine area colors based on position relative to ideal
    const pointColors = actualRemaining.map((actual, i) => {
        if (actual === null) return 'transparent';
        const ideal = idealRemaining[i];
        if (actual >= ideal) return chartColors.safe;
        if (actual >= ideal * 0.9) return chartColors.risk;
        return chartColors.danger;
    });

    const data = {
        labels: labels,
        datasets: [
            {
                label: 'Actual Remaining',
                data: actualRemaining,
                borderColor: chartColors.primary,
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const { ctx: chartCtx, chartArea } = chart;

                    if (!chartArea) return 'rgba(99, 102, 241, 0.1)';

                    const gradient = chartCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.0)');
                    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.2)');
                    return gradient;
                },
                fill: true,
                tension: 0.2,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: pointColors,
                pointBorderColor: 'transparent',
                spanGaps: false
            },
            {
                label: 'Ideal Pace',
                data: idealRemaining,
                borderColor: chartColors.safe,
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    boxWidth: 12,
                    padding: 15,
                    usePointStyle: true
                }
            },
            tooltip: {
                backgroundColor: '#FFFFFF',
                titleColor: '#121212',
                bodyColor: '#121212',
                borderColor: '#121212',
                borderWidth: 2,
                padding: 12,
                callbacks: {
                    title: (items) => `Day ${items[0].label}`,
                    label: (context) => {
                        const value = context.raw;
                        if (value === null) return '';

                        if (context.datasetIndex === 0) {
                            const ideal = idealRemaining[context.dataIndex];
                            const diff = value - ideal;
                            const status = diff >= 0 ? '✅ Ahead of pace' :
                                diff > -200 ? '⚡ Slightly behind' : '⚠️ Behind pace';
                            return [`Remaining: ₹${Math.round(value)}`, status];
                        }
                        return `Ideal: ₹${Math.round(value)}`;
                    }
                }
            },
            annotation: derived.predictedExhaustionDate && derived.daysUntilExhaustion < profile.monthDays ? {
                annotations: {
                    exhaustionLine: {
                        type: 'line',
                        xMin: derived.daysUntilExhaustion + derived.daysElapsed,
                        xMax: derived.daysUntilExhaustion + derived.daysElapsed,
                        borderColor: chartColors.danger,
                        borderWidth: 2,
                        borderDash: [3, 3],
                        label: {
                            display: true,
                            content: 'Predicted Exhaustion',
                            position: 'start',
                            backgroundColor: chartColors.danger,
                            color: '#fff',
                            font: { size: 10 }
                        }
                    }
                }
            } : {}
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Day of Month',
                    color: '#64748b'
                },
                grid: {
                    display: false
                }
            },
            y: {
                beginAtZero: true,
                max: profile.monthlyCredits,
                title: {
                    display: true,
                    text: 'Credits (₹)',
                    color: '#64748b'
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                },
                ticks: {
                    callback: (value) => `₹${value.toLocaleString()}`
                }
            }
        }
    };

    if (depletionChart) {
        depletionChart.data = data;
        depletionChart.options = options;
        depletionChart.update('none');
    } else {
        depletionChart = new Chart(ctx, {
            type: 'line',
            data: data,
            options: options
        });
    }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatDateForChart(date) {
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function formatDateISO(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
