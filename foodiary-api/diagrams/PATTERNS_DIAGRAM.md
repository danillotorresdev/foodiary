# Foodiary API - Diagrama de Padroes

## 1. Mapa Geral de Padroes

```mermaid
mindmap
  root((Padroes do<br/>Foodiary API))
    Arquiteturais
      Clean Architecture
        Camadas independentes
        Regra de dependencia
      CQRS
        Commands = UseCases
        Queries = leitura otimizada
      Event-Driven
        S3 Events
        SQS Messages
        Cognito Triggers
      Serverless FaaS
        Lambda por endpoint
        Pay-per-use
      Single Table Design
        Uma tabela DynamoDB
        PK/SK + GSI

    Design GoF
      Repository
        AccountRepository
        MealRepository
        ProfileRepository
        GoalRepository
      Unit of Work
        SignUpUnitOfWork
        TransactWrite atomico
      Saga
        Compensacao distribuida
        SignUpUseCase
      Gateway
        AuthGateway Cognito
        MealsFileStorageGateway S3
        MealsQueueGateway SQS
        MealsAIGateway OpenAI
      Adapter
        lambdaHttpAdapter
        lambdaS3Adapter
        lambdaSQSAdapter
      Data Mapper
        AccountItem
        MealItem
        ProfileItem
        GoalItem
      Singleton
        Registry
        AWS Clients
      Template Method
        Controller.execute
      Decorator
        Injectable
        Schema
      Factory Method
        Item.fromEntity
        Item.toEntity
      Strategy
        MealsAIGateway
        PICTURE vs AUDIO

    Dominio DDD
      Entity
        Account
        Profile
        Goal
        Meal
      Value Object
        Enums Status Gender Goal
      Domain Service
        GoalCalculator
      Application Service
        UseCases

    API e Integracao
      Controller Pattern
      DTO Pattern
      Schema Validation Zod
      Error Handling
      Presigned POST
```

## 2. CQRS - Command vs Query

```mermaid
flowchart LR
  subgraph CLIENT["Cliente (App Mobile)"]
    REQ_W["POST / PUT<br/><i>Escrita</i>"]
    REQ_R["GET<br/><i>Leitura</i>"]
  end

  subgraph APIGW["API Gateway"]
    ROUTE["Roteamento + JWT"]
  end

  REQ_W --> ROUTE
  REQ_R --> ROUTE

  subgraph COMMAND_SIDE["Command Side (Escrita)"]
    direction TB
    CTRL_C["Controller"]
    UC["UseCase"]
    REPO_C["Repository"]
    GW["Gateway"]
    UOW_C["Unit of Work"]
    SAGA_C["Saga"]
    ENT["Entity"]

    CTRL_C --> UC
    UC --> REPO_C
    UC --> GW
    UC --> UOW_C
    UC --> SAGA_C
    UC --> ENT
  end

  subgraph QUERY_SIDE["Query Side (Leitura)"]
    direction TB
    CTRL_Q["Controller"]
    QRY["Query"]
    DTO["DTO direto"]

    CTRL_Q --> QRY
    QRY --> DTO
  end

  ROUTE -->|"POST/PUT"| CTRL_C
  ROUTE -->|"GET"| CTRL_Q

  subgraph DB["DynamoDB (MainTable)"]
    TABLE["PK/SK + GSI1"]
  end

  REPO_C --> TABLE
  UOW_C --> TABLE
  QRY -->|"QueryCommand<br/>ProjectionExpression<br/>Indice GSI1"| TABLE

  style COMMAND_SIDE fill:#fff3e0,stroke:#e65100
  style QUERY_SIDE fill:#e3f2fd,stroke:#1565c0
  style DB fill:#e8f5e9,stroke:#2e7d32
```

## 3. Adapter Pattern - Tres Adapters

```mermaid
flowchart TB
  subgraph TRIGGERS["Origens de Evento"]
    APIGW["API Gateway v2<br/><i>HTTP Request</i>"]
    S3EV["S3 Event<br/><i>ObjectCreated</i>"]
    SQSEV["SQS Event<br/><i>Message</i>"]
  end

  subgraph ADAPTERS["Adapters (Tradutores)"]
    LHA["lambdaHttpAdapter<br/><br/>1. Resolve Controller via Registry<br/>2. Parseia body, params, query<br/>3. Extrai accountId do JWT<br/>4. Chama controller.execute()<br/>5. Trata erros → HTTP response"]
    LS3["lambdaS3Adapter<br/><br/>1. Resolve Handler via Registry<br/>2. Itera S3 Records<br/>3. Extrai fileKey<br/>4. Chama handler.handle()"]
    LSQS["lambdaSQSAdapter<br/><br/>1. Resolve Consumer via Registry<br/>2. Itera SQS Records<br/>3. JSON.parse do body<br/>4. Chama consumer.process()"]
  end

  subgraph APP["Application Layer"]
    CTRL["Controller<br/><i>extends Controller&lt;TType, TBody&gt;</i>"]
    FEH["IFileEventHandler<br/><i>handle(fileKey)</i>"]
    QC["IQueueConsumer&lt;TMessage&gt;<br/><i>process(message)</i>"]
  end

  APIGW --> LHA
  S3EV --> LS3
  SQSEV --> LSQS

  LHA --> CTRL
  LS3 --> FEH
  LSQS --> QC

  style TRIGGERS fill:#e3f2fd,stroke:#1565c0
  style ADAPTERS fill:#fff3e0,stroke:#e65100
  style APP fill:#e8f5e9,stroke:#2e7d32
```

## 4. Saga Pattern - SignUp

```mermaid
sequenceDiagram
  participant C as SignUpController
  participant UC as SignUpUseCase
  participant S as Saga
  participant AR as AccountRepository
  participant AG as AuthGateway (Cognito)
  participant UOW as SignUpUnitOfWork (DynamoDB)

  C->>UC: execute({ email, password, profile })
  UC->>S: saga.run(async () => { ... })

  Note over S: Inicia bloco protegido pela Saga

  UC->>AR: findByEmail(email)
  AR-->>UC: null (email livre)

  Note over UC: Cria Account, Profile, Goal entities<br/>GoalCalculator.calculate(profile)

  UC->>AG: signUp({ email, password, internalId })
  AG-->>UC: { externalId }

  UC->>S: addCompensation(() => deleteUser(externalId))
  Note over S: Se algo falhar daqui pra frente,<br/>deleta usuario do Cognito

  UC->>UOW: run({ account, profile, goal })
  Note over UOW: TransactWriteCommand<br/>3 PutItems atomicos

  alt TransactWrite FALHA
    UOW-->>S: throw Error
    S->>AG: deleteUser(externalId)
    Note over AG: Compensacao: remove do Cognito
    S-->>UC: throw Error
  else TransactWrite OK
    UOW-->>UC: OK
    UC->>AG: signIn({ email, password })
    AG-->>UC: { accessToken, refreshToken }
    UC-->>C: { accessToken, refreshToken }
  end
```

## 5. Dependency Injection - Cadeia de Resolucao

```mermaid
flowchart TB
  REG["Registry.resolve(SignUpController)"]

  REG --> SC["SignUpController"]
  SC --> SUC["SignUpUseCase"]

  SUC --> AG["AuthGateway"]
  SUC --> AR["AccountRepository"]
  SUC --> UOW["SignUpUnitOfWork"]
  SUC --> SAGA["Saga"]

  AG --> AC1["AppConfig"]
  AR --> AC2["AppConfig"]

  UOW --> AR2["AccountRepository"]
  UOW --> PR["ProfileRepository"]
  UOW --> GR["GoalRepository"]

  AR2 --> AC3["AppConfig"]
  PR --> AC4["AppConfig"]
  GR --> AC5["AppConfig"]

  AC1 --> ENV["env.ts (Zod parse)"]
  AC2 --> ENV
  AC3 --> ENV
  AC4 --> ENV
  AC5 --> ENV

  style REG fill:#f3e5f5,stroke:#6a1b9a
  style SC fill:#e3f2fd,stroke:#1565c0
  style SUC fill:#e8f5e9,stroke:#2e7d32
  style AG fill:#fff3e0,stroke:#e65100
  style AR fill:#fff3e0,stroke:#e65100
  style UOW fill:#fff3e0,stroke:#e65100
```

## 6. Template Method - Controller Base

```mermaid
flowchart TB
  subgraph BASE["Controller (classe abstrata)"]
    EX["execute(request)"]
    VB["validateBody(body)<br/><i>Busca @Schema via getSchema()</i>"]
    HD["handle(request)<br/><i>abstract - subclasse implementa</i>"]

    EX -->|"1. Valida"| VB
    VB -->|"2. Delega"| HD
  end

  subgraph SUB1["SignUpController"]
    H1["handle()<br/>→ signUpUseCase.execute()"]
  end

  subgraph SUB2["CreateMealController"]
    H2["handle()<br/>→ createMealUseCase.execute()"]
  end

  subgraph SUB3["GetMeController"]
    H3["handle()<br/>→ getProfileAndGoalQuery.execute()"]
  end

  HD -.->|"override"| H1
  HD -.->|"override"| H2
  HD -.->|"override"| H3

  style BASE fill:#f3e5f5,stroke:#6a1b9a
  style SUB1 fill:#e8f5e9,stroke:#2e7d32
  style SUB2 fill:#e8f5e9,stroke:#2e7d32
  style SUB3 fill:#e8f5e9,stroke:#2e7d32
```

## 7. Data Mapper - Entity ↔ DynamoDB Item

```mermaid
flowchart LR
  subgraph DOMAIN["Dominio"]
    MEAL["Meal<br/><br/>id: string<br/>accountId: string<br/>status: Meal.Status<br/>createdAt: Date<br/>foods: Food[]"]
  end

  subgraph MAPPER["MealItem (Data Mapper)"]
    FE["fromEntity(meal)<br/><i>Date → ISO string</i><br/><i>Gera PK/SK/GSI keys</i>"]
    TE["toEntity(item)<br/><i>ISO string → Date</i><br/><i>Remove PK/SK/GSI</i>"]
    TI["toItem()<br/><i>keys + attrs + type</i>"]
  end

  subgraph DYNAMO["DynamoDB Item"]
    ITEM["PK: ACCOUNT#x#MEAL#y<br/>SK: ACCOUNT#x#MEAL#y<br/>GSI1PK: MEALS#x#2026-04-03<br/>GSI1SK: MEAL#y<br/>type: Meal<br/>id: string<br/>status: string<br/>createdAt: string (ISO)<br/>foods: list"]
  end

  MEAL -->|"fromEntity()"| FE
  FE -->|"toItem()"| TI
  TI --> ITEM
  ITEM -->|"toEntity()"| TE
  TE --> MEAL

  style DOMAIN fill:#e8f5e9,stroke:#2e7d32
  style MAPPER fill:#fff3e0,stroke:#e65100
  style DYNAMO fill:#e3f2fd,stroke:#1565c0
```

## 8. Error Handling - Hierarquia

```mermaid
flowchart TB
  ERR["Error (JS nativo)"]

  ERR --> ZOD["ZodError<br/><i>Validacao de schema</i><br/>→ 400 VALIDATION"]
  ERR --> HTTP["HttpError<br/><i>statusCode + code + message</i>"]
  ERR --> APP["ApplicationError<br/><i>code + message + statusCode?</i>"]

  HTTP --> BR["BadRequest<br/>→ 400 BAD_REQUEST"]
  HTTP --> UA["Unauthorized<br/>→ 401 UNAUTHORIZED"]

  APP --> EAU["EmailAlreadyInUse<br/>→ 400"]
  APP --> IC["InvalidCredentials<br/>→ 401"]
  APP --> IRT["InvalidRefreshToken<br/>→ 401"]
  APP --> RNF["ResourceNotFound<br/>→ 404"]

  ERR --> UNK["Qualquer outro erro<br/>→ 500 INTERNAL_SERVER_ERROR"]

  subgraph HANDLER["lambdaHttpAdapter catch"]
    T1["instanceof ZodError?"]
    T2["instanceof HttpError?"]
    T3["instanceof ApplicationError?"]
    T4["fallback 500"]
  end

  ZOD -.-> T1
  HTTP -.-> T2
  APP -.-> T3
  UNK -.-> T4

  style ZOD fill:#fff9c4,stroke:#f9a825
  style HTTP fill:#ffccbc,stroke:#bf360c
  style APP fill:#ffccbc,stroke:#bf360c
  style UNK fill:#ef9a9a,stroke:#b71c1c
```

## 9. Strategy - Processamento de Refeicao por Tipo

```mermaid
flowchart TB
  PM["MealsAIGateway.processMeal(meal)"]

  PM -->|"meal.inputType?"| DEC{PICTURE ou AUDIO?}

  DEC -->|"PICTURE"| PIC_FLOW["Estrategia Imagem"]
  DEC -->|"AUDIO"| AUD_FLOW["Estrategia Audio"]

  subgraph PIC_FLOW_DETAIL["Estrategia: PICTURE"]
    P1["getFileURL(inputFileKey)"]
    P2["getImagePrompt()"]
    P3["callAI({ image_url, detail: high })"]
    P1 --> P2 --> P3
  end

  subgraph AUD_FLOW_DETAIL["Estrategia: AUDIO"]
    A1["getFileURL(inputFileKey)"]
    A2["downloadFileFromURL()"]
    A3["transcribe (gpt-4o-mini-transcribe)"]
    A4["getTextPrompt()"]
    A5["callAI({ text: transcricao })"]
    A1 --> A2 --> A3 --> A4 --> A5
  end

  PIC_FLOW --> PIC_FLOW_DETAIL
  AUD_FLOW --> AUD_FLOW_DETAIL

  PIC_FLOW_DETAIL --> RESULT["{ name, icon, foods[] }<br/><i>Validado com Zod</i>"]
  AUD_FLOW_DETAIL --> RESULT

  style PIC_FLOW_DETAIL fill:#e3f2fd,stroke:#1565c0
  style AUD_FLOW_DETAIL fill:#fff3e0,stroke:#e65100
  style RESULT fill:#e8f5e9,stroke:#2e7d32
```
