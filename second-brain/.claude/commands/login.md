# Second Brain Login

Authenticate Claude Code with your Second Brain account.

## Instructions

Run the CLI login script to authenticate:

```bash
cd $PROJECT_ROOT
./backend/venv/bin/python3 ./backend/cli/login.py
```

This will:
1. Open your browser to the Second Brain login page
2. Wait for you to log in with your account
3. Save your personal API key
4. Update Claude Code settings automatically

After successful login, restart Claude Code for the changes to take effect.

## Troubleshooting

If the browser doesn't open automatically, the script will display the URL for you to copy and paste.

If you see "backend not running" errors:
```bash
cd $PROJECT_ROOT && docker-compose up -d
```
