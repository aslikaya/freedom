# Freedom - Progress Tracker

A daily progress tracker with reflections and weekly/monthly reviews. Track work items, write reflections, and build consistency over time.

## Features

- **Daily progress logging** - Track work items completed each day with a calendar view
- **Reflections** - Write daily, weekly, and monthly reflections
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

### Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Backend** - Node.js, Express
- **Database** - SQLite via better-sqlite3
- **Auth** - bcryptjs, express-session
- **Frontend** - Vanilla HTML/CSS/JS

## License

[MIT](LICENSE)
