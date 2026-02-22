# Heartbeat Configuration

This file controls how Bright's proactive heartbeat behaves.
Edit it to tune check-in frequency, monitoring rules, and communication style.
The heartbeat reads this file at startup — restart the bot after changes.

## Monitoring Rules

- Check in at most 3 times per day
- Minimum 2 hours between check-ins
- Active hours: 8am to 10pm

## What to Monitor

- Goal deadlines approaching within 24 hours
- Completed background tasks — notify me once
- If I've been inactive for 4+ hours during work hours, a gentle nudge is OK

## Communication Style for Proactive Messages

- Keep it to 1-2 sentences max
- Casual tone, like a quick text from a friend
- Don't repeat information from the morning briefing
- Reference specific goals or tasks by name when relevant

## Morning Briefing Preferences

- Include weather, active goals, overnight task completions
- Skip news unless something is directly relevant to my goals
- Keep it under 15 lines

## Do Not Monitor

- Don't check in just because I haven't messaged — only if there's something actionable
- Don't mention the same completed task more than once
