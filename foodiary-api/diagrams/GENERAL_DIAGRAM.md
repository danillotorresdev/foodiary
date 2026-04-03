# Foodiary API - Diagrama Geral (Como Tudo se Conecta)

## 1. Visao Completa - Todos os Servicos e Fluxos

```mermaid
flowchart TB
  subgraph CLIENT["Cliente (App Mobile React Native)"]
    APP["Foodiary App"]
  end

  subgraph AWS_EDGE["AWS Edge"]
    APIGW["API Gateway HTTP v2<br/><i>Roteamento + JWT Authorizer</i>"]
    CF["CloudFront CDN<br/><i>HTTPS + Cache + HTTP/2,3</i>"]
  end

  subgraph AWS_COMPUTE["AWS Compute (Lambda)"]
    subgraph HTTP_LAMBDAS["Lambdas HTTP (via API Gateway)"]
      L_SIGNUP["signUp"]
      L_SIGNIN["signIn"]
      L_REFRESH["refreshToken"]
      L_FORGOT["forgotPassword"]
      L_CONFIRM_FORGOT["confirmForgotPassword"]
      L_GETME["getMe"]
      L_UPDATE_PROFILE["updateProfile"]
      L_UPDATE_GOAL["updateGoal"]
      L_CREATE_MEAL["createMeal"]
      L_LIST_MEALS["listMealsByDay"]
      L_GET_MEAL["getMealById"]
    end

    subgraph ASYNC_LAMBDAS["Lambdas Assincronas"]
      L_S3_EVENT["onMealFileUploaded<br/><i>Trigger: S3 ObjectCreated</i>"]
      L_SQS["processMeal<br/><i>Trigger: SQS Message</i>"]
    end

    subgraph COGNITO_LAMBDAS["Lambdas Cognito Trigger"]
      L_PRE_SIGNUP["preSignUpTrigger<br/><i>Auto-confirma user</i>"]
      L_PRE_TOKEN["preTokenGenerationTrigger<br/><i>Adiciona internalId ao JWT</i>"]
      L_CUSTOM_MSG["customMessageTrigger<br/><i>Email HTML customizado</i>"]
    end
  end

  subgraph AWS_STORAGE["AWS Storage"]
    DYNAMO["DynamoDB<br/>MainTable<br/><i>PK/SK + GSI1<br/>PAY_PER_REQUEST<br/>Point-in-Time Recovery</i>"]
    S3["S3 MealsBucket<br/><i>Fotos e audios<br/>DeletionPolicy: Retain</i>"]
  end

  subgraph AWS_MESSAGING["AWS Messaging"]
    SQS["SQS MealsQueue<br/><i>VisibilityTimeout: 130s<br/>maxReceiveCount: 2</i>"]
    DLQ["SQS MealsDLQ<br/><i>Retencao: 14 dias</i>"]
    SNS["SNS DLQAlarmsTopic<br/><i>Notificacao por email</i>"]
    CW["CloudWatch Alarm<br/><i>msgs na DLQ > 0</i>"]
  end

  subgraph AWS_AUTH["AWS Auth"]
    COGNITO["Cognito User Pool<br/><i>Email login<br/>USER_PASSWORD_AUTH<br/>RefreshToken rotation<br/>Custom attribute: internalId</i>"]
  end

  subgraph EXTERNAL["Servicos Externos"]
    OPENAI["OpenAI API<br/><i>gpt-4.1-mini (visao/texto)<br/>gpt-4o-mini-transcribe (audio)</i>"]
    SES["Amazon SES<br/><i>Emails transacionais</i>"]
  end

  subgraph MONITORING["Monitoramento"]
    EMAIL_ALERT["Email do Dev<br/><i>Alerta de falhas</i>"]
  end

  %% Client connections
  APP -->|"HTTPS REST<br/>POST/GET/PUT"| APIGW
  APP -->|"Presigned POST<br/>Upload direto"| S3
  APP -->|"HTTPS<br/>Leitura de midia"| CF

  %% API Gateway to Lambdas
  APIGW --> L_SIGNUP
  APIGW --> L_SIGNIN
  APIGW --> L_REFRESH
  APIGW --> L_FORGOT
  APIGW --> L_CONFIRM_FORGOT
  APIGW --> L_GETME
  APIGW --> L_UPDATE_PROFILE
  APIGW --> L_UPDATE_GOAL
  APIGW --> L_CREATE_MEAL
  APIGW --> L_LIST_MEALS
  APIGW --> L_GET_MEAL

  %% CDN to S3
  CF -->|"OAC<br/>Origin Access Control"| S3

  %% Lambda to DynamoDB
  HTTP_LAMBDAS -->|"GetItem / PutItem<br/>Query / UpdateItem<br/>TransactWrite"| DYNAMO
  ASYNC_LAMBDAS -->|"GetItem / UpdateItem"| DYNAMO

  %% Lambda to Cognito
  L_SIGNUP -->|"SignUpCommand<br/>InitiateAuthCommand"| COGNITO
  L_SIGNIN -->|"InitiateAuthCommand"| COGNITO
  L_REFRESH -->|"GetTokensFromRefreshToken"| COGNITO
  L_FORGOT -->|"ForgotPasswordCommand"| COGNITO
  L_CONFIRM_FORGOT -->|"ConfirmForgotPasswordCommand"| COGNITO

  %% Cognito triggers
  COGNITO -->|"PreSignUp"| L_PRE_SIGNUP
  COGNITO -->|"PreTokenGeneration V2"| L_PRE_TOKEN
  COGNITO -->|"CustomMessage"| L_CUSTOM_MSG

  %% Cognito to SES
  COGNITO -->|"Emails de verificacao<br/>e recuperacao"| SES

  %% API Gateway JWT
  APIGW -->|"Valida JWT<br/>issuer + audience"| COGNITO

  %% Meal creation flow
  L_CREATE_MEAL -->|"createPresignedPost"| S3

  %% S3 event flow
  S3 -->|"s3:ObjectCreated"| L_S3_EVENT
  L_S3_EVENT -->|"SendMessage"| SQS

  %% SQS flow
  SQS -->|"Event Source Mapping"| L_SQS
  L_SQS -->|"Vision / Transcribe<br/>+ Structured Output"| OPENAI

  %% DLQ flow
  SQS -->|"maxReceiveCount: 2<br/>RedrivePolicy"| DLQ
  DLQ --> CW
  CW -->|"AlarmAction"| SNS
  SNS -->|"email"| EMAIL_ALERT

  style CLIENT fill:#e1f5fe,stroke:#0277bd
  style AWS_EDGE fill:#e3f2fd,stroke:#1565c0
  style AWS_COMPUTE fill:#e8f5e9,stroke:#2e7d32
  style AWS_STORAGE fill:#fff3e0,stroke:#e65100
  style AWS_MESSAGING fill:#fce4ec,stroke:#c62828
  style AWS_AUTH fill:#f3e5f5,stroke:#6a1b9a
  style EXTERNAL fill:#fffde7,stroke:#f9a825
  style MONITORING fill:#efebe9,stroke:#4e342e
```

## 2. Fluxo Completo: Criar e Processar Refeicao

```mermaid
sequenceDiagram
  participant App as App Mobile
  participant APIGW as API Gateway
  participant LCreate as Lambda: createMeal
  participant DB as DynamoDB
  participant S3 as S3 Bucket
  participant LUpload as Lambda: onMealFileUploaded
  participant SQS as SQS MealsQueue
  participant LProcess as Lambda: processMeal
  participant AI as OpenAI API
  participant DLQ as SQS DLQ
  participant SNS as SNS → Email

  Note over App,APIGW: 1. CRIAR REFEICAO

  App->>APIGW: POST /meals { inputType: PICTURE, fileSize: 2048000 }
  APIGW->>APIGW: Valida JWT (CognitoAuthorizer)
  APIGW->>LCreate: Invoca Lambda
  LCreate->>DB: PutItem (Meal status=UPLOADING)
  LCreate->>S3: createPresignedPost (key, conditions, metadata)
  S3-->>LCreate: { url, fields }
  LCreate-->>APIGW: 201 { mealId, uploadSignature }
  APIGW-->>App: 201 { mealId, uploadSignature }

  Note over App,S3: 2. UPLOAD DIRETO AO S3

  App->>App: Decodifica uploadSignature (base64)
  App->>S3: POST multipart/form-data (url + fields + arquivo)
  S3->>S3: Valida: key, Content-Type, content-length, metadata
  S3-->>App: 200 OK

  Note over S3,SQS: 3. EVENTO S3 → FILA

  S3->>LUpload: S3 Event (ObjectCreated)
  LUpload->>S3: HeadObject (busca metadata: accountId, mealId)
  S3-->>LUpload: { accountId, mealId }
  LUpload->>DB: FindById → Atualiza status=QUEUED
  LUpload->>SQS: SendMessage { accountId, mealId }

  Note over SQS,AI: 4. PROCESSAMENTO COM IA

  SQS->>LProcess: Event Source Mapping (1 msg por vez)
  LProcess->>DB: FindById (busca Meal)
  LProcess->>DB: UpdateItem (status=PROCESSING, attempts+1)

  alt inputType = PICTURE
    LProcess->>AI: chat.completions.create (gpt-4.1-mini + image_url)
    AI-->>LProcess: { name, icon, foods[] }
  else inputType = AUDIO
    LProcess->>AI: audio.transcriptions.create (gpt-4o-mini-transcribe)
    AI-->>LProcess: transcricao texto
    LProcess->>AI: chat.completions.create (gpt-4.1-mini + texto)
    AI-->>LProcess: { name, icon, foods[] }
  end

  LProcess->>DB: UpdateItem (status=SUCCESS, name, icon, foods)

  Note over SQS,SNS: 5. TRATAMENTO DE FALHA

  alt Processamento falha (tentativa 1)
    LProcess-->>SQS: Erro (msg volta para fila)
    SQS->>LProcess: Retry (tentativa 2)
    alt Falha novamente
      LProcess->>DB: UpdateItem (status=FAILED)
      LProcess-->>SQS: Erro
      SQS->>DLQ: RedrivePolicy (maxReceiveCount=2)
      DLQ->>SNS: CloudWatch Alarm dispara
      SNS->>SNS: Email de alerta para o dev
    end
  end

  Note over App,DB: 6. CONSULTA DO RESULTADO

  App->>APIGW: GET /meals?date=2026-04-03
  APIGW->>DB: Query GSI1 (MEALS#{accountId}#2026-04-03)
  DB-->>APIGW: [ meals com status=SUCCESS ]
  APIGW-->>App: 200 { meals: [...] }
```

## 3. Fluxo Completo: Sign Up

```mermaid
sequenceDiagram
  participant App as App Mobile
  participant APIGW as API Gateway
  participant Lambda as Lambda: signUp
  participant Saga as Saga
  participant Cognito as Cognito
  participant DB as DynamoDB
  participant PreSignUp as Lambda: preSignUp
  participant PreToken as Lambda: preTokenGen

  App->>APIGW: POST /auth/sign-up { email, password, profile }
  APIGW->>Lambda: Invoca (rota publica, sem JWT)

  Lambda->>Lambda: Zod valida body (signUpSchema)
  Lambda->>DB: Query GSI1 (email ja existe?)
  DB-->>Lambda: null (email livre)

  Lambda->>Lambda: new Account({ email })
  Lambda->>Lambda: new Profile({ name, birthDate, ... })
  Lambda->>Lambda: GoalCalculator.calculate(profile)
  Lambda->>Lambda: new Goal({ calories, proteins, ... })

  Lambda->>Saga: saga.run(async () => { ... })

  Lambda->>Cognito: SignUpCommand({ email, password, internalId })
  Cognito->>PreSignUp: PreSignUp trigger
  PreSignUp->>PreSignUp: autoConfirmUser = true
  PreSignUp-->>Cognito: OK
  Cognito-->>Lambda: { UserSub: externalId }

  Lambda->>Saga: addCompensation(() => deleteUser)

  Lambda->>DB: TransactWriteCommand (Account + Profile + Goal)

  alt TransactWrite FALHA
    DB-->>Saga: Error
    Saga->>Cognito: AdminDeleteUser(externalId)
    Saga-->>App: Error response
  else TransactWrite OK
    DB-->>Lambda: OK

    Lambda->>Cognito: InitiateAuthCommand({ email, password })
    Cognito->>PreToken: PreTokenGeneration V2 trigger
    PreToken->>PreToken: Adiciona internalId ao access token
    PreToken-->>Cognito: OK
    Cognito-->>Lambda: { accessToken, refreshToken }

    Lambda-->>APIGW: 201 { accessToken, refreshToken }
    APIGW-->>App: 201 { accessToken, refreshToken }
  end
```

## 4. Fluxo de Autenticacao (JWT)

```mermaid
sequenceDiagram
  participant App as App Mobile
  participant APIGW as API Gateway
  participant Cognito as Cognito
  participant Lambda as Lambda (rota privada)
  participant Adapter as lambdaHttpAdapter

  Note over App: Usuario ja tem accessToken e refreshToken

  App->>APIGW: GET /me (Authorization: Bearer {accessToken})

  APIGW->>APIGW: JWT Authorizer
  Note over APIGW: 1. Verifica assinatura do token<br/>2. Valida issuerUrl (Cognito Provider URL)<br/>3. Valida audience (UserPoolClient ID)<br/>4. Verifica expiracao

  alt Token INVALIDO ou EXPIRADO
    APIGW-->>App: 401 Unauthorized
  else Token VALIDO
    APIGW->>Lambda: Invoca com requestContext.authorizer.jwt.claims
    Lambda->>Adapter: event
    Adapter->>Adapter: accountId = claims.internalId
    Adapter->>Lambda: controller.execute({ accountId, ... })
    Lambda-->>APIGW: 200 { profile, goal }
    APIGW-->>App: 200 { profile, goal }
  end

  Note over App: Quando accessToken expira (12h)

  App->>APIGW: POST /auth/refresh-token { refreshToken }
  APIGW->>Lambda: Invoca (rota publica)
  Lambda->>Cognito: GetTokensFromRefreshTokenCommand
  Note over Cognito: Refresh Token Rotation:<br/>Token antigo invalidado,<br/>novo par emitido
  Cognito-->>Lambda: { newAccessToken, newRefreshToken }
  Lambda-->>App: 200 { accessToken, refreshToken }
```

## 5. Mapa de Servicos AWS e Conexoes

```mermaid
flowchart TB
  subgraph INTERNET["Internet"]
    MOBILE["App Mobile"]
    DEV_EMAIL["Email do Dev"]
  end

  subgraph EDGE["Edge"]
    R53_API["Route53<br/>api.foodiary.dev"]
    R53_CDN["Route53<br/>meals.foodiary.dev"]
    ACM_API["ACM Certificate<br/>(API)"]
    ACM_CDN["ACM Certificate<br/>(CDN)"]
  end

  subgraph GATEWAY["Gateway Layer"]
    APIGW["API Gateway HTTP v2<br/><br/>11 rotas HTTP<br/>JWT Authorizer<br/>Custom Domain"]
    CF["CloudFront<br/><br/>OAC → S3<br/>HTTP/2+3<br/>Compress"]
  end

  subgraph COMPUTE["Compute"]
    L_HTTP["11 HTTP Lambdas<br/>128MB / Node 24.x"]
    L_ASYNC["2 Async Lambdas<br/>(S3 event, SQS)"]
    L_COGNITO["3 Cognito Triggers"]
  end

  subgraph DATA["Data"]
    DYNAMO["DynamoDB MainTable<br/><br/>PK/SK + GSI1<br/>PAY_PER_REQUEST<br/>PITR 35 dias<br/>Deletion Protection"]
    S3["S3 MealsBucket<br/><br/>Retain policy<br/>Privado (OAC only)"]
  end

  subgraph AUTH["Auth"]
    COGNITO["Cognito User Pool<br/><br/>Email auth<br/>Secret client<br/>Refresh rotation<br/>custom:internalId"]
    SES["SES<br/>Emails"]
  end

  subgraph ASYNC["Async Processing"]
    SQS_MAIN["SQS MealsQueue<br/>Visibility: 130s"]
    SQS_DLQ["SQS MealsDLQ<br/>Retencao: 14d"]
    CW["CloudWatch Alarm"]
    SNS["SNS Topic"]
  end

  subgraph EXT["External"]
    OPENAI["OpenAI API"]
  end

  %% DNS
  MOBILE --> R53_API --> APIGW
  MOBILE --> R53_CDN --> CF
  MOBILE -->|"Presigned POST"| S3

  %% Certs
  ACM_API -.-> APIGW
  ACM_CDN -.-> CF

  %% Gateway to Compute
  APIGW --> L_HTTP
  S3 -->|"ObjectCreated"| L_ASYNC
  SQS_MAIN -->|"Event Source"| L_ASYNC
  COGNITO -->|"Triggers"| L_COGNITO

  %% Compute to Data
  L_HTTP --> DYNAMO
  L_HTTP --> COGNITO
  L_HTTP -->|"Presigned POST"| S3
  L_ASYNC --> DYNAMO
  L_ASYNC --> SQS_MAIN
  L_ASYNC --> OPENAI

  %% CDN
  CF -->|"OAC"| S3

  %% Auth
  COGNITO --> SES

  %% DLQ chain
  SQS_MAIN -->|"RedrivePolicy"| SQS_DLQ
  SQS_DLQ --> CW --> SNS --> DEV_EMAIL

  style INTERNET fill:#e1f5fe,stroke:#0277bd
  style EDGE fill:#e0e0e0,stroke:#616161
  style GATEWAY fill:#e3f2fd,stroke:#1565c0
  style COMPUTE fill:#e8f5e9,stroke:#2e7d32
  style DATA fill:#fff3e0,stroke:#e65100
  style AUTH fill:#f3e5f5,stroke:#6a1b9a
  style ASYNC fill:#fce4ec,stroke:#c62828
  style EXT fill:#fffde7,stroke:#f9a825
```
