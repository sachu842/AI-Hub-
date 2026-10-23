# AI Hub

A real website with accounts and working AI tools.

- Sign up and log in with a username, email and password (passwords are stored as secure hashes).
- 10 AI tools: chat, tutor, writing, summaries, code, debugging, image prompts, ideas, translation and planning.
- Every tool is powered by the Claude API. Your API key stays on the server and is never sent to the browser.
- Each user gets a daily request limit so your API bill stays under control.

## Run it on your computer

You need [Node.js](https://nodejs.org) version 18 or newer (the "LTS" download is fine).

1. Open a terminal in this folder and install the packages:
   ```
   npm install
   ```
2. Copy `.env.example` to a new file named `.env`.
3. Open `.env` and fill in two values:
   - `ANTHROPIC_API_KEY`: create a key at https://console.anthropic.com (you need to add a small amount of credit there).
   - `JWT_SECRET`: a long random string. Make one by running:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
4. Start the website:
   ```
   npm start
   ```
5. Open http://localhost:3000, create an account, and open any tool.

Leave `NODE_ENV` as `development` while testing on your own computer.

## Put it online

Any host that runs Node.js works. Two easy options are Render and Railway.

1. Put this folder in a GitHub repository (do not upload your `.env` file).
2. Create a new "Web Service" on the host and connect the repository.
3. Build command: `npm install`. Start command: `npm start`.
4. Add these environment variables in the host's settings:
   - `ANTHROPIC_API_KEY`
   - `JWT_SECRET`
   - `NODE_ENV` set to `production`
   - `DATABASE_PATH` set to a path on a persistent disk, for example `/var/data/aihub.db`
5. **Attach a persistent disk** to that path. Accounts are stored in a database file, and without a disk the host erases the file on every restart, which deletes all accounts. Free plans usually have no disk, so use a paid plan or move to a hosted database later.
6. Your site gets a free `https://` address, and you can connect your own domain name in the host's settings.

## Settings you can change

| Setting | What it does | Default |
| --- | --- | --- |
| `DAILY_LIMIT` | AI requests per user per day | 30 |
| `ANTHROPIC_MODEL` | Which Claude model the tools use | claude-sonnet-5-5 |
| `PORT` | Port the server listens on | 3000 |

## Add or change a tool

Open `tools.js`. Each tool is a name, a category, a description and a `system` text that tells Claude how to behave. Copy one block, change the text, and restart. The instructions stay on the server, so visitors cannot edit them.

## What is in this folder

- `server.js`: accounts, login, daily limits and the AI request route
- `tools.js`: the list of AI tools and their instructions
- `public/`: the website (page, styles and script)
- `data/`: created automatically, holds the account database

## Good to know

- The AI tools write text. Image, video and music tools are not included; Pixel Prompt only writes prompts you can paste into an image generator.
- There is no email verification or "forgot password" yet. Those need an email service and would be the next things to add before a large public launch.
- AI answers can contain mistakes. The site footer says so, and you may want to keep that.
