# Restaurant Ordering System Backend - Azure Function App

This is an Azure Function App that provides a simple HTTP API endpoint.

## Prerequisites

- Node.js (version 18 or later)
- Azure Functions Core Tools
- Azure CLI (for deployment)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Azure Functions Core Tools globally (if not already installed):
```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

## Running Locally

To run the function locally:

```bash
npm start
```

or

```bash
func start
```

The function will be available at: `http://localhost:7071/api/hello`

## API Endpoints

### GET/POST /api/hello

Returns a simple greeting message.

**Response:**
```
hello manish and aslam
```

**Example:**
```bash
curl http://localhost:7071/api/hello
```

## Deployment to Azure

1. Login to Azure:
```bash
az login
```

2. Create a resource group (if needed):
```bash
az group create --name myResourceGroup --location eastus
```

3. Create a storage account:
```bash
az storage account create --name mystorageaccount --location eastus --resource-group myResourceGroup --sku Standard_LRS
```

4. Create a function app:
```bash
az functionapp create --resource-group myResourceGroup --consumption-plan-location eastus --runtime node --runtime-version 18 --functions-version 4 --name myFunctionApp --storage-account mystorageaccount
```

5. Deploy the function:
```bash
func azure functionapp publish myFunctionApp
```

## Project Structure

```
├── src/
│   └── functions/
│       └── hello.js          # Main HTTP trigger function
├── host.json                 # Function app configuration
├── local.settings.json       # Local development settings
├── package.json              # Node.js dependencies
└── README.md                 # This file
```

This project was converted from JavaScript to TypeScript.

How to build and run locally:

- Install dependencies:

```bash
npm install
```

- Build TypeScript to `dist/`:

```bash
npm run build
```

- Start the Azure Functions host using the compiled output:

```bash
npm start
```

Notes:
- Type declarations for Node and Azure Functions are in devDependencies. If you run into type errors, run `npm install` first.
- The Function App entry is `dist/index.ts` after build; `npm start` runs the build and then starts the Functions host with `--script-root dist`.

## Where the product spec is

The Restaurant Ordering System is one product across several repositories, and almost every rule that
matters — how money is represented, how orders move, who may see what — cuts
across all of them. Keeping one copy of the spec is what stops several copies
drifting apart.

The spec is shared and lives in the **rs-backend** repo:

- in a checkout with the standard layout: `docs/spec.md` in this repo
- on GitHub: https://github.com/Fair-Technology/restaurant-ordering-system-backend/blob/main/docs/spec.md

Don't restate product rules here — a frontend only hides controls a user cannot
use; the rules are enforced in the backend. If you learn something new about how
the product behaves, edit the spec, not this file.
