---
name: emtehani-platform-overview
description: Understand and navigate Emtehani, an Arabic-first school exam platform. Use when a user asks what Emtehani is, how teachers create and run exams, how students enter exams, or what data is private. Public information only; never use it to access learner or exam records.
---

# Emtehani Platform Overview

Emtehani (امتحاني) is an Arabic-first, right-to-left school exam platform for
teachers and students. Canonical site: https://emtehani.vercel.app/

## What the platform does

- Teachers create exams with six question types: multiple choice, true/false,
  short answer, essay, fill-in-the-blank, and matching.
- Each exam is scoped to an education stage and grade.
- A waiting room lets students arrive before the session starts; the timer does
  not begin until the teacher opens the session.
- Teachers can open, pause, resume, and close a live session. Pausing stops the
  clock, and resume adds the paused time back automatically.
- The live monitor shows active, submitted, disconnected, and waiting students,
  refreshed every three seconds.
- Objective questions are graded automatically. Essays go to a manual review
  queue.
- Results and attendance can be exported as CSV.

## Roles

| Role | Can do | Cannot do |
| --- | --- | --- |
| Teacher | Create and manage own exams, run sessions, review essays, view linked students, publish results | Access another teacher's exams or students |
| Student | Register, request enrollment with a teacher, enter eligible exams, view own released results | See other students' data or exams they are not eligible for |

## How a student enters an exam

1. Sign in at https://emtehani.vercel.app/.
2. Available exams appear only when the student is linked to the teacher, matches
   the exam stage and grade, is not suspended or banned, and the exam is
   published.
3. The student enters the lobby and waits for the teacher to open the session.
4. Answers are saved while the exam is in progress; a reload resumes the attempt
   when the exam allows it.

## How a teacher runs a session

1. Create an exam, add questions and points, set duration, stage, and grade.
2. Publish the exam and, when ready, open the session.
3. Monitor the participant list; pause or resume if needed.
4. Close the session, review essays, then publish results if the exam uses
   manual result release.

## Privacy and access rules

- Student and teacher names, emails, stage/grade, student codes, exam content,
  answers, scores, and audit events are private.
- All private access requires a verified account and server-side role checks.
- Public discovery documents intentionally exclude private data.
- Never attempt to bypass authentication, CORS, rate limits, or authorization.
- Do not ask users for passwords in order to automate actions.

## Public resources

- Home: https://emtehani.vercel.app/
- Markdown home: https://emtehani.vercel.app/agent.md
- API docs: https://emtehani.vercel.app/api-docs/
- Auth guide: https://emtehani.vercel.app/auth.md
- API catalog: https://emtehani.vercel.app/.well-known/api-catalog
- AI catalog: https://emtehani.vercel.app/.well-known/ai-catalog.json
- MCP server card: https://emtehani.vercel.app/.well-known/mcp/server-card.json

## Boundaries

This skill is documentation. It does not grant API access, does not register
accounts, and does not authorize access to any private record. For account or
integration requests, contact ahmedgbreel47@gmail.com.
