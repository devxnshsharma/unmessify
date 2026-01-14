# 🎓 UNMESSIFY

> Smart Paid Mess Credits Planner & Decision Support System

UNMESSIFY is a web-based decision support application that helps students optimize their paid mess credit usage through data-driven insights, predictive analytics, and actionable recommendations.

![Status](https://img.shields.io/badge/Status-Active-success)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 🎯 Problem Statement

Students on paid mess plans receive ~₹6,000–₹6,500 credits monthly. Without proper tracking:
- Credits often run out before month-end
- Students must pay real money for remaining days
- Longer queues and reduced food availability

**UNMESSIFY solves this** by converting raw spending data into predictive insights and actionable recommendations.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Adaptive Daily Safe Limit** | Dynamic calculation based on remaining credits, burn rate, and risk tolerance |
| **Multi-Window Burn Rate** | Overall, 7-day, and 3-day burn rate analysis |
| **Predictive Engine** | Credit exhaustion date prediction with confidence levels |
| **Rule-Based Advice** | 9 transparent, explainable recommendation rules |
| **Visual Analytics** | Interactive Chart.js visualizations |
| **Risk Indicators** | Color-coded status (Safe/Watch/Danger) |
| **LocalStorage Persistence** | Data persists across sessions |
| **Export/Import** | Backup and restore your data as JSON |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UNMESSIFY                             │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (index.html + styles.css)                         │
│  ├── Header with Status Strip                               │
│  ├── Dashboard (3-column layout)                            │
│  ├── Tabbed Forms (Setup, Expense, Preferences)             │
│  └── History Section                                        │
├─────────────────────────────────────────────────────────────┤
│  Logic Layer (app.js)                                        │
│  ├── Data Models (UserProfile, ExpenseEntry, DerivedData)   │
│  ├── Calculation Engine (Burn Rate, Safe Limit, Predictions)│
│  └── Advice Engine (9 Rule-Based Recommendations)           │
├─────────────────────────────────────────────────────────────┤
│  Visualization Layer (charts.js)                             │
│  ├── Daily Spending Trend (Line Chart)                      │
│  ├── Category Breakdown (Donut Chart)                       │
│  └── Credit Depletion (Area Chart)                          │
├─────────────────────────────────────────────────────────────┤
│  Storage Layer (LocalStorage)                                │
│  └── unmessify_state_v1                                     │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Data Models

### UserProfile
```javascript
{
  userType: "hostel_student" | "day_scholar",
  monthlyCredits: number,        // e.g., 6000
  monthDays: number,             // e.g., 30
  startDate: "YYYY-MM-DD",
  preferences: {
    riskTolerance: "low" | "medium" | "high",
    weekendBoost: boolean,
    examMode: boolean,
    maxSpendPerDay: number | null,
    vegetarian: boolean,
    notificationThresholds: { warning: 0.7, danger: 0.9 }
  }
}
```

### ExpenseEntry
```javascript
{
  id: string,                    // UUID
  date: "YYYY-MM-DD",
  mealType: "breakfast" | "lunch" | "snacks" | "dinner" | "other",
  itemType: "chicken" | "paneer" | "veg" | "dessert" | "beverage" | "other",
  quantity: number,
  cost: number,
  notes: string | null
}
```

## 🧮 Core Calculations

### Daily Safe Limit
```
base = remainingCredits / remainingDays
adjusted = base / √(overshootRatio)    // if spending > ideal
final = adjusted × toleranceFactor × modeBoosts
```

### Burn Rate Analysis
- **Overall**: totalSpent / daysElapsed
- **7-Day**: Last 7 days average (primary for predictions)
- **3-Day**: Recent trend detection

### Risk Level Determination
- **Safe**: Credits usage ≤ time elapsed + 5%
- **Watch**: Usage 5-15% ahead of schedule
- **Danger**: Usage >15% ahead OR exhaustion before month-end

## 📋 Forms & Validation

| Form | Fields | Validation |
|------|--------|------------|
| Credit Setup | Monthly credits, days, start date, user type | Credits: ₹3,000-₹10,000; Days: 28-31 |
| Expense Entry | Date, meal, item type, quantity, cost | Date within month, not future; Cost: ₹1-₹2,000 |
| Preferences | Risk tolerance, daily cap, modes, thresholds | Logical bounds, live preview |

## 🚀 Quick Start

1. **Clone or download** this repository
2. **Open `index.html`** in any modern browser
3. **Set up your profile** with monthly credits and start date
4. **Add expenses** as you make purchases
5. **Monitor dashboard** for insights and recommendations

No build process or server required!

## 🌐 Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 📦 Dependencies

- [Chart.js](https://www.chartjs.org/) v4.x (loaded via CDN)
- [Inter Font](https://fonts.google.com/specimen/Inter) (Google Fonts)
- [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (Google Fonts)

## 🔮 Future Scope

- [ ] Mess menu API integration
- [ ] Browser push notifications for risk changes
- [ ] Nutrition tracking and analysis
- [ ] ML-based anomaly detection
- [ ] Mobile app (React Native / Flutter)
- [ ] Multi-month trend analysis

## 📄 License

MIT License - feel free to use and modify for your needs.

---

<p align="center">
  Made with ❤️ for mess-going students everywhere
</p>
