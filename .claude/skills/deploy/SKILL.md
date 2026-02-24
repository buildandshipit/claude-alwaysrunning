---
name: deploy
description: Deploy claude-alwaysrunning to VPS or manage deployment
disable-model-invocation: true
allowed-tools: Bash, Read
argument-hint: "[vps-ip] or [command]"
---

# Deploy claude-alwaysrunning

Deploy the application to a VPS (Oracle Cloud or similar) using PM2.

## Arguments

- No args: Show deployment status and options
- `<vps-ip>`: Deploy to specified VPS
- `status`: Check PM2 status on VPS
- `logs`: View logs from VPS
- `restart`: Restart the service on VPS

## Pre-deployment Checklist

Before deploying, verify:

1. All changes are committed and pushed to GitHub
2. Tests pass (if applicable)
3. Version is updated in package.json (if releasing)

```bash
git status
git log --oneline -3
```

## Deploy Steps

### First-time Setup (on VPS)

SSH into the VPS and run:
```bash
curl -fsSL https://raw.githubusercontent.com/buildandshipit/claude-alwaysrunning/main/deploy/oracle-setup.sh | bash
```

### Update Existing Deployment

SSH into the VPS:
```bash
ssh ubuntu@<VPS_IP>
```

Then update:
```bash
cd /opt/claude-alwaysrunning
git pull
npm install
pm2 restart claude-always
pm2 status
```

### Quick Deploy Command

For a VPS with SSH key configured:
```bash
ssh ubuntu@$ARGUMENTS "cd /opt/claude-alwaysrunning && git pull && npm install && pm2 restart claude-always && pm2 status"
```

## PM2 Commands Reference

| Command | Description |
|---------|-------------|
| `pm2 status` | Show service status |
| `pm2 logs claude-always` | View logs |
| `pm2 restart claude-always` | Restart service |
| `pm2 stop claude-always` | Stop service |
| `pm2 start deploy/ecosystem.config.js` | Start with config |

## Firewall Reminder

Ensure port 3377 is open:
- Oracle Cloud VCN Security List
- Instance iptables: `sudo iptables -I INPUT -p tcp --dport 3377 -j ACCEPT`

## Verify Deployment

After deploying, test the connection:
```bash
nc <VPS_IP> 3377
```

Or use the CLI:
```bash
claude-always connect -h <VPS_IP> -k <API_KEY>
```
