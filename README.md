# Freedom - Progress Tracker

A daily progress tracker with reflections, weekly/monthly reviews, and email reminders. Track work items, write reflections, and build consistency over time.

## Features

- **Daily progress logging** - Track work items completed each day with a calendar view
- **Reflections** - Write daily, weekly, and monthly reflections
- **Email reminders** - Configurable daily reminders via SMTP
- **User accounts** - Register/login with email and password, or use local-only mode
- **SQLite storage** - Lightweight, file-based database with no external services needed

## Getting Started

### Prerequisites

- Node.js

### Installation

```bash
git clone <repo-url>
cd MakeSomething
npm install
```

### Configuration

Copy the example env file and edit it:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `SESSION_SECRET` | Session encryption key | `dev-secret-change-me` |
| `SMTP_HOST` | SMTP server host | — |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_SECURE` | Use TLS | `false` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | From address for emails | `SMTP_USER` |

Email reminders are optional. The app works fully without SMTP configuration.

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Backend** - Node.js, Express
- **Database** - SQLite via better-sqlite3
- **Auth** - bcryptjs, express-session
- **Email** - Nodemailer
- **Frontend** - Vanilla HTML/CSS/JS

## License

[MIT](LICENSE)
