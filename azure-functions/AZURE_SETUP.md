# Azure Function App Setup - helpdesk-notify-func

Created: January 2026

## Configuration Choices

### Basics
| Setting | Value | Notes |
|---------|-------|-------|
| Hosting Plan | **Flex Consumption** | Recommended serverless plan - faster scaling, reduced cold starts |
| Subscription | Azure subscription 1 | |
| Resource Group | (your existing RG) | Keep with other helpdesk resources |
| Function App name | `helpdesk-notify-func` | |
| Region | Canada Central | Choose closest to users |
| Runtime stack | **Node.js** | |
| Version | **24** | Latest LTS |
| Instance size | **512 MB** | Sufficient for HTTP calls (email/Teams notifications) |
| Zone redundancy | **Disabled** | Not needed for notification service |

### Storage
| Setting | Value | Notes |
|---------|-------|-------|
| Storage account | New or existing | Used for function state/logs |

### Azure OpenAI
| Setting | Value | Notes |
|---------|-------|-------|
| Enable | **Skipped** | Not needed now. Can add later for AI features (ticket summaries, auto-categorization) |

### Networking
| Setting | Value | Notes |
|---------|-------|-------|
| Enable public access | **On** | Web app needs to call this function |
| Enable virtual network integration | **Off** | Not needed - only calls public Microsoft APIs |

### Monitoring
| Setting | Value | Notes |
|---------|-------|-------|
| Application Insights | **Enabled** | Logs function executions, errors, performance. Helpful for debugging |

### Deployment
| Setting | Value | Notes |
|---------|-------|-------|
| Continuous deployment | **Off** | Manual deploy via `func azure functionapp publish`. Can add GitHub CI/CD later |

### Authentication
| Setting | Value | Notes |
|---------|-------|-------|
| (default) | Skipped | Functions use function keys for auth |

---

## Future Options to Consider

### Azure OpenAI Integration
Enable for AI-powered features:
- Auto-categorize tickets based on description
- Generate ticket summaries for Teams notifications
- Suggest responses to common issues
- Sentiment analysis on ticket descriptions

### VNet Integration
Enable if you need:
- Access to private Azure resources
- Enhanced security/compliance requirements
- Connection to on-premises resources via ExpressRoute

### Zone Redundancy
Enable for:
- High availability requirements
- Mission-critical notifications
- Multi-zone disaster recovery

### Continuous Deployment
Set up GitHub Actions for:
- Auto-deploy on push to main branch
- Preview deployments for PRs
- Rollback capabilities

---

## App Settings Required

```
AZURE_CLIENT_ID=06fcde50-24bf-4d53-838d-ecc035653d8f
AZURE_TENANT_ID=f0db97c1-2010-4d0c-826e-d6e0f2b25f2f
AZURE_CLIENT_SECRET=<email-client-secret>
BOT_APP_ID=06fcde50-24bf-4d53-838d-ecc035653d8f
BOT_APP_SECRET=<bot-client-secret>
SENDER_EMAIL=supportdesk@skyparksantasvillage.com
SHAREPOINT_SITE_ID=<site-id>
TICKETS_LIST_ID=<tickets-list-id>
COMMENTS_LIST_ID=<comments-list-id>
ESCALATION_LIST_ID=<escalation-list-id>
APP_URL=https://tickets.spsvent.net
```

## Deploy Command

```bash
cd azure-functions
npm install
func azure functionapp publish helpdesk-notify-func
```
