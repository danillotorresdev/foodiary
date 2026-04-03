# Foodiary API - Diagrama de Arquitetura

## 1. Camadas da Aplicacao

```mermaid
graph TB
  subgraph MAIN["main (Ponto de Entrada Lambda)"]
    direction TB
    LHA["lambdaHttpAdapter<br/><i>API Gateway v2 → Controller</i>"]
    LS3A["lambdaS3Adapter<br/><i>S3 Event → IFileEventHandler</i>"]
    LSQSA["lambdaSQSAdapter<br/><i>SQS Event → IQueueConsumer</i>"]

    subgraph FUNCTIONS["functions/"]
      F_AUTH["signUp · signIn · refreshToken<br/>forgotPassword · confirmForgotPassword"]
      F_MEALS_HTTP["createMeal · listMealsByDay<br/>getMealById"]
      F_MEALS_ASYNC["onMealFileUploaded<br/>processMeal"]
      F_ACCOUNTS["getMe"]
      F_PROFILES["updateProfile"]
      F_GOALS["updateGoal"]
      F_COGNITO["preSignUpTrigger<br/>preTokenGenerationTrigger<br/>customMessageTrigger"]
    end

    F_AUTH --> LHA
    F_MEALS_HTTP --> LHA
    F_ACCOUNTS --> LHA
    F_PROFILES --> LHA
    F_GOALS --> LHA
    F_MEALS_ASYNC --> LS3A
    F_MEALS_ASYNC --> LSQSA
  end

  subgraph APPLICATION["application (Logica de Negocio)"]
    direction TB
    subgraph CONTROLLERS["Controllers"]
      C_AUTH["SignUpController<br/>SignInController<br/>RefreshTokenController<br/>ForgotPasswordController<br/>ConfirmForgotPasswordController"]
      C_MEALS["CreateMealController<br/>ListMealsByDayController<br/>GetMealByIdController"]
      C_ACCOUNTS["GetMeController"]
      C_PROFILES["UpdateProfileController"]
      C_GOALS["UpdateGoalController"]
    end

    subgraph USECASES["Use Cases (Commands)"]
      UC_AUTH["SignUpUseCase<br/>SignInUseCase<br/>RefreshTokenUseCase<br/>ForgotPasswordUseCase<br/>ConfirmForgotPasswordUseCase"]
      UC_MEALS["CreateMealUseCase<br/>MealUploadedUseCase<br/>ProcessMealUseCase<br/>GetMealByIdUseCase"]
      UC_PROFILES["UpdateProfileUseCase"]
      UC_GOALS["UpdateGoalUseCase"]
    end

    subgraph QUERIES["Queries (Leituras CQRS)"]
      Q1["GetProfileAndGoalQuery"]
      Q2["ListMealsByDayQuery"]
    end

    subgraph ASYNC_HANDLERS["Handlers Assincronos"]
      EH["MealUploadedFileEventHandler"]
      QC["MealsQueueConsumer"]
    end

    subgraph DOMAIN["Dominio"]
      ENTITIES["Account · Profile · Goal · Meal"]
      SERVICES["GoalCalculator"]
      ERRORS["HttpError · ApplicationError<br/>EmailAlreadyInUse · InvalidCredentials<br/>ResourceNotFound · etc."]
    end

    C_AUTH --> UC_AUTH
    C_MEALS --> UC_MEALS
    C_ACCOUNTS --> Q1
    C_PROFILES --> UC_PROFILES
    C_GOALS --> UC_GOALS
    C_MEALS --> Q2
    EH --> UC_MEALS
    QC --> UC_MEALS
    UC_AUTH --> ENTITIES
    UC_AUTH --> SERVICES
    UC_MEALS --> ENTITIES
  end

  subgraph INFRA["infra (Implementacoes Externas)"]
    direction TB
    subgraph REPOS["Repositories"]
      R1["AccountRepository"]
      R2["ProfileRepository"]
      R3["GoalRepository"]
      R4["MealRepository"]
    end

    subgraph ITEMS["Data Mappers (Items)"]
      I1["AccountItem"]
      I2["ProfileItem"]
      I3["GoalItem"]
      I4["MealItem"]
    end

    subgraph GATEWAYS["Gateways"]
      GW_AUTH["AuthGateway<br/><i>→ Cognito</i>"]
      GW_STORAGE["MealsFileStorageGateway<br/><i>→ S3</i>"]
      GW_QUEUE["MealsQueueGateway<br/><i>→ SQS</i>"]
      GW_AI["MealsAIGateway<br/><i>→ OpenAI</i>"]
    end

    UOW["SignUpUnitOfWork<br/><i>TransactWrite atomico</i>"]
    EMAILS["React Email Templates<br/><i>ForgotPassword</i>"]

    REPOS --> ITEMS
  end

  subgraph KERNEL_SHARED["kernel + shared (Base)"]
    direction TB
    REGISTRY["Registry<br/><i>Container DI Singleton</i>"]
    DEC_INJ["@Injectable()"]
    DEC_SCH["@Schema()"]
    APP_CONFIG["AppConfig<br/><i>Configuracoes tipadas</i>"]
    SAGA["Saga<br/><i>Compensacao distribuida</i>"]
    ENV["env.ts<br/><i>Validacao Zod das env vars</i>"]
  end

  LHA --> CONTROLLERS
  LS3A --> ASYNC_HANDLERS
  LSQSA --> ASYNC_HANDLERS
  UC_AUTH --> REPOS
  UC_AUTH --> GATEWAYS
  UC_AUTH --> UOW
  UC_AUTH --> SAGA
  UC_MEALS --> REPOS
  UC_MEALS --> GATEWAYS
  UC_PROFILES --> REPOS
  UC_GOALS --> REPOS
  Q1 -.->|"DynamoDB direto"| ITEMS
  Q2 -.->|"DynamoDB direto"| ITEMS
  GATEWAYS --> APP_CONFIG
  REPOS --> APP_CONFIG

  style MAIN fill:#e3f2fd,stroke:#1565c0
  style APPLICATION fill:#e8f5e9,stroke:#2e7d32
  style INFRA fill:#fff3e0,stroke:#e65100
  style KERNEL_SHARED fill:#f3e5f5,stroke:#6a1b9a
  style DOMAIN fill:#e8f5e9,stroke:#1b5e20
```

## 2. Estrutura de Pastas

```mermaid
graph LR
  ROOT["foodiary-api/"]

  ROOT --> SLS["sls/"]
  ROOT --> SRC["src/"]
  ROOT --> CONF["serverless.yml<br/>tsconfig.json<br/>package.json"]

  SLS --> SLS_CONFIG["config/<br/>env.yml · role.yml"]
  SLS --> SLS_FUNC["functions/<br/>auth · meals · accounts<br/>profiles · goals"]
  SLS --> SLS_RES["resources/<br/>MainTable · UserPool<br/>MealsBucket · MealsBucketCDN<br/>MealsQueue · DLQAlarmsTopic<br/>APIGWCustomDomain"]

  SRC --> KERNEL["kernel/<br/>di/Registry<br/>decorators/Injectable · Schema"]
  SRC --> SHARED["shared/<br/>config/AppConfig · env<br/>saga/Saga<br/>types · utils"]
  SRC --> APP["application/<br/>contracts · entities<br/>controllers · usecases<br/>query · queues · events<br/>services · errors"]
  SRC --> INF["infra/<br/>clients · database/dynamo<br/>gateways · ai · emails"]
  SRC --> MN["main/<br/>adapters · functions · utils"]

  style ROOT fill:#f5f5f5,stroke:#333
  style SLS fill:#fff3e0,stroke:#e65100
  style SRC fill:#e3f2fd,stroke:#1565c0
```

## 3. DynamoDB - Single Table Design

```mermaid
erDiagram
  MainTable {
    string PK "Partition Key (HASH)"
    string SK "Sort Key (RANGE)"
    string GSI1PK "Global Secondary Index 1 PK"
    string GSI1SK "Global Secondary Index 1 SK"
    string type "Account | Profile | Goal | Meal"
  }

  Account {
    string PK "ACCOUNT#{id}"
    string SK "ACCOUNT#{id}"
    string GSI1PK "ACCOUNT#{email}"
    string GSI1SK "ACCOUNT#{email}"
    string id
    string email
    string externalId "Cognito sub"
    string createdAt
  }

  Profile {
    string PK "ACCOUNT#{accountId}"
    string SK "ACCOUNT#{accountId}#PROFILE"
    string name
    string birthDate
    string gender "MALE | FEMALE"
    number height
    number weight
    string activityLevel
    string goal "LOSE | MAINTAIN | GAIN"
  }

  Goal {
    string PK "ACCOUNT#{accountId}"
    string SK "ACCOUNT#{accountId}#GOAL"
    number calories
    number proteins
    number carbohydrates
    number fats
  }

  Meal {
    string PK "ACCOUNT#{accountId}#MEAL#{mealId}"
    string SK "ACCOUNT#{accountId}#MEAL#{mealId}"
    string GSI1PK "MEALS#{accountId}#YYYY-MM-DD"
    string GSI1SK "MEAL#{mealId}"
    string status "UPLOADING|QUEUED|PROCESSING|SUCCESS|FAILED"
    string inputType "AUDIO | PICTURE"
    string inputFileKey
    string name
    string icon
    json foods
  }

  MainTable ||--o{ Account : "armazena"
  MainTable ||--o{ Profile : "armazena"
  MainTable ||--o{ Goal : "armazena"
  MainTable ||--o{ Meal : "armazena"
```
