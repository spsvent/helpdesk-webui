# Help Desk Azure Functions

Azure Functions for the Help Desk app:
- **SendEmail**: Send emails from a shared mailbox using application permissions
- **CheckEscalations**: Automatically escalate tickets based on configured rules (runs hourly)

## Setup

### 1. Create Azure Function App

```bash
# Install Azure Functions Core Tools if not already installed
npm install -g azure-functions-core-tools@4

# Login to Azure
az login

# Create a resource group (if needed)
az group create --name helpdesk-rg --location westus2

# Create a Function App
az functionapp create \
  --resource-group helpdesk-rg \
  --consumption-plan-location westus2 \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name helpdesk-email-func \
  --storage-account <your-storage-account>
```

### 2. Configure App Settings

In Azure Portal or via CLI, set these environment variables:

```bash
az functionapp config appsettings set \
  --name helpdesk-email-func \
  --resource-group helpdesk-rg \
  --settings \
    AZURE_CLIENT_ID="06fcde50-24bf-4d53-838d-ecc035653d8f" \
    AZURE_TENANT_ID="f0db97c1-2010-4d0c-826e-d6e0f2b25f2f" \
    AZURE_CLIENT_SECRET="<your-client-secret>" \
    SENDER_EMAIL="supportdesk@skyparksantasvillage.com"
```

### 3. Deploy the Function

```bash
cd azure-functions
npm install
func azure functionapp publish helpdesk-email-func
```

### 4. Get the Function URL

After deployment, get the function URL from Azure Portal:
- Go to Function App → Functions → SendEmail → Get Function URL

The URL will look like:
`https://helpdesk-email-func.azurewebsites.net/api/SendEmail?code=<function-key>`

### 5. Configure the Web App

Add to `.env.local`:

```
NEXT_PUBLIC_EMAIL_FUNCTION_URL=https://helpdesk-email-func.azurewebsites.net/api/SendEmail?code=<function-key>
```

## Local Testing

```bash
cd azure-functions
npm install

# Create local.settings.json
cat > local.settings.json << EOF
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_CLIENT_ID": "06fcde50-24bf-4d53-838d-ecc035653d8f",
    "AZURE_TENANT_ID": "f0db97c1-2010-4d0c-826e-d6e0f2b25f2f",
    "AZURE_CLIENT_SECRET": "<your-client-secret>",
    "SENDER_EMAIL": "supportdesk@skyparksantasvillage.com"
  }
}
EOF

# Run locally
func start
```

## API

### POST /api/SendEmail

Send an email from the shared mailbox.

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Email Subject",
  "htmlContent": "<html><body>Email content</body></html>"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

### POST /api/runEscalationCheck

Manually trigger an escalation check. Also runs automatically every hour via timer trigger.

**Response:**
```json
{
  "success": true,
  "message": "Escalation check completed",
  "checked": 15,
  "escalated": 2
}
```

## Escalation Rules

The escalation function checks all open tickets against configured escalation rules. Rules can:
- Match by priority, status, or department
- Trigger after a specified time with no response or no updates
- Take actions: escalate priority, reassign, notify, or both

### Additional App Settings for Escalation

```bash
az functionapp config appsettings set \
  --name helpdesk-email-func \
  --resource-group helpdesk-rg \
  --settings \
    SHAREPOINT_SITE_ID="<site-id>" \
    TICKETS_LIST_ID="<tickets-list-id>" \
    COMMENTS_LIST_ID="<comments-list-id>" \
    ESCALATION_LIST_ID="<escalation-list-id>" \
    APP_URL="https://tickets.spsvent.net"
```

### Web App Configuration

Add to `.env.local` for manual escalation check button:

```
NEXT_PUBLIC_ESCALATION_FUNCTION_URL=https://helpdesk-email-func.azurewebsites.net/api/runEscalationCheck?code=<function-key>
```
