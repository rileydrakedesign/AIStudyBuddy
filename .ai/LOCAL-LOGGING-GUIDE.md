# Local Development Logging Guide

## Quick Reference

You now have **two ways** to start your local development environment:

### Option 1: Standard Start (No Logging)
```
/start-local-dev
```
- Fastest startup
- Terminal output only
- Use when you don't need to review logs later

### Option 2: Start with Persistent Logs ⭐
```
/start-local-dev-with-logs
```
- Same speed, logs saved to `.ai/logs/`
- Terminal output + file logging
- **Use when debugging or testing**

---

## Viewing Logs

### Real-time Monitoring

```bash
# View all services at once
tail -f .ai/logs/*.log

# View specific service
tail -f .ai/logs/backend.log
tail -f .ai/logs/python.log
tail -f .ai/logs/frontend.log
```

### Searching Logs

```bash
# Find errors across all services
grep "error" .ai/logs/*.log

# Find errors with context (3 lines before/after)
grep -C 3 "error" .ai/logs/*.log

# Search specific service
grep "MongoDB" .ai/logs/backend.log

# Case-insensitive search
grep -i "failed" .ai/logs/*.log
```

### Advanced Log Analysis

```bash
# View last 100 lines from all logs
tail -n 100 .ai/logs/*.log

# View logs from specific time (if timestamps in logs)
grep "2025-11-14 11:" .ai/logs/backend.log

# Count occurrences
grep -c "error" .ai/logs/*.log

# Show only unique errors
grep "error" .ai/logs/*.log | sort -u
```

---

## Log File Locations

All logs saved to: `.ai/logs/`

```
.ai/logs/
├── backend.log     # Node.js backend (Pino logger output)
├── frontend.log    # Vite dev server
└── python.log      # FastAPI Python service (Loguru output)
```

---

## Important Notes

### ✅ Safe for Git
- All `.ai/logs/*.log` files are **automatically git-ignored**
- Verified by `.gitignore` line 26: `*.log`
- Safe to accumulate logs locally without pollution

### ✅ Zero Production Impact
- Logging uses **shell redirection only** (`tee` command)
- **NO code changes** in production files
- Works by capturing stdout/stderr at the shell level
- Original `/start-local-dev` skill unchanged

### ✅ Log Persistence
- Logs survive terminal closes
- Logs persist across service restarts
- Can review logs after crashes

### ⚠️ Manual Cleanup
- Logs accumulate over time
- Clean up periodically:
  ```bash
  # Remove all logs
  rm .ai/logs/*.log

  # Remove logs older than 7 days
  find .ai/logs -name "*.log" -mtime +7 -delete

  # View log directory size
  du -sh .ai/logs
  ```

---

## Troubleshooting

### Logs not appearing?

Check if services started successfully:
```bash
lsof -ti:3000 && echo "Backend: ✅" || echo "Backend: ❌"
lsof -ti:5173 && echo "Frontend: ✅" || echo "Frontend: ❌"
lsof -ti:8000 && echo "Python: ✅" || echo "Python: ❌"
```

Check if log files exist:
```bash
ls -lh .ai/logs/
```

### Can't find specific error?

Use grep with line numbers:
```bash
grep -n "error" .ai/logs/backend.log
```

### Want to clear logs before new session?

```bash
# Clear all logs
> .ai/logs/backend.log
> .ai/logs/python.log
> .ai/logs/frontend.log

# Or delete them
rm .ai/logs/*.log
```

---

## Comparison: With vs Without Logging

| Feature | `/start-local-dev` | `/start-local-dev-with-logs` |
|---------|-------------------|------------------------------|
| Startup Speed | Fast | Fast (identical) |
| Terminal Output | ✅ | ✅ |
| File Logging | ❌ | ✅ |
| Logs Persist | ❌ | ✅ |
| Searchable History | ❌ | ✅ |
| Production Impact | None | None |
| Git Impact | None | None (auto-ignored) |

---

## Best Practices

**Use `/start-local-dev-with-logs` when:**
- Debugging complex issues
- Testing new features
- Need to trace request flows
- Investigating crashes
- Sharing logs with team

**Use `/start-local-dev` when:**
- Quick UI changes
- Don't need historical logs
- Just checking if app runs

---

Last Updated: 2025-11-14
