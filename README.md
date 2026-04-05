# Reliable Audio Transcription System

A production-ready transcription system with **zero chunk loss**, **no hallucination**, and **multi-speaker support** for audio sessions up to 1+ hours.

## Features

- 🎙️ **Live Recording** — Record directly from microphone with real-time waveform visualization
- 📁 **File Upload** — Upload pre-recorded audio files (supports long sessions 1hr+)
- 👥 **Multi-Speaker Detection** — Automatic speaker diarization for 5+ speakers
- 🔄 **Zero Data Loss** — OPFS persistence + server acknowledgment ensures no chunks are lost
- 📝 **Accurate Transcription** — Powered by Deepgram Nova-2 with confidence scores
- 🎨 **Speaker Color Coding** — Visual distinction between different speakers
- 📋 **Export Options** — Copy or download transcripts

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Record audio → Split into 5-second WAV chunks               │
│  2. Store chunks in OPFS (durable client-side storage)          │
│  3. Upload chunks to server with retry logic                    │
│  4. On success → receive acknowledgment                         │
│  5. Reconciliation: re-upload from OPFS if server missing chunk │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER (Hono/Bun)                        │
├─────────────────────────────────────────────────────────────────┤
│  • Receive chunks → Store on filesystem                         │
│  • Acknowledge receipt → Update database                        │
│  • Transcription API → Send to Deepgram with diarization        │
│  • Return transcript segments with speaker labels               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DEEPGRAM (Nova-2 Model)                     │
├─────────────────────────────────────────────────────────────────┤
│  • Speech-to-text transcription                                 │
│  • Speaker diarization (multi-speaker detection)                │
│  • Confidence scores per word                                   │
│  • Smart formatting & punctuation                               │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Next.js** — Frontend (App Router)
- **Hono** — Backend API server
- **Bun** — Runtime
- **Drizzle ORM + PostgreSQL** — Database (Neon)
- **Deepgram** — AI transcription with speaker diarization
- **TailwindCSS + shadcn/ui** — UI
- **Turborepo** — Monorepo build system

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

**Server (`apps/server/.env`):**
```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
CORS_ORIGIN=http://localhost:3001
NODE_ENV=development
DEEPGRAM_API_KEY=your_deepgram_api_key
STORAGE_PATH=./storage
```

**Web (`apps/web/.env`):**
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

### 3. Database Setup

```bash
npm run db:push -w @my-better-t-app/db
```

### 4. Run Development

```bash
npm run dev
```

- Web app: [http://localhost:3001](http://localhost:3001)
- API server: [http://localhost:3000](http://localhost:3000)

## Deployment

### Server → Railway

1. Go to [railway.app](https://railway.app) and connect your GitHub repo
2. Create a new project → **Deploy from GitHub repo**
3. Set the **Root Directory** to `apps/server`
4. Add environment variables:
   ```
   DATABASE_URL=your_neon_connection_string
   CORS_ORIGIN=https://transcribebyathul.vercel.app
   NODE_ENV=production
   DEEPGRAM_API_KEY=your_deepgram_api_key
   STORAGE_PATH=./storage
   ```
5. Railway will auto-detect Bun and deploy
6. Copy your Railway URL (e.g., `https://your-app.railway.app`)

### Web → Vercel

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo
2. Set the **Root Directory** to `apps/web`
3. Add environment variable:
   ```
   NEXT_PUBLIC_SERVER_URL=https://your-app.railway.app
   ```
4. Deploy!

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/recordings` | Create new recording session |
| GET | `/api/recordings/:id` | Get recording details |
| PATCH | `/api/recordings/:id` | Update recording status |
| POST | `/api/chunks/:recordingId` | Upload audio chunk |
| GET | `/api/chunks/:recordingId` | List chunks for recording |
| POST | `/api/transcribe/:recordingId` | Trigger transcription |
| GET | `/api/recordings/:id/transcript` | Get transcript with speakers |

## Project Structure

```
swades-ai-hackathon/
├── apps/
│   ├── web/                 # Frontend (Next.js)
│   │   └── src/
│   │       ├── app/transcription/  # Main transcription UI
│   │       ├── hooks/use-recorder.ts  # Audio recording hook
│   │       └── lib/         # API client, OPFS, upload utils
│   └── server/              # Backend API (Hono)
│       └── src/
│           ├── routes/      # API routes
│           └── services/    # Transcription service
├── packages/
│   ├── ui/                  # Shared shadcn/ui components
│   ├── db/                  # Drizzle ORM schema
│   ├── env/                 # Type-safe environment config
│   └── config/              # Shared TypeScript config
```

## Reliability Features

### Zero Chunk Loss
- Chunks stored in **OPFS** before network upload
- Server sends **acknowledgment** after successful storage
- **Reconciliation** re-uploads from OPFS if server missing chunks

### No Hallucination
- Deepgram **Nova-2** model (lowest hallucination rate)
- **Confidence scores** for each segment
- No speculative text generation

### Multi-Speaker Support
- Automatic **speaker diarization** enabled
- Supports **5+ concurrent speakers**
- Color-coded speaker labels in UI

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start all apps in development |
| `npm run build` | Build all apps |
| `npm run dev:web` | Start only web app |
| `npm run dev:server` | Start only server |
| `npm run check-types` | TypeScript type checking |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open database studio UI |

## Getting Deepgram API Key

1. Go to [console.deepgram.com](https://console.deepgram.com/)
2. Create a free account (includes $200 credit)
3. Create an API key with **"Member"** permissions
4. Copy the key to your `.env` file
