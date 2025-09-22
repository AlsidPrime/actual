Project Agents: Predictive Calendar Feature
This document describes the new agents being added to the Actual Budget application to provide an optional cash flow forecasting feature.

Overview
The goal is to create a non-intrusive, opt-in "Predictive Calendar" that allows users to visualize future account balances based on scheduled income and expenses. This helps users identify potential cash flow "pinch points." The feature is composed of two new primary agents that work with the existing Actual Budget infrastructure.

1. Backend Agent: PredictiveCalendarAPI
This is a new, read-only agent that lives within the existing loot-core server package. Its sole responsibility is to generate the forecast data needed by the frontend calendar.

Key Responsibilities & Tools:

Data Aggregation: It will query the existing database for all scheduled transactions (both income and expenses) using the logic found in packages/loot-core/src/server/schedules/app.ts as a reference.

Balance Calculation: It calculates a running daily balance for a selected account over a specified date range. It starts with the account's current balance and applies the debits and credits from future scheduled transactions.

API Endpoint: It exposes a single, new, read-only API endpoint: GET /forecast/calendar-data. This endpoint will accept accountId, startDate, and endDate as parameters.

Non-Intrusive: This agent does not write any data to the database and has no impact on the core budgeting logic of Actual.

2. Frontend Agent: PredictiveCalendarView
This is a new frontend component agent within the desktop-client package. It is responsible for rendering the calendar and handling all user interaction for the feature.

Key Features & Tools:

Conditional Rendering: The entire feature is hidden by default and is only rendered if a specific preference is enabled in the user's settings.

Data Fetching: It communicates exclusively with the new /forecast/calendar-data API endpoint to get the data it needs to render.

UI Rendering (FullCalendar): It uses the FullCalendar library (a new dependency to be added) to display a month-by-month view.

Visualization: It plots the fetched scheduled transactions on the calendar and displays the calculated running balance for each day.

Interaction: Allows the user to navigate between months to see their cash flow forecast over time.